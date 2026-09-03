import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../../src/pages/api/webhooks/bind';

/**
 * Todavía no se conoce la forma real de los avisos de BIND. Lo único que
 * importa hoy es lo que la documentación de BIND sí exige: devolver 200 sin
 * importar el contenido, porque si no, reintenta hasta 10 veces.
 */
describe('Webhook de BIND', () => {
	afterEach(() => vi.restoreAllMocks());

	it('responde 200 ante un aviso con forma cualquiera', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const request = new Request('https://ejemplo.test/api/webhooks/bind', {
			method: 'POST',
			body: JSON.stringify({ evento: 'algo', datos: { monto: 1000 } })
		});

		const res = await POST({ request } as any);
		expect(res.status).toBe(200);
	});

	it('responde 200 incluso con un cuerpo vacío o no-JSON', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const request = new Request('https://ejemplo.test/api/webhooks/bind', {
			method: 'POST',
			body: 'esto no es json'
		});

		const res = await POST({ request } as any);
		expect(res.status).toBe(200);
	});
});
