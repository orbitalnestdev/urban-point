import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Receptor de avisos de BIND — todavía sin tráfico real ni forma de payload
 * confirmada (ver ../../../lib/server/bind.ts).
 *
 * A diferencia de Mercado Pago, BIND no firma el payload por defecto: la
 * documentación pública dice que confía en que las llamadas vienen de sus
 * IPs fijas por ambiente (whitelisting recomendado en el proxy) o, como
 * alternativa más fuerte, en mTLS. No hay HMAC que validar acá todavía —
 * agregarlo en cuanto BIND confirme si ofrece uno para este producto.
 *
 * Reintenta hasta 10 veces con espera creciente (18s, 2m10s, hasta 1h)
 * mientras no reciba 200: por eso este handler responde 200 apenas loguea
 * el aviso, en vez de esperar a procesarlo.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.text().catch(() => '');
	console.log('[bind webhook] aviso recibido:', body.slice(0, 2000));
	return new Response('OK', { status: 200 });
};
