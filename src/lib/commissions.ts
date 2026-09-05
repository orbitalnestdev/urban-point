import { Client, Databases, Query, ID } from 'node-appwrite';
import { createAdminClient, escribirDocumentoTolerante } from './server/appwrite';
import { estaPago } from './orderStates';
import { unidadesQueMueve } from './combos';
import { intentarReclamar, liberar } from './server/locks';

const db = new Proxy({} as Databases, {
	get(_target, prop: keyof Databases) {
		const instance = createAdminClient().databases;
		const val = instance[prop];
		return typeof val === 'function' ? val.bind(instance) : val;
	}
});

/**
 * Qué unidades de inventario mueve vender `cantidad` de este producto.
 *
 * Un combo no tiene stock propio: lo que sale del depósito son sus
 * integrantes. Sin esta expansión, vender un "Combo Desayuno" no bajaba ni un
 * café ni una medialuna y el inventario mentía.
 */
export async function unidadesDeInventario(
	productId: string,
	cantidad: number
): Promise<Array<{ productId: string; cantidad: number }>> {
	let producto: any = null;
	try {
		producto = await db.getDocument('urbanpoint', 'products', productId);
	} catch {
		// Producto borrado: se mueve su propio stock y que falle ahí, no acá.
		return [{ productId, cantidad }];
	}

	return unidadesQueMueve(producto, cantidad);
}

/**
 * Descuenta unidades del stock de un producto de forma atómica.
 *
 * Antes era `getDocument` + `updateDocument` con el nuevo valor calculado en
 * memoria. Entre la lectura y la escritura cabe otra orden: dos compras
 * simultáneas de la última unidad leían el mismo stock, escribían el mismo
 * resultado y se vendían las dos.
 *
 * `decrementDocumentAttribute` resuelve el decremento del lado de Appwrite, en
 * una sola operación, y con `min: 0` falla en vez de dejar stock negativo. Ese
 * error es justamente la señal de sobreventa: se propaga para que quien llama
 * decida (hoy, dejar registro y seguir con el resto de los ítems).
 *
 * Un combo se expande antes en sus integrantes: es lo que realmente sale del
 * depósito.
 */
export async function descontarStock(productId: string, cantidad: number) {
	if (!(cantidad > 0)) return;

	for (const u of await unidadesDeInventario(productId, cantidad)) {
		await db.decrementDocumentAttribute(
			'urbanpoint',
			'products',
			u.productId,
			'stock',
			u.cantidad,
			0
		);
	}
}

/** Devuelve unidades al stock. Contraparte de descontarStock. */
export async function restaurarStock(productId: string, cantidad: number) {
	if (!(cantidad > 0)) return;

	for (const u of await unidadesDeInventario(productId, cantidad)) {
		await db.incrementDocumentAttribute(
			'urbanpoint',
			'products',
			u.productId,
			'stock',
			u.cantidad
		);
	}
}

// Función pura extraída para usar en el webhook y en el simulador
export async function evaluateCommissionRule(dbInstance: Databases, canillitaId: string | null, categoryId: string | null) {
	const rulesToEvaluate = [
		// 1. canillita_categoria
		canillitaId && categoryId ? [Query.equal('alcance', 'canillita_categoria'), Query.equal('canillita_id', canillitaId), Query.equal('categoria_id', categoryId)] : null,
		// 2. canillita
		canillitaId ? [Query.equal('alcance', 'canillita'), Query.equal('canillita_id', canillitaId)] : null,
		// 3. categoria
		categoryId ? [Query.equal('alcance', 'categoria'), Query.equal('categoria_id', categoryId)] : null,
		// 4. default
		[Query.equal('alcance', 'default')]
	].filter(Boolean) as string[][];

	for (const ruleQuery of rulesToEvaluate) {
		const rulesRes = await dbInstance.listDocuments('urbanpoint', 'commission_rules', [
			...ruleQuery,
			Query.equal('activo', true),
			Query.orderDesc('$createdAt'),
			Query.limit(1)
		]);
		
		if (rulesRes.documents.length > 0) {
			return rulesRes.documents[0];
		}
	}
	return null;
}

export function calculateAmount(baseCents: number, rule: any) {
	if (rule.tipo === 'porcentaje') {
		return Math.round((baseCents * rule.valor) / 10000);
	} else if (rule.tipo === 'monto_fijo') {
		return rule.valor;
	}
	return 0;
}

