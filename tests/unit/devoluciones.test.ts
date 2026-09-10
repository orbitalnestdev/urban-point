import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Las reglas que se testean acá salen de /cambios-y-devoluciones, que es lo
 * que la tienda ya le prometió por escrito al cliente: 10 días corridos desde
 * la ENTREGA para arrepentirse, y reintegro al mismo medio de pago en ese caso
 * (Ley 24.240 art. 34). El saldo a favor es válido para un cambio por
 * preferencia, pero para un arrepentimiento necesita que el cliente lo acepte.
 */

const listDocuments = vi.fn();
const createDocument = vi.fn();
const updateDocument = vi.fn();
const getDocument = vi.fn();
const deleteDocument = vi.fn();

vi.mock('../../src/lib/server/appwrite', () => ({
	createAdminClient: () => ({ databases: { listDocuments, createDocument, updateDocument, getDocument, deleteDocument } })
}));

const faltaColeccion = Object.assign(
	new Error('Collection with the requested ID could not be found.'),
	{ code: 404 }
);

const solicitud = (over: Record<string, any> = {}) => ({
	$id: 'd1',
	order_id: 'o1',
	profile_id: 'p1',
	motivo: 'arrepentimiento',
	estado: 'solicitada',
	monto_centavos: 50000,
	dentro_de_plazo: true,
	solicitado_at: '2026-01-01T00:00:00.000Z',
	...over
});

let mod: typeof import('../../src/lib/server/devoluciones');

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mod = await import('../../src/lib/server/devoluciones');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('plazo de arrepentimiento: 10 días corridos desde la entrega', () => {
	const entrega = '2026-03-01T12:00:00.000Z';

	it('el mismo día está en plazo', () => {
		expect(mod.dentroDelPlazoDeArrepentimiento(entrega, new Date('2026-03-01T18:00:00Z'))).toBe(true);
	});

	it('al décimo día todavía está en plazo', () => {
		expect(mod.dentroDelPlazoDeArrepentimiento(entrega, new Date('2026-03-11T11:00:00Z'))).toBe(true);
	});

	it('pasados los 10 días ya no', () => {
		expect(mod.dentroDelPlazoDeArrepentimiento(entrega, new Date('2026-03-12T13:00:00Z'))).toBe(false);
	});

	it('cuenta corridos, no hábiles: un fin de semana no estira el plazo', () => {
		// 2026-03-01 es domingo; 11 días después sigue estando fuera.
		expect(mod.dentroDelPlazoDeArrepentimiento(entrega, new Date('2026-03-13T12:00:00Z'))).toBe(false);
	});

	it('sin fecha de entrega registrada se asume en plazo, no se le niega el derecho', () => {
		expect(mod.dentroDelPlazoDeArrepentimiento(null)).toBe(true);
		expect(mod.dentroDelPlazoDeArrepentimiento('fecha basura')).toBe(true);
	});
});

describe('qué resolución corresponde según el motivo', () => {
	it('arrepentimiento sugiere devolver la plata, como exige la ley', () => {
		expect(mod.resolucionSugerida('arrepentimiento')).toBe('reintegro');
	});

	it('garantía también sugiere reintegro', () => {
		expect(mod.resolucionSugerida('garantia')).toBe('reintegro');
	});

	it('un cambio por preferencia se resuelve naturalmente con saldo a favor', () => {
		expect(mod.resolucionSugerida('cambio_preferencia')).toBe('saldo_a_favor');
	});

	it('dar saldo a favor en un arrepentimiento exige consentimiento del cliente', () => {
		expect(mod.requiereConsentimiento('arrepentimiento', 'saldo_a_favor')).toBe(true);
		expect(mod.requiereConsentimiento('arrepentimiento', 'reintegro')).toBe(false);
		expect(mod.requiereConsentimiento('cambio_preferencia', 'saldo_a_favor')).toBe(false);
	});
});

