import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createAdminClient } from '../../../lib/server/appwrite';
import {
	resolverComisiones,
	cancelarOrdenYRestaurarStock,
	revertirComisiones
} from '../../../lib/commissions';

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
function firmaValida(request: Request, dataId: string, secret: string): boolean {
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

	const manifiesto = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`;
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

		const secret = process.env.MP_WEBHOOK_SECRET;
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

		const mpToken = process.env.MP_ACCESS_TOKEN;
		if (!mpToken) {
			console.error('MP_ACCESS_TOKEN no configurado: no se puede consultar el pago.');
			return new Response('Pasarela no configurada', { status: 503 });
		}

		const mp = new MercadoPagoConfig({ accessToken: mpToken });
		const paymentData = await new Payment(mp).get({ id: String(paymentId) });

		const orderId = paymentData.external_reference;
		if (!orderId) {
			console.warn(`Pago ${paymentId} sin external_reference.`);
			return new Response('OK', { status: 200 });
		}

		await aplicarEstadoDePago(orderId, paymentData.status ?? '', String(paymentId));
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
 * MP reintenta los webhooks y puede entregarlos fuera de orden, así que
 * reprocesar el mismo evento no puede duplicar el pedido ni la comisión.
 */
async function aplicarEstadoDePago(orderId: string, mpStatus: string, paymentId: string) {
	const order = await db.getDocument('urbanpoint', 'orders', orderId);

	switch (mpStatus) {
		case 'approved': {
			if (order.estado !== 'pendiente_pago') {
				console.log(`Orden ${orderId} ya estaba en "${order.estado}": no se reprocesa.`);
				return;
			}
			await db.updateDocument('urbanpoint', 'orders', orderId, {
				estado: 'pagado',
				paid_at: new Date().toISOString(),
				mp_payment_id: paymentId,
				mp_status: mpStatus
			});
			// resolverComisiones ya es idempotente por order_id.
			await resolverComisiones(orderId);
			return;
		}

		case 'refunded':
		case 'charged_back': {
			if (order.estado === 'reembolsado') return;
			// La comisión se devengó contra un cobro que ya no existe.
			await revertirComisiones(orderId, `Reversa por reembolso del pago ${paymentId}`);
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