export async function resolverComisiones(orderId: string) {
	try {
		const order = await db.getDocument('urbanpoint', 'orders', orderId);
		
		// Acepta cualquier estado posterior al cobro, no sólo 'pagado' exacto:
		// una orden que ya avanzó a preparando/en_punto sigue teniendo su pago
		// acreditado y debe poder devengar si algo quedó pendiente.
		if (!estaPago(order.estado)) {
			throw new Error('La orden no está pagada.');
		}

		// Evitar re-procesamiento duplicado de comisiones para la misma orden
		const existingLedgers = await db.listDocuments('urbanpoint', 'commission_ledger', [
			Query.equal('order_id', orderId),
			Query.limit(1)
		]);
		if (existingLedgers.documents.length > 0 || order.stock_descontado) {
			console.log(`Comisiones ya procesadas anteriormente para la orden ${orderId}`);
			return { success: true, alreadyProcessed: true };
		}

		// El check de arriba es "leer, después actuar": dos entregas casi
		// simultáneas del webhook (o el webhook corriendo en paralelo con un
		// admin confirmando el pago a mano) pueden pasarlo las dos antes de que
		// cualquiera escriba, y cada una genera su propio juego de asientos —
		// doble comisión por la misma venta. Este reclamo sí es atómico (ver
		// src/lib/server/locks.ts): sólo una de las dos llamadas gana.
		const reclamado = await intentarReclamar(`commission:${orderId}`, 'resolverComisiones');
		if (!reclamado) {
			console.log(`Otra ejecución ya está resolviendo las comisiones de la orden ${orderId}.`);
			return { success: true, alreadyProcessed: true };
		}

		const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
			Query.equal('order_id', orderId),
			Query.limit(500)
		]);

		// El descuento de stock corre para TODOS los niveles de precio. Antes
		// estaba después del corte por tier: los pedidos canillita/distribuidor
		// se pagaban y entregaban sin tocar inventario (y al cancelarse, el
		// stock se "restauraba" inflándolo con unidades nunca descontadas).
		const sobreventas: string[] = [];
		for (const item of itemsRes.documents) {
			const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id?.$id;
			if (!productId) continue;
			try {
				await descontarStock(productId, item.cantidad);
			} catch (e) {
				// Con `min: 0`, Appwrite rechaza el decremento que dejaría el
				// stock en negativo. Es la señal de sobreventa: el pago entró
				// pero no hay unidades. No se aborta el resto de los ítems —
				// el pedido ya está cobrado— pero queda anotado en la orden
				// para que operaciones lo vea y resuelva.
				sobreventas.push(`${item.nombre_snapshot || productId} x${item.cantidad}`);
				console.error(
					`SOBREVENTA: no hay stock para descontar ${item.cantidad} de ${productId} (orden ${orderId}).`,
					e
				);
			}
		}

		if (sobreventas.length > 0) {
			await escribirDocumentoTolerante('orders', {
				alerta_stock: `Sin stock al acreditarse el pago: ${sobreventas.join('; ')}`
			}, orderId).catch(() => {});
		}

		// Marca de idempotencia para pedidos que no generan asientos (tiers sin
		// comisión o sin regla aplicable). Si el atributo booleano
		// 'stock_descontado' no existe en la colección orders, se loguea y se
		// sigue: el guard por transición de estado cubre el caso normal.
		try {
			await escribirDocumentoTolerante('orders', { stock_descontado: true }, orderId);
		} catch (e) {
			console.warn(`No se pudo marcar stock_descontado en la orden ${orderId} (agregá el atributo booleano a la colección orders):`);
		}

		// DECISIÓN CERRADA 1: Comisión y margen son excluyentes.
		// Solo los pedidos con price_tier = 'publico' generan asiento en commission_ledger.
		// Los pedidos a precio canillita o distribuidor tienen comisión cero, sin excepción.
		const priceTier = order.price_tier || 'publico';
		if (priceTier !== 'publico') {
			await escribirDocumentoTolerante('orders', {
				comision_total_centavos: 0
			}, orderId);
			console.log(`Orden ${orderId} en nivel '${priceTier}': comisión 0 (excluyente con margen). Stock descontado.`);
			return { success: true, zeroCommissionTier: priceTier };
		}

		// Identificar al comprador si existe
		const customerProfileId = order.customer_id ? (typeof order.customer_id === 'string' ? order.customer_id : order.customer_id.$id) : null;

		// 1. Determinar quién es el canillita de retiro (Fee de Logística)
		let pickupProfileId: string | null = null;
		if (order.pickup_point_id) {
			// Si el punto se borró (deletePickupPoint no valida pedidos en
			// curso), este 404 tiraba toda la función — incluida la comisión de
			// referido, que no depende del punto — y la orden quedaba pagada
			// sin ningún asiento de comisión, sin reintento posible.
			try {
				const pickupPoint = await db.getDocument('urbanpoint', 'pickup_points', typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id.$id);
				if (pickupPoint.profile_id) {
					pickupProfileId = typeof pickupPoint.profile_id === 'string' ? pickupPoint.profile_id : pickupPoint.profile_id.$id;
				}
			} catch (e) {
				console.warn(`Punto de retiro ${order.pickup_point_id} de la orden ${orderId} ya no existe; se sigue sin comisión de logística.`, e);
			}
		}

		// 2. Determinar quién refirió la compra (Comisión por Referido)
		let referrerProfileId: string | null = null;
		if (order.referral_code_id) {
			try {
				const codeDoc = await db.getDocument('urbanpoint', 'referral_codes', typeof order.referral_code_id === 'string' ? order.referral_code_id : order.referral_code_id.$id);
				referrerProfileId = typeof codeDoc.owner_id === 'string' ? codeDoc.owner_id : codeDoc.owner_id.$id;
			} catch (e) {
				console.warn("Código de referido no encontrado para orden", orderId);
			}
		}

		let totalComissionCents = 0;

		for (const item of itemsRes.documents) {
			const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id.$id;
			const product = await db.getDocument('urbanpoint', 'products', productId);
			const categoryId = product.categoria_id ? (typeof product.categoria_id === 'string' ? product.categoria_id : product.categoria_id.$id) : null;
			
			const baseCents = item.subtotal || (item.precio_unitario * item.cantidad);

			// Devengo 1: Logística
			if (pickupProfileId) {
				const rule = await evaluateCommissionRule(db, pickupProfileId, categoryId);
				if (rule) {
					const cents = calculateAmount(baseCents, rule);
					if (cents > 0) {
						totalComissionCents += cents;
						await escribirDocumentoTolerante('commission_ledger', {
							profile_id: pickupProfileId,
							order_id: orderId,
							tipo: 'fee_logistica',
							estado: 'pendiente',
							monto_centavos: cents,
							// tasa_bp_snapshot está pensado para un % (0-10000 bp) y así lo
							// tipó el esquema; en una regla monto_fijo, rule.valor son
							// centavos (potencialmente muy por encima de ese rango) — sólo
							// se guarda cuando de verdad es una tasa, para no arriesgar el
							// asiento entero por un valor fuera de rango en un campo que
							// es sólo de auditoría.
							...(rule.tipo !== 'monto_fijo' ? { tasa_bp_snapshot: rule.valor } : {}),
							motivo: `Fee logística por item ${product.nombre}`
						});
					}
				}
			}

			// Devengo 2: Referido (Anti-fraude: Validar que no sea autoreferido del mismo comprador)
			const isSelfReferral = customerProfileId && customerProfileId === referrerProfileId;
			// Si el referido es el mismo dueño del punto de retiro, ya cobró el
			// fee de logística por este ítem: acreditarle además la comisión de
			// referido duplicaba el pago al mismo perfil por la misma venta.
			const yaCobraLogistica = pickupProfileId && pickupProfileId === referrerProfileId;
			if (referrerProfileId && !isSelfReferral && !yaCobraLogistica) {
				const rule = await evaluateCommissionRule(db, referrerProfileId, categoryId);
				if (rule) {
					const cents = calculateAmount(baseCents, rule);
					if (cents > 0) {
						totalComissionCents += cents;
						await escribirDocumentoTolerante('commission_ledger', {
							profile_id: referrerProfileId,
							order_id: orderId,
							tipo: 'comision_referido',
							estado: 'pendiente',
							monto_centavos: cents,
							...(rule.tipo !== 'monto_fijo' ? { tasa_bp_snapshot: rule.valor } : {}),
							motivo: `Referido venta de ${product.nombre}`
						});
					}
				}
			}
		}
		
		// Guardar total de comisiones generadas en la orden
		await escribirDocumentoTolerante('orders', {
			comision_total_centavos: totalComissionCents
		}, orderId);

		console.log(`Comisiones devengadas y stock actualizado con éxito para la orden ${orderId}`);
		return { success: true };
	} catch (error) {
		console.error("Error al resolver comisiones:", error);
		throw error;
	}
}

