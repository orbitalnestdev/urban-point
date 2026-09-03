/**
 * Cliente de BIND PSP (psp.bind.com.ar) — en evaluación, sin credenciales
 * de sandbox todavía y sin usarse en ningún flujo real.
 *
 * BIND no tiene alta de sandbox autoservicio: client_id, client_secret Y
 * scope los entrega a mano el equipo de soporte de integraciones de BIND,
 * por ambiente (ver .env.local.ejemplo). Hasta tenerlos, nada de esto se
 * pudo probar contra la API real — está construido a partir de la
 * documentación pública (https://psp.bind.com.ar/developers/general).
 *
 * Lo que sí está confirmado en esa documentación y es seguro de usar tal
 * cual: la autenticación OAuth2 client_credentials (URLs, duración del
 * token) y el contrato del webhook (reintentos, necesidad de responder
 * 200 — ver ../../pages/api/webhooks/bind.ts). Las operaciones de negocio
 * (crear un link de pago, transferir, etc.) están confirmadas como
 * existentes pero no su path/payload exacto: la referencia de API de BIND
 * es un explorador interactivo, no texto estático, y no se pudo extraer
 * de forma confiable sin credenciales para probarlo en vivo. Ver
 * OPERACIONES_PENDIENTES.
 */
import { env } from './env';

export type BindEnv = 'staging' | 'production';

function bindEnv(): BindEnv {
	return env('BIND_ENV') === 'production' ? 'production' : 'staging';
}

const BASE_URL: Record<BindEnv, string> = {
	staging: 'https://gw-staging-qrbind.epays.services',
	production: 'https://api.bindpagos.com.ar'
};

// Tenant de Azure AD distinto por ambiente: lo publica la documentación de
// BIND, no es algo deducible ni configurable desde nuestro lado.
const TOKEN_URL: Record<BindEnv, string> = {
	staging:
		'https://login.microsoftonline.com/61ef5b89-8df3-499d-8c13-38fed5d09c72/oauth2/v2.0/token',
	production:
		'https://login.microsoftonline.com/3ee81fb8-f2e8-4475-aef2-c5902f9fb0c3/oauth2/v2.0/token'
};

export function bindBaseUrl(): string {
	return BASE_URL[bindEnv()];
}

interface TokenCache {
	token: string;
	expiraEn: number; // epoch ms
}

let cache: TokenCache | null = null;

/** Sólo para tests: evita que un token cacheado de un test contamine el siguiente. */
export function _resetCacheToken(): void {
	cache = null;
}

/**
 * Token OAuth2 (client_credentials) de BIND, cacheado en memoria.
 *
 * Dura 60 minutos según la documentación; se renueva con 5 de margen. Este
 * grant type no tiene refresh_token: renovar es simplemente pedir uno nuevo.
 */
export async function obtenerTokenBind(): Promise<string> {
	const ahora = Date.now();
	if (cache && cache.expiraEn - ahora > 5 * 60 * 1000) {
		return cache.token;
	}

	const clientId = env('BIND_CLIENT_ID');
	const clientSecret = env('BIND_CLIENT_SECRET');
	const scope = env('BIND_SCOPE');

	if (!clientId || !clientSecret || !scope) {
		throw new Error(
			'BIND_CLIENT_ID, BIND_CLIENT_SECRET y BIND_SCOPE deben estar configuradas. ' +
				'Las entrega el equipo de soporte de integraciones de BIND: no hay alta de sandbox autoservicio.'
		);
	}

	const response = await fetch(TOKEN_URL[bindEnv()], {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'client_credentials',
			scope
		}).toString()
	});

	const data = await response.json().catch(() => ({}) as any);
	if (!response.ok || !data.access_token) {
		console.error('Error al obtener token OAuth2 de BIND:', data);
		throw new Error(data.error_description || data.error || 'No se pudo autenticar contra BIND.');
	}

	cache = {
		token: data.access_token,
		expiraEn: ahora + (Number(data.expires_in) || 3600) * 1000
	};
	return cache.token;
}

/** Llamada autenticada genérica contra la API de BIND (ambiente según BIND_ENV). */
export async function bindFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const token = await obtenerTokenBind();
	return fetch(`${bindBaseUrl()}${path}`, {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		}
	});
}

/**
 * Operaciones que la documentación pública de BIND confirma que existen,
 * cada una con la guía real donde confirmar path y payload exactos antes de
 * escribir la función que la llama. No inventar el path: mejor un TODO acá
 * que un endpoint que parece correcto y no lo es.
 */
export const OPERACIONES_PENDIENTES = {
	crearLinkDePago: 'https://psp.bind.com.ar/developers/cobro/apis/guia-boton-simple-20',
	consultarLinkDePago: 'https://psp.bind.com.ar/developers/cobro/apis/guia-boton-simple-20',
	devolverLinkDePago: 'https://psp.bind.com.ar/developers/cobro/apis/guia-boton-simple-20',
	// Ésta es la que resuelve la pregunta de "dispersión de fondos a
	// canillitas": la documentación confirma que existe (a diferencia de la
	// recaudación por CVU, que sólo recibe), pero falta el payload.
	transferirDesdeCBU: 'https://psp.bind.com.ar/developers/apis/guia-agente-de-cobro-cbu',
	consultarTransferencia: 'https://psp.bind.com.ar/developers/apis/guia-agente-de-cobro-cbu',
	consultarSaldoRecaudadora: 'https://psp.bind.com.ar/developers/apis/guia-agente-de-cobro-cbu',
	crearCVU: 'https://psp.bind.com.ar/developers/apis/guia-agente-de-cobro-cvu'
} as const;
