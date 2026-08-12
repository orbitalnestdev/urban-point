import type { APIRoute } from 'astro';
import { Query } from 'node-appwrite';
import { createAdminClient } from '../../../../lib/server/appwrite';
import { generarStateOAuth, obtenerUrlAutorizacionMP } from '../../../../lib/server/mercadopagoOAuth';
import { env } from '../../../../lib/server/env';

export const prerender = false;

export const GET: APIRoute = async ({ locals, cookies, url }) => {
	const user = locals.user;
	if (!user || (user.role !== 'canillita' && user.role !== 'admin')) {
		return new Response('No autorizado', { status: 401 });
	}

	const { databases: db } = createAdminClient();

	try {
		const points = await db.listDocuments('urbanpoint', 'pickup_points', [
			Query.equal('profile_id', user.profileId),
			Query.limit(1)
		]);

		let pointId = '';
		if (points.documents.length > 0) {
			pointId = points.documents[0].$id;
		} else if (user.role === 'admin') {
			const allPoints = await db.listDocuments('urbanpoint', 'pickup_points', [Query.limit(1)]);
			if (allPoints.documents.length > 0) {
				pointId = allPoints.documents[0].$id;
			}
		}

		if (!pointId) {
			return new Response('No tenés un punto de retiro asignado para vincular Mercado Pago.', {
				status: 400
			});
		}

		const state = generarStateOAuth(user.profileId, pointId);

		// Guardar state en cookie de sesión para verificación anti-CSRF en el callback
		cookies.set('mp_oauth_state', state, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 900 // 15 minutos
		});

		const siteUrl = (env('PUBLIC_SITE_URL') || url.origin).replace(/\/+$/, '');
		const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;

		const mpAuthUrl = obtenerUrlAutorizacionMP(state, redirectUri);

		return new Response(null, {
			status: 302,
			headers: {
				Location: mpAuthUrl
			}
		});
	} catch (error: any) {
		console.error('Error al iniciar flujo OAuth MP:', error);
		return new Response(`Error al iniciar vinculación con Mercado Pago: ${error.message}`, {
			status: 500
		});
	}
};
