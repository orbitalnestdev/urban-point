import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createAdminClient } from '../../../lib/server/appwrite';
import { resolverComisiones } from '../../../lib/commissions';

export const prerender = false;

const { databases: db } = createAdminClient();

export const POST: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		
		// MP sends data in query string (topic=payment&id=123) or in the body
		const topic = url.searchParams.get('topic') || url.searchParams.get('type');
		const id = url.searchParams.get('data.id') || url.searchParams.get('id');

		// Webhook test ping from MP or empty data
		if (!topic || !id) {
			// Intento leer body
			const body = await request.json().catch(() => ({}));
			if (body.type === 'payment' && body.data?.id) {
				return handlePayment(body.data.id);
			}
			return new Response('OK', { status: 200 });
		}

		if (topic === 'payment') {
			return handlePayment(id);
		}

		return new Response('Ignorado', { status: 200 });
	} catch (error: any) {
		console.error('Webhook Error:', error);
		return new Response(error.message, { status: 500 });
	}
};

async function handlePayment(paymentId: string) {
	const mpToken = process.env.MP_ACCESS_TOKEN || '';
	if (!mpToken) {
		console.log(`[Webhook Mock] Simulando pago ${paymentId}`);
		// Si es un test local simulado, el ID que nos llega puede ser el ID de la orden directamente
		const orderId = paymentId; 
		await db.updateDocument('urbanpoint', 'orders', orderId, {
			estado: 'pagado'
		});
		await resolverComisiones(orderId);
		return new Response('OK Simulado', { status: 200 });
	}

	const mp = new MercadoPagoConfig({ accessToken: mpToken });
	const payment = new Payment(mp);
	
	const paymentData = await payment.get({ id: paymentId });
	
	if (paymentData.status === 'approved') {
		const orderId = paymentData.external_reference;
		
		if (orderId) {
			// Marcar orden como pagada
			await db.updateDocument('urbanpoint', 'orders', orderId, {
				estado: 'pagado'
			});
			
			// Resolver comisiones
			await resolverComisiones(orderId);
		}
	}
	
	return new Response('OK', { status: 200 });
}
