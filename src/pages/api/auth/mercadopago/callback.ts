import type { APIRoute } from 'astro';
import { validarStateOAuth, intercambiarCodigoPorTokens } from '../../../../lib/server/mercadopagoOAuth';
import { saveSiteSetting } from '../../../../lib/server/settings';
import { getPublicSiteUrl } from '../../../../lib/server/env';
import { createAdminClient } from '../../../../lib/server/appwrite';

export const prerender = false;

/**
 * Callback único para los dos flujos de OAuth de Mercado Pago: el de la
 * tienda (scopeTarget 'admin', va a /admin/configuracion) y el de un punto
 * de retiro conectando su propia cuenta (scopeTarget 'point', va a
 * /canillita). El destino y dónde se guardan los tokens salen del
 * `state` firmado, no de nada que mande el cliente en la URL.
 */
export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
	const code = url.searchParams.get('code');
	const stateFromUrl = url.searchParams.get('state');
	const errorFromUrl = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	const siteUrl = getPublicSiteUrl({ request, url });
	const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`;

	// Antes de validar el state (puede faltar si el usuario canceló), no se
	// sabe todavía a qué panel volver — el de admin es el destino por default.
	const destinoPorDefecto = '/admin/configuracion#sec-pagos';

	// Si el usuario rechazó la solicitud de permisos en Mercado Pago
	if (errorFromUrl) {
		console.warn(`El usuario canceló la autorización OAuth de MP: ${errorFromUrl} - ${errorDescription}`);
		return new Response(null, {
			status: 302,
			headers: { Location: `${destinoPorDefecto.split('#')[0]}?mp_error=cancelado#sec-pagos` }
		});
	}

	if (!code || !stateFromUrl) {
		console.warn('Callback de OAuth recibido sin parámetro code o state.');
		return new Response(null, {
			status: 302,
			headers: { Location: `${destinoPorDefecto.split('#')[0]}?mp_error=invalid_params#sec-pagos` }
		});
	}

	// Validar cookie anti-CSRF
	const cookieState = cookies.get('mp_oauth_state')?.value;
	if (!cookieState || cookieState !== stateFromUrl) {
		console.warn('Posible ataque CSRF o sesión expirada en callback OAuth MP.');
		return new Response(null, {
			status: 302,
			headers: { Location: `${destinoPorDefecto.split('#')[0]}?mp_error=csrf#sec-pagos` }
		});
	}

	// Validar firma HMAC y payload del state
	const statePayload = validarStateOAuth(stateFromUrl);
	if (!statePayload) {
		console.warn('State OAuth MP inválido o expirado.');
		return new Response(null, {
			status: 302,
			headers: { Location: `${destinoPorDefecto.split('#')[0]}?mp_error=state_invalid#sec-pagos` }
		});
	}

	const esPunto = statePayload.scopeTarget === 'point' && !!statePayload.pointId;
	const volverA = esPunto ? '/canillita' : '/admin/configuracion#sec-pagos';

	// La cookie+firma ya prueban que el navegador es el que arrancó el OAuth,
	// pero no que siga siendo la MISMA persona: la ventana del state dura 15
	// minutos, tiempo de sobra para que la sesión cambie (otro canillita en el
	// mismo dispositivo, o un logout/login de por medio). Sin este chequeo, el
	// token de Mercado Pago terminaba guardado en el punto de quien inició el
	// flujo, no de quien efectivamente está logueado al volver de MP.
	if (esPunto && locals.user?.profileId !== statePayload.profileId) {
		console.warn('Callback OAuth MP de punto: la sesión actual no coincide con quien inició el vínculo.');
		return new Response(null, {
			status: 302,
			headers: { Location: `/canillita?mp_error=sesion_distinta` }
		});
	}

	try {
		const tokens = await intercambiarCodigoPorTokens(code, redirectUri);

		const now = Date.now();
		const expiresAtISO = new Date(now + tokens.expires_in * 1000).toISOString();
		const connectedAtISO = new Date(now).toISOString();

		if (esPunto) {
			// Se guarda en el documento del punto, no en la config general: cada
			// canillita cobra con SU propia cuenta, no con la de la tienda.
			const { databases: db } = createAdminClient();
			await db.updateDocument('urbanpoint', 'pickup_points', statePayload.pointId as string, {
				mp_user_id: String(tokens.user_id),
				mp_access_token: tokens.access_token,
				mp_refresh_token: tokens.refresh_token,
				mp_public_key: tokens.public_key || '',
				mp_token_expires_at: expiresAtISO,
				mp_connected_at: connectedAtISO,
				mp_status: 'conectado'
			});
		} else {
			await saveSiteSetting('mp_user_id', String(tokens.user_id));
			await saveSiteSetting('mp_access_token', tokens.access_token);
			await saveSiteSetting('mp_refresh_token', tokens.refresh_token);
			await saveSiteSetting('mp_public_key', tokens.public_key || '');
			await saveSiteSetting('mp_token_expires_at', expiresAtISO);
			await saveSiteSetting('mp_connected_at', connectedAtISO);
			await saveSiteSetting('mp_status', 'conectado');
			await saveSiteSetting('mp_enabled', 'true');
		}

		cookies.delete('mp_oauth_state', { path: '/' });

		return new Response(null, {
			status: 302,
			headers: { Location: esPunto ? `${volverA}?mp=conectado` : `${volverA.split('#')[0]}?mp=conectado#sec-pagos` }
		});
	} catch (error: any) {
		console.error('Error en callback OAuth Mercado Pago:', error);
		const base = volverA.split('#')[0];
		const hash = esPunto ? '' : '#sec-pagos';
		return new Response(null, {
			status: 302,
			headers: { Location: `${base}?mp_error=${encodeURIComponent(error.message || 'error_token')}${hash}` }
		});
	}
};