describe('crear una devolución', () => {
	it('nace solicitada, con el monto y el plazo que calculó el servidor', async () => {
		createDocument.mockResolvedValue(solicitud());

		await mod.crearDevolucion({
			orderId: 'o1', profileId: 'p1', motivo: 'garantia',
			montoCentavos: 50000, dentroDePlazo: false, detalle: 'Llegó roto'
		});

		// call 0 es el lock; call 1 el documento.
		const payload = createDocument.mock.calls[1][3];
		expect(payload.estado).toBe('solicitada');
		expect(payload.monto_centavos).toBe(50000);
		expect(payload.dentro_de_plazo).toBe(false);
		expect(payload.detalle).toBe('Llegó roto');
	});

	it('no deja abrir dos devoluciones a la vez para el mismo pedido', async () => {
		createDocument.mockRejectedValueOnce(
			Object.assign(new Error('Document already exists'), { code: 409 })
		);

		await expect(
			mod.crearDevolucion({ orderId: 'o1', profileId: 'p1', motivo: 'garantia', montoCentavos: 1, dentroDePlazo: true })
		).rejects.toThrow(/ya hay una devolución/i);
	});

	it('si falla la escritura suelta el reclamo, para poder reintentar', async () => {
		createDocument
			.mockResolvedValueOnce({ $id: 'lock' })
			.mockRejectedValueOnce(new Error('boom'));

		await expect(
			mod.crearDevolucion({ orderId: 'o1', profileId: 'p1', motivo: 'garantia', montoCentavos: 1, dentroDePlazo: true })
		).rejects.toThrow('boom');
		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'devolucion-abierta_o1');
	});
});

describe('resolver una devolución', () => {
	it('aprobar deja registro de quién, cuándo y cómo se resuelve', async () => {
		getDocument.mockResolvedValue(solicitud());
		updateDocument.mockResolvedValue(solicitud({ estado: 'aprobada' }));

		await mod.resolverDevolucion({
			devolucionId: 'd1', estado: 'aprobada', resolucion: 'reintegro',
			actorProfileId: 'admin1', notaAdmin: 'Verificado'
		});

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBe('aprobada');
		expect(payload.resolucion).toBe('reintegro');
		expect(payload.resuelto_por).toBe('admin1');
		expect(payload.resuelto_at).toBeTruthy();
	});

	it('no se puede aprobar sin decir cómo se resuelve', async () => {
		getDocument.mockResolvedValue(solicitud());
		await expect(
			mod.resolverDevolucion({ devolucionId: 'd1', estado: 'aprobada', actorProfileId: 'a1' })
		).rejects.toThrow(/cómo se resuelve/i);
	});

	it('no se resuelve dos veces: acreditar el saldo de nuevo sería regalar plata', async () => {
		getDocument.mockResolvedValue(solicitud({ estado: 'aprobada' }));
		await expect(
			mod.resolverDevolucion({ devolucionId: 'd1', estado: 'rechazada', actorProfileId: 'a1' })
		).rejects.toThrow(/ya está "aprobada"/);
		expect(updateDocument).not.toHaveBeenCalled();
	});

	it('el monto se puede bajar (devolución parcial) pero nunca subir', async () => {
		getDocument.mockResolvedValue(solicitud({ monto_centavos: 50000 }));
		updateDocument.mockResolvedValue(solicitud());

		await mod.resolverDevolucion({
			devolucionId: 'd1', estado: 'aprobada', resolucion: 'saldo_a_favor',
			montoCentavos: 20000, actorProfileId: 'a1'
		});
		expect(updateDocument.mock.calls[0][3].monto_centavos).toBe(20000);

		vi.clearAllMocks();
		getDocument.mockResolvedValue(solicitud({ monto_centavos: 50000 }));
		updateDocument.mockResolvedValue(solicitud());

		await mod.resolverDevolucion({
			devolucionId: 'd1', estado: 'aprobada', resolucion: 'saldo_a_favor',
			montoCentavos: 999999, actorProfileId: 'a1'
		});
		expect(updateDocument.mock.calls[0][3].monto_centavos).toBe(50000);
	});

	it('al resolver libera el reclamo, para que el pedido pueda tener otra devolución', async () => {
		getDocument.mockResolvedValue(solicitud());
		updateDocument.mockResolvedValue(solicitud({ estado: 'rechazada' }));

		await mod.resolverDevolucion({ devolucionId: 'd1', estado: 'rechazada', actorProfileId: 'a1' });

		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'devolucion-abierta_o1');
	});
});

describe('degradación cuando la colección no existe', () => {
	it('el panel y la cuenta del cliente siguen vivos, sin devoluciones', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.devolucionesDisponibles()).resolves.toBe(false);
		await expect(mod.devolucionesParaPanel()).resolves.toEqual([]);
		await expect(mod.devolucionesDeCliente('p1')).resolves.toEqual([]);
	});

	it('crear sí falla, con un mensaje que dice qué correr', async () => {
		createDocument
			.mockResolvedValueOnce({ $id: 'lock' })
			.mockRejectedValueOnce(faltaColeccion);
		await expect(
			mod.crearDevolucion({ orderId: 'o1', profileId: 'p1', motivo: 'garantia', montoCentavos: 1, dentroDePlazo: true })
		).rejects.toThrow(/setup_return_requests/);
	});
});
