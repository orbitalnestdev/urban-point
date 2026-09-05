import type { APIRoute } from 'astro';
import { generarStateOAuth, obtenerUrlAutorizacionMP } from '../../../../lib/server/mercadopagoOAuth';
import { env, getPublicSiteUrl } from '../../../../lib/server/env';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, cookies, url }) => {
	const user = locals.user;
	if (!user || user.role !== 'admin') {
		return new Response('No autorizado. Solo los administradores pueden conectar Mercado Pago.', {
			status: 401
		});
	}

	try {
		const state = generarStateOAuth(user.profileId, 'admin');

		// Guardar state en cookie de sesión para verificación anti-CSRF en el callback
		cookies.set('mp_oauth_state', state, {
			path: '/',
			httpOnly: true,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			maxAge: 900 // 15 minutos
		});

		const siteUrl = getPublicSiteUrl({ request, url });

		const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;

		const mpAuthUrl = obtenerUrlAutorizacionMP(state, redirectUri);

		return new Response(null, {
			status: 302,
			headers: {
				Location: mpAuthUrl
			}
		});
	} catch (error: any) {
		console.error('Error al iniciar flujo OAuth MP Admin:', error);
		return new Response(`Error al iniciar vinculación con Mercado Pago: ${error.message}`, {
			status: 500
		});
	}
};
