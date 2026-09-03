import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createAdminClient } from '../../../lib/server/appwrite';
import { env } from '../../../lib/server/env';
import { Query } from 'node-appwrite';
import { sendOrderNotificationEmails } from '../../../lib/server/mailer';
import {
	resolverComisiones,
	cancelarOrdenYRestaurarStock,
	revertirComisiones,
	restaurarStockDeOrden
} from '../../../lib/commissions';
import { obtenerTokenPlataformaValido } from '../../../lib/server/mercadopagoOAuth';


export const prerender = false;

const { databases: db } = createAdminClient();

/**
 * Valida la firma del webhook de Mercado Pago. [C-05]
 *
 * MP manda `x-signature: ts=<unix>,v1=<hmac>` y `x-request-id`. El manifiesto
 * firmado es `id:<data.id>;request-id:<request-id>;ts:<ts>;` con HMAC-SHA256
 * y el secreto del webhook.
 *
 * Antes no se validaba nada: cualquiera podía marcar pedidos como pagados.
 */
export function firmaValida(request: Request, dataId: string, secret: string): boolean {
	const signature = request.headers.get('x-signature');
	const requestId = request.headers.get('x-request-id');
	if (!signature) return false;

	const partes = Object.fromEntries(
		signature.split(',').map((p) => {
			const [k, ...v] = p.split('=');
			return [k.trim(), v.join('=').trim()];
		})
	);

	const ts = partes['ts'];
	const v1 = partes['v1'];
	if (!ts || !v1) return false;

	// Rechaza reenvíos viejos (ventana de 5 minutos).
	const edadSegundos = Math.abs(Date.now() / 1000 - Number(ts));
	if (!Number.isFinite(edadSegundos) || edadSegundos > 300) return false;

	// Según la especificación de MP, cada segmento del manifiesto se incluye
	// sólo si su valor existe, y data.id alfanumérico va en minúsculas.
	// Con `request-id:;` fijo, la firma nunca validaba cuando faltaba el header.
	let manifiesto = '';
	if (dataId) manifiesto += `id:${dataId.toLowerCase()};`;
	if (requestId) manifiesto += `request-id:${requestId};`;
	manifiesto += `ts:${ts};`;
	const esperado = crypto.createHmac('sha256', secret).update(manifiesto).digest('hex');

	const a = Buffer.from(esperado, 'utf8');
	const b = Buffer.from(v1, 'utf8');
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const body = await request.json().catch(() => ({} as any));

		const topic = url.searchParams.get('topic') || url.searchParams.get('type') || body?.type;
		const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id;

		if (topic !== 'payment' || !paymentId) {
			// Ping de prueba de MP u otro tópico que no nos interesa.
			return new Response('OK', { status: 200 });
		}

		const secret = env('MP_WEBHOOK_SECRET');
		if (!secret) {
			// Fail closed. Antes, si faltaba la variable, el handler aceptaba que
			// el paymentId fuera directamente el orderId y regalaba pedidos.
			console.error('MP_WEBHOOK_SECRET no configurado: se rechaza el webhook.');
			return new Response('Webhook no configurado', { status: 503 });
		}

		if (!firmaValida(request, String(paymentId), secret)) {
			console.warn(`Webhook con firma inválida para el pago ${paymentId}.`);
			return new Response('Firma inválida', { status: 401 });
		}

		// Mismo token con el que se creó la preferencia (OAuth de plataforma si
		// está vinculado, si no MP_ACCESS_TOKEN): consultar el pago con un token
		// de otra cuenta hacía fallar Payment.get y el pedido nunca se acreditaba.
		const mpToken = await obtenerTokenPlataformaValido();
		if (!mpToken) {
			console.error('Token de Mercado Pago no configurado: no se puede consultar el pago.');
			return new Response('Pasarela no configurada', { status: 503 });
		}

		const mp = new MercadoPagoConfig({ accessToken: mpToken });
		const paymentData = await new Payment(mp).get({ id: String(paymentId) });

		const orderId = paymentData.external_reference;
		if (!orderId) {
			console.warn(`Pago ${paymentId} sin external_reference.`);
			return new Response('OK', { status: 200 });
		}

		await aplicarEstadoDePago(
			orderId,
			paymentData.status ?? '',
			String(paymentId),
			paymentData.transaction_amount ?? null
		);
		return new Response('OK', { status: 200 });
	} catch (error: any) {
		console.error('Webhook Error:', error);
		// 500 hace que MP reintente, que es lo correcto ante un fallo transitorio.
		return new Response('Error procesando el webhook', { status: 500 });
	}
};

/**
 * Aplica el estado del pago sobre la orden, de forma idempotente.
 *
 * Exportada para poder probarla sin Mercado Pago: es la cadena que acredita,
 * descuenta stock y devenga comisiones, y hasta ahora nunca se había
 * ejecutado en una prueba (ver tests/unit/acreditacionPago.test.ts).
 *
 * MP reintenta los webhooks y puede entregarlos fuera de orden, así que
 * reprocesar el mismo evento no puede duplicar el pedido ni la comisión.
 */
