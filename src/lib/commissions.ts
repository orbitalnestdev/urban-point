import { Client, Databases, Query, ID } from 'node-appwrite';
import { createAdminClient } from './server/appwrite';
import { estaPago } from './orderStates';

const db = new Proxy({} as Databases, {
	get(_target, prop: keyof Databases) {
		const instance = createAdminClient().databases;
		const val = instance[prop];
		return typeof val === 'function' ? val.bind(instance) : val;
	}
});

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
			Query.equal('order_id', orderId)
		]);
		if (existingLedgers.documents.length > 0) {
			console.log(`Comisiones ya procesadas anteriormente para la orden ${orderId}`);
			return { success: true, alreadyProcessed: true };
		}

		const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
			Query.equal('order_id', orderId)
		]);

		// Identificar al comprador si existe
		const customerProfileId = order.customer_id ? (typeof order.customer_id === 'string' ? order.customer_id : order.customer_id.$id) : null;

		// 1. Determinar quién es el canillita de retiro (Fee de Logística)
		let pickupProfileId: string | null = null;
		if (order.pickup_point_id) {
			const pickupPoint = await db.getDocument('urbanpoint', 'pickup_points', typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id.$id);
			if (pickupPoint.profile_id) {
				pickupProfileId = typeof pickupPoint.profile_id === 'string' ? pickupPoint.profile_id : pickupPoint.profile_id.$id;
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

			// Descontar stock real del producto
			const nuevoStock = Math.max(0, (product.stock || 0) - item.cantidad);
			await db.updateDocument('urbanpoint', 'products', productId, {
				stock: nuevoStock
			});

			// Devengo 1: Logística
			if (pickupProfileId) {
				const rule = await evaluateCommissionRule(db, pickupProfileId, categoryId);
				if (rule) {
					const cents = calculateAmount(baseCents, rule);
					if (cents > 0) {
						totalComissionCents += cents;
						await db.createDocument('urbanpoint', 'commission_ledger', ID.unique(), {
							profile_id: pickupProfileId,
							order_id: orderId,
							tipo: 'fee_logistica',
							estado: 'pendiente',
							monto_centavos: cents,
							tasa_bp_snapshot: rule.valor,
							motivo: `Fee logística por item ${product.nombre}`
						});
					}
				}
			}

			// Devengo 2: Referido (Anti-fraude: Validar que no sea autoreferido del mismo comprador)
			const isSelfReferral = customerProfileId && customerProfileId === referrerProfileId;
			if (referrerProfileId && !isSelfReferral) {
				const rule = await evaluateCommissionRule(db, referrerProfileId, categoryId);
				if (rule) {
					const cents = calculateAmount(baseCents, rule);
					if (cents > 0) {
						totalComissionCents += cents;
						await db.createDocument('urbanpoint', 'commission_ledger', ID.unique(), {
							profile_id: referrerProfileId,
							order_id: orderId,
							tipo: 'comision_referido',
							estado: 'pendiente',
							monto_centavos: cents,
							tasa_bp_snapshot: rule.valor,
							motivo: `Referido venta de ${product.nombre}`
						});
					}
				}
			}
		}
		
		// Guardar total de comisiones generadas en la orden
		await db.updateDocument('urbanpoint', 'orders', orderId, {
			comision_total_centavos: totalComissionCents
		});

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

		await db.createDocument('urbanpoint', 'commission_ledger', ID.unique(), {
			profile_id: typeof asiento.profile_id === 'string' ? asiento.profile_id : asiento.profile_id?.$id,
			order_id: orderId,
			tipo: 'reversa',
			estado: 'revertido',
			monto_centavos: -(asiento.monto_centavos || 0),
			motivo
		});

		await db.updateDocument('urbanpoint', 'commission_ledger', asiento.$id, {
			estado: 'revertido'
		});

		revertidos++;
	}

	return revertidos;
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
 *
 * Fuente única. Antes convivían dos actions que escribían la misma colección
 * con nombres de campo distintos y ambas fallaban por motivos diferentes:
 * liquidateCommissions nunca guardaba profile_id, así que el payout quedaba
 * huérfano y no aparecía en "Mis Cobros" del canillita; y createPayout omitía
 * periodo_desde y periodo_hasta, que son requeridos, con lo que Appwrite
 * rechazaba el documento siempre.
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

	const pendientes = await db.listDocuments('urbanpoint', 'commission_ledger', [
		Query.equal('profile_id', input.profileId),
		Query.equal('estado', 'pendiente'),
		Query.limit(500)
	]);

	if (pendientes.documents.length === 0) {
		throw new Error('No hay comisiones pendientes de liquidar para este canillita.');
	}

	const montoCentavos = pendientes.documents.reduce(
		(acc, cur) => acc + (cur.monto_centavos || 0),
		0
	);

	if (montoCentavos <= 0) {
		throw new Error('El saldo pendiente no es positivo: no hay nada que liquidar.');
	}

	// El monto se calcula en el servidor. Si el admin informó uno distinto,
	// se aborta en vez de pagar una cifra que no cierra con el ledger.
	if (
		input.montoCentavosEsperado !== undefined &&
		input.montoCentavosEsperado !== montoCentavos
	) {
		throw new Error(
			`El monto informado (${input.montoCentavosEsperado}) no coincide con el pendiente real (${montoCentavos}).`
		);
	}

	const fechas = pendientes.documents.map((d) => new Date(d.$createdAt).getTime());
	const desde = new Date(Math.min(...fechas));
	const hasta = new Date(Math.max(...fechas));

	const payout = await db.createDocument('urbanpoint', 'payouts', ID.unique(), {
		profile_id: input.profileId,
		monto_centavos: montoCentavos,
		estado: 'pagado',
		// periodo_desde y periodo_hasta son requeridos en el esquema real.
		periodo_desde: desde.toISOString(),
		periodo_hasta: hasta.toISOString(),
		periodo: hasta.toISOString().substring(0, 7),
		medio_pago: input.medioPago,
		referencia_pago: input.referenciaPago,
		pagado_at: new Date().toISOString(),
		idempotency_key: input.idempotencyKey,
		actor_id: input.actorProfileId,
		notas: input.notas || `Liquidación de ${pendientes.documents.length} devengo(s)`
	});

	for (const asiento of pendientes.documents) {
		await db.updateDocument('urbanpoint', 'commission_ledger', asiento.$id, {
			estado: 'liquidado',
			payout_id: payout.$id
		});
	}

	return { payoutId: payout.$id, montoCentavos, idempotencySkipped: false };
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
		if (order.estado !== 'pendiente_pago') {
			const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
				Query.equal('order_id', orderId),
				Query.limit(500)
			]);

			for (const item of itemsRes.documents) {
				const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id.$id;
				try {
					const product = await db.getDocument('urbanpoint', 'products', productId);
					await db.updateDocument('urbanpoint', 'products', productId, {
						stock: (product.stock || 0) + item.cantidad
					});
				} catch (e) {
					console.warn(`No se pudo restaurar el stock del producto ${productId}:`, e);
				}
			}
		}

		// 3. Recién ahora se marca la orden como cancelada.
		await db.updateDocument('urbanpoint', 'orders', orderId, {
			estado: 'cancelado'
		});

		return { success: true };
	} catch (error: any) {
		console.error("Error al cancelar orden y restaurar stock:", error);
		throw error;
	}
}
