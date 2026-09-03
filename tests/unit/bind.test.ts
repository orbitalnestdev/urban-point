import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	obtenerTokenBind,
	bindFetch,
	bindBaseUrl,
	_resetCacheToken
} from '../../src/lib/server/bind';

/**
 * BIND todavía no tiene credenciales de sandbox (no hay alta autoservicio),
 * así que nada de esto se probó contra la API real. Lo que se cubre acá es
 * el contrato que la documentación pública de BIND sí confirma: la URL y
 * forma del pedido OAuth2 client_credentials, el cacheo del token, y que el
 * ambiente (BIND_ENV) elige la URL correcta.
 */
describe('Cliente de BIND — autenticación', () => {
	beforeEach(() => {
		_resetCacheToken();
		vi.stubEnv('BIND_CLIENT_ID', 'id-de-prueba');
		vi.stubEnv('BIND_CLIENT_SECRET', 'secreto-de-prueba');
		vi.stubEnv('BIND_SCOPE', 'scope-de-prueba');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		vi.useRealTimers();
		_resetCacheToken();
	});

	it('pide el token contra la URL de staging por default', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
			ok: true,
			json: async () => ({ access_token: 'tok-1', expires_in: 3600 })
		} as Response);

		const token = await obtenerTokenBind();

		expect(token).toBe('tok-1');
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://login.microsoftonline.com/61ef5b89-8df3-499d-8c13-38fed5d09c72/oauth2/v2.0/token',
			expect.objectContaining({ method: 'POST' })
		);
		const body = fetchSpy.mock.calls[0][1]?.body as string;
		expect(body).toContain('grant_type=client_credentials');
		expect(body).toContain('client_id=id-de-prueba');
	});

	it('con BIND_ENV=production pide el token contra el tenant de producción', async () => {
		vi.stubEnv('BIND_ENV', 'production');
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
			ok: true,
			json: async () => ({ access_token: 'tok-prod', expires_in: 3600 })
		} as Response);

		await obtenerTokenBind();

		expect(fetchSpy).toHaveBeenCalledWith(
			'https://login.microsoftonline.com/3ee81fb8-f2e8-4475-aef2-c5902f9fb0c3/oauth2/v2.0/token',
			expect.anything()
		);
		expect(bindBaseUrl()).toBe('https://api.bindpagos.com.ar');
	});

	it('no vuelve a pedir un token mientras el cacheado siga vigente', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
			ok: true,
			json: async () => ({ access_token: 'tok-1', expires_in: 3600 })
		} as Response);

		await obtenerTokenBind();
		const segundo = await obtenerTokenBind();

		expect(segundo).toBe('tok-1');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('pide un token nuevo una vez que el cacheado está por vencer', async () => {
		vi.useFakeTimers();
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ access_token: 'tok-viejo', expires_in: 3600 })
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ access_token: 'tok-nuevo', expires_in: 3600 })
			} as Response);

		await obtenerTokenBind();

		// Quedan menos de 5 minutos de margen: tiene que renovar.
		vi.advanceTimersByTime(56 * 60 * 1000);
		const token = await obtenerTokenBind();

		expect(token).toBe('tok-nuevo');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('falla con un mensaje claro si falta alguna credencial', async () => {
		vi.stubEnv('BIND_SCOPE', '');
		await expect(obtenerTokenBind()).rejects.toThrow('BIND_CLIENT_ID, BIND_CLIENT_SECRET y BIND_SCOPE');
	});

	it('propaga el error que devuelve BIND si la autenticación falla', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: 'invalid_client', error_description: 'credenciales inválidas' })
		} as Response);

		await expect(obtenerTokenBind()).rejects.toThrow('credenciales inválidas');
	});

	it('bindFetch arma la URL con el base según ambiente y adjunta el Bearer', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ access_token: 'tok-1', expires_in: 3600 })
			} as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

		await bindFetch('/algun/endpoint');

		expect(fetchSpy).toHaveBeenLastCalledWith(
			'https://gw-staging-qrbind.epays.services/algun/endpoint',
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: 'Bearer tok-1' })
			})
		);
	});
});