export async function aplicarEstadoDePago(
	orderId: string,
	mpStatus: string,
	paymentId: string,
	transactionAmountPesos: number | null = null
) {
	const order = await db.getDocument('urbanpoint', 'orders', orderId);

	switch (mpStatus) {
		case 'approved': {
			if (order.estado !== 'pendiente_pago') {
				console.log(`Orden ${orderId} ya estaba en "${order.estado}": no se reprocesa.`);
				return;
			}

			// Verificar el importe: sin este control un pago parcial (o de otra
			// preferencia) se aceptaba como pago completo del pedido.
			if (transactionAmountPesos !== null && order.total) {
				const pagadoCentavos = Math.round(transactionAmountPesos * 100);
				if (pagadoCentavos < order.total) {
					console.error(
						`Pago ${paymentId} por ${pagadoCentavos} centavos no cubre el total ${order.total} de la orden ${orderId}: no se acredita.`
					);
					await db.updateDocument('urbanpoint', 'orders', orderId, {
						mp_payment_id: paymentId,
						mp_status: `monto_insuficiente:${mpStatus}`
					}).catch(() => {});
					return;
				}
			}

			await db.updateDocument('urbanpoint', 'orders', orderId, {
				estado: 'pagado',
				paid_at: new Date().toISOString(),
				mp_payment_id: paymentId,
				mp_status: mpStatus
			});
			// resolverComisiones ya es idempotente por order_id.
			await resolverComisiones(orderId);

			// Despachar notificaciones por email
			try {
				const itemsRes = await db.listDocuments('urbanpoint', 'order_items', [
					Query.equal('order_id', orderId)
				]);
				const items = itemsRes.documents.map((it: any) => ({
					nombre_snapshot: it.nombre_snapshot,
					cantidad: it.cantidad,
					precio_unitario: it.precio_unitario,
					subtotal: it.subtotal
				}));
				// Los atributos customer_email/guest_email no se escriben nunca:
				// el email real del cliente sale de su profile (customer_id).
				let customerEmail = order.customer_email || order.guest_email;
				let customerName = order.customer_name || order.guest_name;
				const custId = typeof order.customer_id === 'string' ? order.customer_id : order.customer_id?.$id;
				if (!customerEmail && custId) {
					const custProf: any = await db.getDocument('urbanpoint', 'profiles', custId).catch(() => null);
					if (custProf) {
						customerEmail = custProf.email || '';
						customerName = customerName || custProf.nombre || '';
					}
				}
				let canillitaEmail = '';
				let canillitaNombre = '';
				let pickupNodeName = '';
				let pickupNodeAddress = '';

				const ptId = typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id?.$id;
				if (ptId) {
					const pt: any = await db.getDocument('urbanpoint', 'pickup_points', ptId).catch(() => null);
					if (pt) {
						canillitaEmail = pt.email;
						canillitaNombre = pt.nombre_comercial;
						pickupNodeName = pt.nombre_comercial;
						pickupNodeAddress = pt.direccion + (pt.localidad ? `, ${pt.localidad}` : '');
					}
				}

				await sendOrderNotificationEmails({
					$id: order.$id,
					numero: order.numero,
					total: order.total,
					subtotal: order.subtotal,
					costo_envio: order.costo_envio,
					fulfillment: order.fulfillment,
					direccion_envio: order.direccion_envio,
					pickup_code_hash: order.pickup_code_hash,
					customerName,
					customerEmail,
					canillitaEmail,
					canillitaNombre,
					pickupNodeName,
					pickupNodeAddress
				}, items);
			} catch (mailErr: any) {
				console.error('[Webhook Mailer Error]:', mailErr.message);
			}
			return;
		}


		case 'refunded':
		case 'charged_back': {
			if (order.estado === 'reembolsado') return;
			// La comisión se devengó contra un cobro que ya no existe.
			await revertirComisiones(orderId, `Reversa por reembolso del pago ${paymentId}`);
			// El stock descontado al acreditarse el pago también tiene que volver.
			await restaurarStockDeOrden(orderId);
			await db.updateDocument('urbanpoint', 'orders', orderId, {
				estado: 'reembolsado',
				mp_payment_id: paymentId,
				mp_status: mpStatus
			});
			return;
		}

		case 'cancelled':
		case 'rejected': {
			if (order.estado === 'cancelado' || order.estado !== 'pendiente_pago') return;
			await cancelarOrdenYRestaurarStock(orderId);
			return;
		}

		case 'pending':
		case 'in_process':
		case 'authorized': {
			// El pedido sigue pendiente: sólo se deja registro del estado.
			await db.updateDocument('urbanpoint', 'orders', orderId, {
				mp_payment_id: paymentId,
				mp_status: mpStatus
			});
			return;
		}

		default:
			console.warn(`Estado de pago no contemplado para ${orderId}: "${mpStatus}".`);
	}
}
