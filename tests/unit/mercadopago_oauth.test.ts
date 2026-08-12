import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	generarStateOAuth,
	validarStateOAuth,
	obtenerUrlAutorizacionMP,
	intercambiarCodigoPorTokens,
	refrescarTokenMP
} from '../../src/lib/server/mercadopagoOAuth';

describe('Mercado Pago OAuth Module', () => {
	beforeEach(() => {
		vi.stubEnv('MP_CLIENT_ID', 'test_client_id_123456');
		vi.stubEnv('MP_CLIENT_SECRET', 'test_client_secret_654321');
		vi.stubEnv('ORDER_ACCESS_SECRET', 'test_oauth_secret_key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe('State OAuth anti-CSRF token', () => {
		it('debe generar y validar correctamente un state con firma HMAC', () => {
			const profileId = 'profile_123';
			const pointId = 'point_456';

			const state = generarStateOAuth(profileId, pointId);
			expect(typeof state).toBe('string');
			expect(state.length).toBeGreaterThan(20);

			const payload = validarStateOAuth(state);
			expect(payload).not.toBeNull();
			expect(payload?.profileId).toBe(profileId);
			expect(payload?.pointId).toBe(pointId);
		});

		it('debe rechazar un state alterado o con firma HMAC no válida', () => {
			const state = generarStateOAuth('profile_123', 'point_456');
			const stateTampered = state.slice(0, -4) + 'XXXX';

			const payload = validarStateOAuth(stateTampered);
			expect(payload).toBeNull();
		});

		it('debe rechazar un state si está vacío o malformado', () => {
			expect(validarStateOAuth('')).toBeNull();
			expect(validarStateOAuth('invalid_base64_json')).toBeNull();
		});
	});

	describe('Mercado Pago Authorization URL', () => {
		it('debe generar la URL de autorización oficial con los parámetros correctos', () => {
			const state = 'mock_state_token';
			const redirectUri = 'https://urbanpoint.com.ar/api/auth/mercadopago/callback';

			const urlStr = obtenerUrlAutorizacionMP(state, redirectUri);
			const url = new URL(urlStr);

			expect(url.origin).toBe('https://auth.mercadopago.com.ar');
			expect(url.pathname).toBe('/authorization');
			expect(url.searchParams.get('client_id')).toBe('test_client_id_123456');
			expect(url.searchParams.get('response_type')).toBe('code');
			expect(url.searchParams.get('platform_id')).toBe('mp');
			expect(url.searchParams.get('state')).toBe(state);
			expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
		});

		it('debe lanzar un error si MP_CLIENT_ID no está configurado', () => {
			vi.stubEnv('MP_CLIENT_ID', '');
			expect(() => obtenerUrlAutorizacionMP('state', 'https://example.com')).toThrow(
				'MP_CLIENT_ID no está configurada'
			);
		});
	});

	describe('Token Exchange y Refresh', () => {
		it('debe realizar el intercambio de authorization_code por tokens correctamente', async () => {
			const mockTokensResponse = {
				access_token: 'APP_USR-mock-access-token',
				token_type: 'bearer',
				expires_in: 15552000,
				scope: 'offline_access read write',
				user_id: 987654321,
				refresh_token: 'TG-mock-refresh-token',
				public_key: 'APP_USR-mock-public-key'
			};

			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
				ok: true,
				json: async () => mockTokensResponse
			} as Response);

			const redirectUri = 'https://urbanpoint.com.ar/api/auth/mercadopago/callback';
			const result = await intercambiarCodigoPorTokens('auth_code_123', redirectUri);

			expect(result).toEqual(mockTokensResponse);
			expect(fetchSpy).toHaveBeenCalledWith(
				'https://api.mercadopago.com/oauth/token',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						Accept: 'application/json'
					}
				})
			);
		});

		it('debe refrescar un token de acceso usando el refresh_token', async () => {
			const mockRefreshResponse = {
				access_token: 'APP_USR-new-access-token',
				token_type: 'bearer',
				expires_in: 15552000,
				scope: 'offline_access read write',
				user_id: 987654321,
				refresh_token: 'TG-new-refresh-token',
				public_key: 'APP_USR-mock-public-key'
			};

			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
				ok: true,
				json: async () => mockRefreshResponse
			} as Response);

			const result = await refrescarTokenMP('TG-old-refresh-token');

			expect(result).toEqual(mockRefreshResponse);
			expect(fetchSpy).toHaveBeenCalledWith(
				'https://api.mercadopago.com/oauth/token',
				expect.objectContaining({
					method: 'POST'
				})
			);
		});
	});
});