/**
 * Revierte los devengos de comisión de una orden. [A-02]
 *
 * El ledger es contable: no se borra ni se reescribe el monto de un asiento.
 * Por cada devengo vivo se inserta un asiento compensatorio de tipo `reversa`
 * con monto negativo, y el original pasa a `revertido` para que deje de contar
 * como liquidable.
 *
 * Antes se escribía estado 'cancelado', un valor que NO existe en el enum
 * (pendiente|disponible|liquidado|revertido), así que Appwrite rechazaba el
 * update: la comisión quedaba viva sobre una venta anulada.
 */
export async function revertirComisiones(orderId: string, motivo: string) {
	const ledgersRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
		Query.equal('order_id', orderId),
		Query.limit(500)
	]);

	let revertidos = 0;

	for (const asiento of ledgersRes.documents) {
		// Idempotencia: si ya se revirtió, no se vuelve a compensar.
		if (asiento.estado === 'revertido' || asiento.tipo === 'reversa') continue;

		const profileId = typeof asiento.profile_id === 'string' ? asiento.profile_id : asiento.profile_id?.$id;

		if (asiento.estado === 'liquidado') {
			// La plata de este asiento ya salió (hay un payout real). Pisarlo a
			// 'revertido' borraría el registro de que se pagó — el payout queda
			// sin ningún asiento que lo explique — y ese dinero nunca se
			// recupera de ningún lado, porque liquidarComisiones sólo suma
			// asientos 'disponible'. En cambio: se deja el asiento original tal
			// cual (es historia real) y se genera una deuda que se descuenta
			// sola de la PRÓXIMA liquidación de este canillita.
			//
			// tipo 'ajuste', no 'reversa': liquidarComisiones y getCanillitaStats
			// excluyen explícitamente todo lo que sea tipo 'reversa' de la suma
			// (son sólo auditoría) — con ese tipo la deuda quedaría "disponible"
			// pero invisible para el cálculo real, y nunca se descontaría de nada.
			await escribirDocumentoTolerante('commission_ledger', {
				profile_id: profileId,
				order_id: orderId,
				tipo: 'ajuste',
				estado: 'disponible',
				monto_centavos: -(asiento.monto_centavos || 0),
				motivo: `${motivo} (ya liquidado — se descuenta de la próxima liquidación)`
			});
		} else {
			await escribirDocumentoTolerante('commission_ledger', {
				profile_id: profileId,
				order_id: orderId,
				tipo: 'reversa',
				estado: 'revertido',
				monto_centavos: -(asiento.monto_centavos || 0),
				motivo
			});

			await escribirDocumentoTolerante('commission_ledger', {
				estado: 'revertido'
			}, asiento.$id);
		}

		revertidos++;
	}

	return revertidos;
}

