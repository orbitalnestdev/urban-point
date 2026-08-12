import crypto from 'node:crypto';
import { createAdminClient } from './appwrite';
import { env } from './env';
import { getSiteSettings, saveSiteSetting } from './settings';

export interface MPOAuthTokens {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
	user_id: number | string;
	refresh_token: string;
	public_key?: string;
}

export interface MPStatePayload {
	profileId: string;
	scopeTarget: string; // 'admin' | 'point'
	pointId?: string;
	timestamp: number;
	nonce: string;
}

function getSecretKey(): string {
	const secret = env('ORDER_ACCESS_SECRET') || env('APPWRITE_API_KEY') || 'mp-oauth-fallback-secret';
	return secret;
}

/**
 * Genera un state firmado HMAC para prevenir CSRF durante el flujo OAuth.
 */
export function generarStateOAuth(profileId: string, scopeTarget: string = 'admin', pointId?: string): string {
	const payload: MPStatePayload = {
		profileId,
		scopeTarget,
		pointId,
		timestamp: Date.now(),
		nonce: crypto.randomBytes(16).toString('hex')
	};

	const jsonStr = JSON.stringify(payload);
	const hmac = crypto.createHmac('sha256', getSecretKey()).update(jsonStr).digest('hex');

	const combined = JSON.stringify({ payload: jsonStr, sig: hmac });
	return Buffer.from(combined).toString('base64url');
}

/**
 * Valida la firma HMAC del state devuelto por Mercado Pago.
 * Expira en 15 minutos (900.000 ms).
 */
export function validarStateOAuth(stateStr: string): MPStatePayload | null {
	try {
		if (!stateStr) return null;

		const jsonStr = Buffer.from(stateStr, 'base64url').toString('utf8');
		const { payload: rawPayload, sig } = JSON.parse(jsonStr);

		const expectedSig = crypto.createHmac('sha256', getSecretKey()).update(rawPayload).digest('hex');

		const a = Buffer.from(sig, 'utf8');
		const b = Buffer.from(expectedSig, 'utf8');

		if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
			console.warn('Firma de state OAuth Mercado Pago inválida.');
			return null;
		}

		const payload: MPStatePayload = JSON.parse(rawPayload);

		// Rechazar states con más de 15 minutos de antigüedad
		const maxAgeMs = 15 * 60 * 1000;
		if (Date.now() - payload.timestamp > maxAgeMs) {
			console.warn('State OAuth Mercado Pago expirado.');
			return null;
		}

		return payload;
	} catch (error) {
		console.error('Error al validar state OAuth:', error);
		return null;
	}
}

/**
 * Construye la URL de inicio del flujo de autorización OAuth de Mercado Pago Argentina.
 */
