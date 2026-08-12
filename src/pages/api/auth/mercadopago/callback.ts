import type { APIRoute } from 'astro';
import { validarStateOAuth, intercambiarCodigoPorTokens } from '../../../../lib/server/mercadopagoOAuth';
import { saveSiteSetting } from '../../../../lib/server/settings';
import { env } from '../../../../lib/server/env';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const stateFromUrl = url.searchParams.get('state');
	const errorFromUrl = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	const siteUrl = (env('PUBLIC_SITE_URL') || url.origin).replace(/\/+$/, '');
	const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;
	const adminRedirect = '/admin/configuracion#sec-pagos';

	// Si el usuario rechazó la solicitud de permisos en Mercado Pago
	if (errorFromUrl) {
		console.warn(`El usuario canceló la autorización OAuth de MP: ${errorFromUrl} - ${errorDescription}`);
		return new Response(null, {
			status: 302,
			headers: {
				Location: `/admin/configuracion?mp_error=cancelado#sec-pagos`
			}
		});
	}

	if (!code || !stateFromUrl) {
		console.warn('Callback de OAuth recibido sin parámetro code o state.');
		return new Response(null, {
			status: 302,
			headers: {
				Location: `/admin/configuracion?mp_error=invalid_params#sec-pagos`
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
				Location: `/admin/configuracion?mp_error=csrf#sec-pagos`
			}
		});
	}

	// Validar firma HMAC y payload del state
	const statePayload = validarStateOAuth(stateFromUrl);
	if (!statePayload) {
		console.warn('State OAuth MP inválido o expirado.');
		return new Response(null, {
			status: 302,
			headers: {
				Location: `/admin/configuracion?mp_error=state_invalid#sec-pagos`
			}
		});
	}

	try {
		// Intercambiar código de autorización por tokens de la tienda
		const tokens = await intercambiarCodigoPorTokens(code, redirectUri);

		const now = Date.now();
		const expiresAtISO = new Date(now + tokens.expires_in * 1000).toISOString();
		const connectedAtISO = new Date(now).toISOString();

		// Guardar las credenciales OAuth en la configuración general de la tienda
		await saveSiteSetting('mp_user_id', String(tokens.user_id));
		await saveSiteSetting('mp_access_token', tokens.access_token);
		await saveSiteSetting('mp_refresh_token', tokens.refresh_token);
		await saveSiteSetting('mp_public_key', tokens.public_key || '');
		await saveSiteSetting('mp_token_expires_at', expiresAtISO);
		await saveSiteSetting('mp_connected_at', connectedAtISO);
		await saveSiteSetting('mp_status', 'conectado');
		await saveSiteSetting('mp_enabled', 'true');

		// Limpiar cookie de state
		cookies.delete('mp_oauth_state', { path: '/' });

		return new Response(null, {
			status: 302,
			headers: {
				Location: `/admin/configuracion?mp=conectado#sec-pagos`
			}
		});
	} catch (error: any) {
		console.error('Error en callback OAuth Mercado Pago Admin:', error);
		return new Response(null, {
			status: 302,
			headers: {
				Location: `/admin/configuracion?mp_error=${encodeURIComponent(error.message || 'error_token')}#sec-pagos`
			}
		});
	}
};