/**
 * Confirma las comisiones asociadas a una orden al ser entregada al cliente.
 * Pasa los asientos de estado 'pendiente' a 'disponible' (confirmada).
 */
export async function confirmarComisionesDeOrden(orderId: string) {
	const ledgersRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
		Query.equal('order_id', orderId),
		Query.limit(500)
	]);

	let confirmados = 0;
	for (const asiento of ledgersRes.documents) {
		if (asiento.estado === 'pendiente') {
			await escribirDocumentoTolerante('commission_ledger', {
				estado: 'disponible'
			}, asiento.$id);
			confirmados++;
		}
	}
	return confirmados;
}

export interface CanillitaStats {
	comisionesMesCentavos: number;
	totalPendienteCentavos: number;
	totalLiquidadoCentavos: number;
	ventasAtribuidasMesCount: number;
	entregasPendientesCount: number;
}

/**
 * Función única de servidor para calcular estadísticas y métricas del canillita.
 * Utilizada tanto por el Panel de Canillita (/canillita) como por el Panel de Administración.
 */
export async function getCanillitaStats(profileId: string): Promise<CanillitaStats> {
	// 1 + 2 en paralelo: puntos de retiro e historial de comisiones
	const [pointsRes, ledgerRes] = await Promise.all([
		db.listDocuments('urbanpoint', 'pickup_points', [
			Query.equal('profile_id', profileId),
			Query.limit(50)
		]),
		db.listDocuments('urbanpoint', 'commission_ledger', [
			Query.equal('profile_id', profileId),
			Query.orderDesc('$createdAt'),
			Query.limit(1000)
		])
	]);
	const pickupPointIds = pointsRes.documents.map(p => p.$id);
	const ledgers = ledgerRes.documents;

	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

	// Comisiones del mes en curso (asientos vivos creados este mes)
	const comisionesMesCentavos = ledgers
		.filter(l => {
			if (l.tipo === 'reversa' || l.tipo === 'liquidacion' || l.estado === 'revertido') return false;
			const createdTime = new Date(l.$createdAt).getTime();
			return createdTime >= startOfMonth;
		})
		.reduce((acc, l) => acc + (l.monto_centavos || 0), 0);

	// Total pendiente de liquidación (devengado/confirmado y no pagado)
	const totalPendienteCentavos = ledgers
		.filter(l => (l.estado === 'pendiente' || l.estado === 'disponible') && l.tipo !== 'reversa')
		.reduce((acc, l) => acc + (l.monto_centavos || 0), 0);

	// Total ya liquidado histórico
	const totalLiquidadoCentavos = ledgers
		.filter(l => l.estado === 'liquidado' && l.tipo !== 'reversa')
		.reduce((acc, l) => acc + (l.monto_centavos || 0), 0);

	// Ventas atribuidas en el mes en curso (pedidos únicos vivos)
	const orderIdsThisMonth = new Set(
		ledgers
			.filter(l => {
				if (l.tipo === 'reversa' || l.estado === 'revertido') return false;
				return new Date(l.$createdAt).getTime() >= startOfMonth;
			})
			.map(l => typeof l.order_id === 'string' ? l.order_id : l.order_id?.$id)
			.filter(Boolean)
	);
	const ventasAtribuidasMesCount = orderIdsThisMonth.size;

	// Entregas pendientes en su punto de retiro: se filtra por estado en la
	// query y se usa el total del servidor, sin transferir los documentos.
	let entregasPendientesCount = 0;
	if (pickupPointIds.length > 0) {
		const pendingOrdersRes = await db.listDocuments('urbanpoint', 'orders', [
			Query.equal('pickup_point_id', pickupPointIds),
			Query.equal('estado', ['pagado', 'preparando', 'en_punto']),
			Query.limit(1)
		]);
		entregasPendientesCount = pendingOrdersRes.total;
	}

	return {
		comisionesMesCentavos,
		totalPendienteCentavos,
		totalLiquidadoCentavos,
		ventasAtribuidasMesCount,
		entregasPendientesCount
	};
}

