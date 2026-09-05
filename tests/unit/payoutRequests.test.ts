import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Las solicitudes de cobro viven en su propia colección y no en `payouts`,
 * donde un documento significa "ya se pagó": los seis lectores de payouts
 * asumen eso y ninguno filtra por estado, así que una fila "solicitada" les
 * ensuciaría al canillita su historial de cobros y al admin el total
 * liquidado.
 *
 * Como la colección se crea a mano con credenciales
 * (scripts/setup_payout_requests.ts), el módulo tiene que degradar sin romper
 * mientras tanto.
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

let mod: typeof import('../../src/lib/server/payoutRequests');

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mod = await import('../../src/lib/server/payoutRequests');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('degradación cuando la colección no existe', () => {
	it('solicitudesDisponibles avisa que no, en vez de tirar', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.solicitudesDisponibles()).resolves.toBe(false);
	});

	it('el historial del canillita queda vacío y la página sigue viva', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.solicitudesDeCanillita('p1')).resolves.toEqual([]);
	});

	it('el panel de admin no ve solicitudes pendientes', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.solicitudesPendientes()).resolves.toEqual([]);
	});

	it('crear una solicitud sí falla, con un mensaje que dice qué correr', async () => {
		createDocument.mockRejectedValue(faltaColeccion);
		await expect(mod.crearSolicitud({ profileId: 'p1', montoCentavos: 1000 }))
			.rejects.toThrow(/setup_payout_requests/);
	});

	it('cerrar la solicitud al pagar nunca hace fallar el pago', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.cerrarSolicitudPorPago('p1', 'payout-1')).resolves.toBeUndefined();
	});
});

describe('un error real de Appwrite no se confunde con la colección faltante', () => {
	it('solicitudesDisponibles propaga el error', async () => {
		listDocuments.mockRejectedValue(Object.assign(new Error('rate limit'), { code: 429 }));
		await expect(mod.solicitudesDisponibles()).rejects.toThrow('rate limit');
	});
});

describe('crearSolicitud', () => {
	// createDocument se llama dos veces: la primera es el reclamo de exclusión
	// mutua en processing_locks (ver src/lib/server/locks.ts), la segunda es
	// la solicitud real — por eso los payloads de estos tests son calls[1].
	it('nace en estado solicitada, con el monto que le pasa el servidor', async () => {
		createDocument.mockResolvedValue({ $id: 's1' });
		await mod.crearSolicitud({ profileId: 'p1', montoCentavos: 12345.6, nota: 'hola' });

		const payload = createDocument.mock.calls[1][3];
		expect(payload.profile_id).toBe('p1');
		expect(payload.estado).toBe('solicitada');
		expect(payload.monto_centavos).toBe(12346); // entero, sin flotantes
		expect(payload.nota_canillita).toBe('hola');
		expect(typeof payload.solicitado_at).toBe('string');
	});

	it('recorta la nota a 500 caracteres', async () => {
		createDocument.mockResolvedValue({ $id: 's1' });
		await mod.crearSolicitud({ profileId: 'p1', montoCentavos: 100, nota: 'x'.repeat(900) });
		expect(createDocument.mock.calls[1][3].nota_canillita).toHaveLength(500);
	});

	it('no deja pedir dos veces a la vez: el segundo reclamo concurrente se rechaza', async () => {
		// Primer pedido: reclamo (call 1) y solicitud (call 2) resuelven bien.
		createDocument.mockResolvedValueOnce({ $id: 'lock1' });
		createDocument.mockResolvedValueOnce({ $id: 's1' });
		await mod.crearSolicitud({ profileId: 'p1', montoCentavos: 100 });

		// Segundo pedido "simultáneo": el reclamo choca con un 409, tal como
		// haría Appwrite si el documento con ese $id ya existe.
		createDocument.mockRejectedValueOnce(Object.assign(new Error('Document already exists'), { code: 409 }));
		await expect(mod.crearSolicitud({ profileId: 'p1', montoCentavos: 100 }))
			.rejects.toThrow(/ya tenés una solicitud/i);
	});
});

describe('solicitudAbierta', () => {
	it('busca sólo los estados que bloquean pedir otra vez', async () => {
		listDocuments.mockResolvedValue({ documents: [] });
		await mod.solicitudAbierta('p1');

		const queries = JSON.stringify(listDocuments.mock.calls[0][2]);
		expect(queries).toContain('solicitada');
		expect(queries).toContain('aprobada');
		expect(queries).not.toContain('rechazada');
		expect(queries).not.toContain('pagada');
	});

	it('devuelve null si no hay ninguna abierta', async () => {
		listDocuments.mockResolvedValue({ documents: [] });
		await expect(mod.solicitudAbierta('p1')).resolves.toBeNull();
	});
});

describe('resolverSolicitud', () => {
	it('deja registro de quién resolvió y cuándo', async () => {
		getDocument.mockResolvedValue({ $id: 's1', estado: 'solicitada', profile_id: 'p1' });
		updateDocument.mockResolvedValue({ $id: 's1' });
		await mod.resolverSolicitud({
			solicitudId: 's1',
			estado: 'aprobada',
			actorProfileId: 'admin-1',
			notaAdmin: 'ok'
		});

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBe('aprobada');
		expect(payload.resuelto_por).toBe('admin-1');
		expect(payload.nota_admin).toBe('ok');
		expect(typeof payload.resuelto_at).toBe('string');
		// 'aprobada' sigue siendo un estado abierto: no libera el reclamo.
		expect(deleteDocument).not.toHaveBeenCalled();
	});

	it('no deja resolver una solicitud que ya estaba resuelta', async () => {
		getDocument.mockResolvedValue({ $id: 's1', estado: 'pagada', profile_id: 'p1' });
		await expect(mod.resolverSolicitud({
			solicitudId: 's1',
			estado: 'aprobada',
			actorProfileId: 'admin-1'
		})).rejects.toThrow(/ya está "pagada"/);
		expect(updateDocument).not.toHaveBeenCalled();
	});

	it('al pasar a un estado final, libera el reclamo de "solicitud abierta"', async () => {
		getDocument.mockResolvedValue({ $id: 's1', estado: 'solicitada', profile_id: 'p1' });
		updateDocument.mockResolvedValue({ $id: 's1' });
		await mod.resolverSolicitud({ solicitudId: 's1', estado: 'rechazada', actorProfileId: 'admin-1' });
		// El ':' de la clave no es válido en un $id de Appwrite: locks.ts lo
		// sanitiza (ver idDesdeClave) antes de usarlo.
		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'open-payout-request_p1');
	});
});

describe('cerrarSolicitudPorPago', () => {
	it('marca como pagada la solicitud abierta y la enlaza al payout', async () => {
		listDocuments.mockResolvedValue({ documents: [{ $id: 's1', estado: 'aprobada', profile_id: 'p1' }] });
		getDocument.mockResolvedValue({ $id: 's1', estado: 'aprobada', profile_id: 'p1' });
		updateDocument.mockResolvedValue({ $id: 's1' });

		await mod.cerrarSolicitudPorPago('p1', 'payout-9');

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBe('pagada');
		expect(payload.payout_id).toBe('payout-9');
	});

	it('no hace nada si el canillita no había pedido nada', async () => {
		listDocuments.mockResolvedValue({ documents: [] });
		await mod.cerrarSolicitudPorPago('p1', 'payout-9');
		expect(updateDocument).not.toHaveBeenCalled();
	});
});
