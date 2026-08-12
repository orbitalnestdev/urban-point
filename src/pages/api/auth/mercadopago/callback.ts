import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../../lib/server/appwrite';
import { validarStateOAuth, intercambiarCodigoPorTokens } from '../../../../lib/server/mercadopagoOAuth';
import { env } from '../../../../lib/server/env';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const stateFromUrl = url.searchParams.get('state');
	const errorFromUrl = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	const siteUrl = (env('PUBLIC_SITE_URL') || url.origin).replace(/\/+$/, '');
	const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;

	// Si el usuario rechazó la solicitud de permisos en Mercado Pago
	if (errorFromUrl) {
		console.warn(`El usuario canceló la autorización OAuth de MP: ${errorFromUrl} - ${errorDescription}`);
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/canillita?mp_error=cancelado'
			}
		});
	}

	if (!code || !stateFromUrl) {
		console.warn('Callback de OAuth recibido sin parámetro code o state.');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/canillita?mp_error=invalid_params'
			}
		});
	}

	// Validar cookie anti-CSRF
	const cookieState = cookies.get('mp_oauth_state')?.value;
	if (!cookieState || cookieState !== stateFromUrl) {
		console.warn('Posible ataque CSRF o sesión expirada en callback OAuth MP.');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/canillita?mp_error=csrf'
			}
		});
	}

	// Validar firma HMAC y payload del state
	const statePayload = validarStateOAuth(stateFromUrl);
	if (!statePayload || !statePayload.pointId) {
		console.warn('State OAuth MP inválido o expirado.');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/canillita?mp_error=state_invalid'
			}
		});
	}

	try {
		// Intercambiar código de autorización por tokens de vendedor
		const tokens = await intercambiarCodigoPorTokens(code, redirectUri);

		const { databases: db } = createAdminClient();
		const now = Date.now();
		const expiresAtISO = new Date(now + tokens.expires_in * 1000).toISOString();
		const connectedAtISO = new Date(now).toISOString();

		// Guardar las credenciales OAuth en el punto de retiro del vendedor
		await db.updateDocument('urbanpoint', 'pickup_points', statePayload.pointId, {
			mp_user_id: String(tokens.user_id),
			mp_access_token: tokens.access_token,
			mp_refresh_token: tokens.refresh_token,
			mp_public_key: tokens.public_key || '',
			mp_token_expires_at: expiresAtISO,
			mp_connected_at: connectedAtISO,
			mp_status: 'conectado'
		});

		// Limpiar cookie de state
		cookies.delete('mp_oauth_state', { path: '/' });

		return new Response(null, {
			status: 302,
			headers: {
				Location: '/canillita?mp=conectado'
			}
		});
	} catch (error: any) {
		console.error('Error en callback OAuth Mercado Pago:', error);
		return new Response(null, {
			status: 302,
			headers: {
				Location: `/canillita?mp_error=${encodeURIComponent(error.message || 'error_token')}`
			}
		});
	}
};