export interface LiquidacionInput {
	profileId: string;
	medioPago: string;
	referenciaPago: string;
	idempotencyKey: string;
	actorProfileId: string;
	/** Si se informa, debe coincidir con el total pendiente calculado. */
	montoCentavosEsperado?: number;
	notas?: string;
}

/**
 * Liquida las comisiones pendientes de un canillita. [A-03]
 */
export async function liquidarComisiones(input: LiquidacionInput) {
	// Idempotencia: reintentar la misma liquidación no puede pagar dos veces.
	const previo = await db.listDocuments('urbanpoint', 'payouts', [
		Query.equal('idempotency_key', input.idempotencyKey),
		Query.limit(1)
	]);
	if (previo.documents.length > 0) {
		return {
			payoutId: previo.documents[0].$id,
			montoCentavos: previo.documents[0].monto_centavos,
			idempotencySkipped: true
		};
	}

	// El check de arriba es "leer, después actuar": dos admins (o el mismo en
	// dos pestañas, o un reintento de red) liquidando el mismo saldo casi al
	// mismo tiempo pueden pasarlo los dos antes de que cualquiera escriba, y
	// cada uno crea su propio payout por el saldo completo — doble pago. Este
	// reclamo sí es atómico (ver src/lib/server/locks.ts). Se libera en el
	// catch: a diferencia de resolverComisiones, la idempotencyKey acá puede
	// legítimamente reintentarse si esta liquidación en particular falla.
	const claveReclamo = `payout:${input.idempotencyKey}`;
	const reclamado = await intentarReclamar(claveReclamo, 'liquidarComisiones');
	if (!reclamado) {
		throw new Error('Ya hay una liquidación en curso para este mismo pedido de pago. Esperá unos segundos y refrescá.');
	}

	try {
		// Sólo se paga lo confirmado ('disponible', es decir con pedido entregado).
		// Liquidar asientos 'pendiente' pagaba comisiones de pedidos que podían
		// cancelarse después, dejando la reversa contra un saldo ya cobrado.
		// Se pagina con cursor: el viejo limit(500) sin paginar liquidaba un
		// subconjunto arbitrario cuando había más asientos.
		const asientosDisponibles: any[] = [];
		let cursor: string | null = null;
		while (true) {
			const queries = [
				Query.equal('profile_id', input.profileId),
				Query.equal('estado', 'disponible'),
				Query.limit(100)
			];
			if (cursor) queries.push(Query.cursorAfter(cursor));
			const page = await db.listDocuments('urbanpoint', 'commission_ledger', queries);
			asientosDisponibles.push(...page.documents);
			if (page.documents.length < 100) break;
			cursor = page.documents[page.documents.length - 1].$id;
		}

		const pendientes = asientosDisponibles.filter(d => d.tipo !== 'reversa');

		if (pendientes.length === 0) {
			throw new Error('No hay comisiones confirmadas para liquidar. Las comisiones se confirman cuando el pedido se entrega.');
		}

		const montoCentavos = pendientes.reduce(
			(acc, cur) => acc + (cur.monto_centavos || 0),
			0
		);

		if (montoCentavos <= 0) {
			throw new Error('El saldo pendiente no es positivo: no hay nada que liquidar.');
		}

		if (
			input.montoCentavosEsperado !== undefined &&
			input.montoCentavosEsperado !== montoCentavos
		) {
			throw new Error(
				`El monto informado (${input.montoCentavosEsperado}) no coincide con el pendiente real (${montoCentavos}).`
			);
		}

		const fechas = pendientes.map((d) => new Date(d.$createdAt).getTime());
		const desde = new Date(Math.min(...fechas));
		const hasta = new Date(Math.max(...fechas));

		const payout = await escribirDocumentoTolerante('payouts', {
			profile_id: input.profileId,
			monto_centavos: montoCentavos,
			estado: 'pagado',
			periodo_desde: desde.toISOString(),
			periodo_hasta: hasta.toISOString(),
			periodo: hasta.toISOString().substring(0, 7),
			medio_pago: input.medioPago,
			referencia_pago: input.referenciaPago,
			pagado_at: new Date().toISOString(),
			idempotency_key: input.idempotencyKey,
			actor_id: input.actorProfileId,
			notas: input.notas || `Liquidación de ${pendientes.length} devengo(s)`
		});

		for (const asiento of pendientes) {
			await escribirDocumentoTolerante('commission_ledger', {
				estado: 'liquidado',
				payout_id: payout.$id
			}, asiento.$id);
		}

		return { payoutId: payout.$id, montoCentavos, idempotencySkipped: false };
	} catch (e) {
		await liberar(claveReclamo);
		throw e;
	}
}