export function obtenerUrlAutorizacionMP(state: string, redirectUri: string): string {
	const clientId = env('MP_CLIENT_ID');
	if (!clientId) {
		throw new Error('MP_CLIENT_ID no está configurada en las variables de entorno.');
	}

	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		platform_id: 'mp',
		state,
		redirect_uri: redirectUri
	});

	return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`;
}

/**
 * Intercambia el authorization_code por las credenciales OAuth.
 */
export async function intercambiarCodigoPorTokens(
	code: string,
	redirectUri: string
): Promise<MPOAuthTokens> {
	const clientId = env('MP_CLIENT_ID');
	const clientSecret = env('MP_CLIENT_SECRET');

	if (!clientId || !clientSecret) {
		throw new Error('MP_CLIENT_ID y MP_CLIENT_SECRET deben estar configuradas.');
	}

	const response = await fetch('https://api.mercadopago.com/oauth/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri
		}).toString()
	});

	const data = await response.json();

	if (!response.ok) {
		console.error('Error en el intercambio de tokens MP:', data);
		throw new Error(data.message || data.error || 'Error al intercambiar código con Mercado Pago.');
	}

	return data as MPOAuthTokens;
}

/**
 * Refresca el access_token utilizando el refresh_token.
 */
export async function refrescarTokenMP(refreshToken: string): Promise<MPOAuthTokens> {
	const clientId = env('MP_CLIENT_ID');
	const clientSecret = env('MP_CLIENT_SECRET');

	if (!clientId || !clientSecret) {
		throw new Error('MP_CLIENT_ID y MP_CLIENT_SECRET deben estar configuradas.');
	}

	const response = await fetch('https://api.mercadopago.com/oauth/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		}).toString()
	});

	const data = await response.json();

	if (!response.ok) {
		console.error('Error al refrescar token MP:', data);
		throw new Error(data.message || data.error || 'Error al renovar token de Mercado Pago.');
	}

	return data as MPOAuthTokens;
}

/**
 * Obtiene el access_token válido de Mercado Pago para la tienda/plataforma administrada.
 * Si está próximo a expirar (o expirado), lo renueva automáticamente mediante refresh_token.
 */
export async function obtenerTokenPlataformaValido(): Promise<string | null> {
	try {
		const settings = await getSiteSettings();
		const settingsMap = settings as unknown as Record<string, any>;
		const mpStatus = settingsMap.mp_status;
		const mpAccessToken = settingsMap.mp_access_token || settings.mp_access_token;
		const mpRefreshToken = settingsMap.mp_refresh_token;
		const mpExpiresAtStr = settingsMap.mp_token_expires_at;

		if (mpStatus === 'conectado' && mpAccessToken) {
			const expiresAt = mpExpiresAtStr ? new Date(mpExpiresAtStr).getTime() : 0;
			const now = Date.now();
			const marginMs = 60 * 60 * 1000;

			if (expiresAt > 0 && expiresAt - now < marginMs && mpRefreshToken) {
				console.log('Renovando access_token OAuth de Mercado Pago para la tienda...');
				const nuevosTokens = await refrescarTokenMP(mpRefreshToken);
				const nuevoExpiresAt = new Date(now + nuevosTokens.expires_in * 1000).toISOString();

				await saveSiteSetting('mp_access_token', nuevosTokens.access_token);
				await saveSiteSetting('mp_refresh_token', nuevosTokens.refresh_token);
				await saveSiteSetting('mp_token_expires_at', nuevoExpiresAt);
				if (nuevosTokens.public_key) {
					await saveSiteSetting('mp_public_key', nuevosTokens.public_key);
				}
				await saveSiteSetting('mp_status', 'conectado');

				return nuevosTokens.access_token;
			}

			return mpAccessToken;
		}

		return env('MP_ACCESS_TOKEN') || null;
	} catch (error) {
		console.error('Error al obtener token de Mercado Pago de la plataforma:', error);
		return env('MP_ACCESS_TOKEN') || null;
	}
}

/**
 * Obtiene el access_token válido de Mercado Pago para un punto de retiro.
 */
export async function obtenerTokenVendedorValido(pointId: string): Promise<string | null> {
	const { databases: db } = createAdminClient();

	try {
		const point = await db.getDocument('urbanpoint', 'pickup_points', pointId);

		if (point.mp_status !== 'conectado' || !point.mp_access_token) {
			return null;
		}

		const expiresAt = point.mp_token_expires_at ? new Date(point.mp_token_expires_at).getTime() : 0;
		const now = Date.now();
		const marginMs = 60 * 60 * 1000;

		if (expiresAt > 0 && expiresAt - now < marginMs && point.mp_refresh_token) {
			console.log(`Renovando access_token de Mercado Pago para el punto ${pointId}...`);
			const nuevosTokens = await refrescarTokenMP(point.mp_refresh_token);

			const nuevoExpiresAt = new Date(now + nuevosTokens.expires_in * 1000).toISOString();

			await db.updateDocument('urbanpoint', 'pickup_points', pointId, {
				mp_access_token: nuevosTokens.access_token,
				mp_refresh_token: nuevosTokens.refresh_token,
				mp_token_expires_at: nuevoExpiresAt,
				mp_public_key: nuevosTokens.public_key || point.mp_public_key || '',
				mp_status: 'conectado'
			});

			return nuevosTokens.access_token;
		}

		return point.mp_access_token;
	} catch (error) {
		console.error(`Error al obtener token de vendedor para el punto ${pointId}:`, error);
		return null;
	}
}
