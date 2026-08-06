import { Client, Databases, Query, ID } from 'node-appwrite';
import { createAdminClient } from './server/appwrite';

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
		
		if (order.estado !== 'pagado') {
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

			// Devengo 2: Referido (Anti-fraude: Validar que no sea autoreferido ni la misma persona)
			const isSelfReferral = customerProfileId && customerProfileId === referrerProfileId;
			if (referrerProfileId && referrerProfileId !== pickupProfileId && !isSelfReferral) {
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

export async function cancelarOrdenYRestaurarStock(orderId: string) {
	try {
		const order = await db.getDocument('urbanpoint', 'orders', orderId);
		if (order.estado === 'cancelado') {
			return { success: true, alreadyCancelled: true };
		}

		// 1. Restaurar stock de productos
		const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
			Query.equal('order_id', orderId)
		]);

		for (const item of itemsRes.documents) {
			const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id.$id;
			try {
				const product = await db.getDocument('urbanpoint', 'products', productId);
				const nuevoStock = (product.stock || 0) + item.cantidad;
				await db.updateDocument('urbanpoint', 'products', productId, {
					stock: nuevoStock
				});
			} catch (e) {
				console.warn(`No se pudo restaurar el stock del producto ${productId}:`, e);
			}
		}

		// 2. Anular / Cancelar comisiones pendientes asociadas a la orden
		const ledgersRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
			Query.equal('order_id', orderId)
		]);

		for (const ledger of ledgersRes.documents) {
			if (ledger.estado === 'pendiente') {
				await db.updateDocument('urbanpoint', 'commission_ledger', ledger.$id, {
					estado: 'cancelado',
					motivo: `Cancelado por anulación de Orden #${orderId}`
				});
			}
		}

		// 3. Cambiar estado de la orden a cancelado
		await db.updateDocument('urbanpoint', 'orders', orderId, {
			estado: 'cancelado'
		});

		return { success: true };
	} catch (error: any) {
		console.error("Error al cancelar orden y restaurar stock:", error);
		throw error;
	}
}