/**
 * Devuelve al inventario las unidades de una orden cuyo stock ya se descontó.
 * Reutilizada por la cancelación y por el reembolso del webhook de MP (que
 * antes revertía comisiones pero nunca devolvía el stock).
 */
export async function restaurarStockDeOrden(orderId: string) {
	const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
		Query.equal('order_id', orderId),
		Query.limit(500)
	]);

	for (const item of itemsRes.documents) {
		const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id?.$id;
		if (!productId) continue;
		try {
			await restaurarStock(productId, item.cantidad);
		} catch (e) {
			console.warn(`No se pudo restaurar el stock del producto ${productId}:`, e);
		}
	}

	try {
		await escribirDocumentoTolerante('orders', { stock_descontado: false }, orderId);
	} catch (e) {
		// El atributo puede no existir en el esquema; no es bloqueante.
	}
}

export async function cancelarOrdenYRestaurarStock(orderId: string) {
	try {
		const order = await db.getDocument('urbanpoint', 'orders', orderId);
		if (order.estado === 'cancelado') {
			return { success: true, alreadyCancelled: true };
		}

		// 1. Revertir comisiones ANTES de tocar el stock. Si esto falla, la
		//    operación aborta sin haber dejado el inventario inflado: el orden
		//    inverso dejaba stock restaurado y comisiones vivas.
		await revertirComisiones(orderId, `Reversa por anulación de la orden ${orderId}`);

		// 2. Restaurar stock, sólo si llegó a descontarse. El descuento ocurre
		//    en resolverComisiones, que corre recién cuando la orden se paga:
		//    devolver stock de una orden nunca pagada inflaba el inventario.
		if (order.stock_descontado === true || order.estado !== 'pendiente_pago') {
			await restaurarStockDeOrden(orderId);
		}

		// 3. Recién ahora se marca la orden como cancelada.
		await escribirDocumentoTolerante('orders', {
			estado: 'cancelado'
		}, orderId);

		return { success: true };
	} catch (error: any) {
		console.error("Error al cancelar orden y restaurar stock:", error);
		throw error;
	}
}
