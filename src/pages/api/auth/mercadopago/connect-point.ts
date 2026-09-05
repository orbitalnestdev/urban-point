import type { APIRoute } from 'astro';
import { Query } from 'node-appwrite';
import { generarStateOAuth, obtenerUrlAutorizacionMP } from '../../../../lib/server/mercadopagoOAuth';
import { getPublicSiteUrl } from '../../../../lib/server/env';
import { createAdminClient } from '../../../../lib/server/appwrite';

export const prerender = false;

/**
 * Arranca el OAuth de Mercado Pago para el punto de retiro del canillita
 * logueado (no de un admin) — para que los pagos de ESE punto se acrediten
 * en la cuenta de Mercado Pago del canillita, no en la de la tienda.
 *
 * El punto se resuelve server-side por profile_id de la sesión, nunca por un
 * id que mande el cliente: si no, cualquier canillita podría pedir conectar
 * el punto de otro.
 */
export const GET: APIRoute = async ({ locals, cookies, request, url }) => {
	const user = locals.user;
	if (!user || user.role !== 'canillita') {
		return new Response('No autorizado. Solo un canillita puede conectar el punto propio.', {
			status: 401
		});
	}

	try {
		const { databases: db } = createAdminClient();
		const puntos = await db.listDocuments('urbanpoint', 'pickup_points', [
			Query.equal('profile_id', user.profileId),
			Query.limit(1)
		]);
		const punto = puntos.documents[0];
		if (!punto) {
			return new Response('No se encontró un punto de retiro asociado a tu cuenta.', { status: 404 });
		}

		const state = generarStateOAuth(user.profileId, 'point', punto.$id);

		cookies.set('mp_oauth_state', state, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 900
		});

		const siteUrl = getPublicSiteUrl({ request, url });
		const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;
		const mpAuthUrl = obtenerUrlAutorizacionMP(state, redirectUri);

		return new Response(null, { status: 302, headers: { Location: mpAuthUrl } });
	} catch (error: any) {
		console.error('Error al iniciar flujo OAuth MP de canillita:', error);
		return new Response(`Error al iniciar vinculación con Mercado Pago: ${error.message}`, {
			status: 500
		});
	}
};
