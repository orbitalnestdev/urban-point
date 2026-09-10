import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * El saldo a favor es plata: la regla que más importa acá es que el mismo
 * crédito no se pueda gastar dos veces. La reserva se hace dentro de un
 * reclamo atómico (src/lib/server/locks.ts) y el saldo se revalida adentro,
 * porque "leer el saldo y después escribir" tiene una ventana real entre las
 * dos cosas: dos pestañas del mismo cliente pagando a la vez.
 *
 * Como la colección se crea a mano con credenciales
 * (scripts/setup_credit_ledger.ts), el módulo degrada en las lecturas
 * mientras tanto, pero las escrituras fallan avisando qué correr.
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

const movimiento = (over: Record<string, any> = {}) => ({
	$id: 'm' + Math.random().toString(36).slice(2, 8),
	profile_id: 'p1',
	monto_centavos: 1000,
	tipo: 'emision',
	estado: 'confirmado',
	created_at: '2026-01-01T00:00:00.000Z',
	...over
});

let mod: typeof import('../../src/lib/server/creditos');

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mod = await import('../../src/lib/server/creditos');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('el saldo es la suma de los movimientos', () => {
	it('suma emisiones y resta reservas', async () => {
		listDocuments.mockResolvedValue({
			documents: [
				movimiento({ monto_centavos: 10000 }),
				movimiento({ monto_centavos: -3000, tipo: 'reserva', estado: 'reservado' })
			]
		});
		await expect(mod.saldoDisponible('p1')).resolves.toBe(7000);
	});

	it('una reserva confirmada sigue descontando: ya se gastó', async () => {
		listDocuments.mockResolvedValue({
			documents: [
				movimiento({ monto_centavos: 10000 }),
				movimiento({ monto_centavos: -3000, tipo: 'reserva', estado: 'confirmado' })
			]
		});
		await expect(mod.saldoDisponible('p1')).resolves.toBe(7000);
	});

	it('una reserva liberada vuelve al saldo', async () => {
		listDocuments.mockResolvedValue({
			documents: [
				movimiento({ monto_centavos: 10000 }),
				movimiento({ monto_centavos: -3000, tipo: 'reserva', estado: 'liberado' })
			]
		});
		await expect(mod.saldoDisponible('p1')).resolves.toBe(10000);
	});

	it('nunca devuelve negativo, aunque los asientos den negativo', async () => {
		listDocuments.mockResolvedValue({
			documents: [movimiento({ monto_centavos: -500, tipo: 'ajuste' })]
		});
		await expect(mod.saldoDisponible('p1')).resolves.toBe(0);
	});

	it('sin cliente no consulta nada', async () => {
		await expect(mod.saldoDisponible('')).resolves.toBe(0);
		expect(listDocuments).not.toHaveBeenCalled();
	});
});

describe('reservar saldo para un pedido', () => {
	it('reserva sólo hasta el total del pedido, aunque haya más saldo', async () => {
		// call 0: lock del pedido. call 1: turno del cliente. call 2: el asiento.
		createDocument.mockResolvedValue({ $id: 'ok' });
		listDocuments.mockResolvedValue({ documents: [movimiento({ monto_centavos: 10000 })] });

		const reservado = await mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 4000 });

		expect(reservado).toBe(4000);
		const payload = createDocument.mock.calls[2][3];
		expect(payload.monto_centavos).toBe(-4000);
		expect(payload.estado).toBe('reservado');
		expect(payload.order_id).toBe('o1');
	});

	it('toma un turno por cliente además del reclamo del pedido, y lo suelta al terminar', async () => {
		createDocument.mockResolvedValue({ $id: 'ok' });
		listDocuments.mockResolvedValue({ documents: [movimiento({ monto_centavos: 10000 })] });

		await mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 4000 });

		// Los dos reclamos, con el ID ya sanitizado por locks.ts.
		expect(createDocument.mock.calls[0][2]).toBe('credito-reserva_o1');
		expect(createDocument.mock.calls[1][2]).toBe('credito-cliente_p1');
		// El turno del cliente se suelta; el del pedido no (una orden reserva una
		// sola vez en su vida).
		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'credito-cliente_p1');
		expect(deleteDocument).not.toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'credito-reserva_o1');
	});

	it('si otro checkout del mismo cliente tiene el turno, no reserva en vez de gastar dos veces', async () => {
		// El lock del pedido se consigue; el turno del cliente no, nunca.
		createDocument.mockImplementation((_db: string, _col: string, id: string) => {
			if (id === 'credito-cliente_p1') {
				return Promise.reject(Object.assign(new Error('Document already exists'), { code: 409 }));
			}
			return Promise.resolve({ $id: id });
		});
		listDocuments.mockResolvedValue({ documents: [movimiento({ monto_centavos: 10000 })] });

		await expect(
			mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 4000 })
		).resolves.toBe(0);
		// Y suelta el reclamo del pedido, para que se pueda reintentar.
		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'credito-reserva_o1');
	});

	it('si el saldo alcanza para menos, reserva lo que hay', async () => {
		createDocument.mockResolvedValue({ $id: 'ok' });
		listDocuments.mockResolvedValue({ documents: [movimiento({ monto_centavos: 1500 })] });

		await expect(
			mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 9000 })
		).resolves.toBe(1500);
	});

	it('sin saldo no escribe ningún asiento', async () => {
		createDocument.mockResolvedValue({ $id: 'lock' });
		listDocuments.mockResolvedValue({ documents: [] });

		await expect(
			mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 5000 })
		).resolves.toBe(0);
		// Sólo se escribieron los dos reclamos, no el asiento.
		expect(createDocument).toHaveBeenCalledTimes(2);
	});

	it('no se gasta dos veces: el segundo intento concurrente no reserva nada', async () => {
		// El lock ya lo tiene otra request: Appwrite responde 409.
		createDocument.mockRejectedValueOnce(
			Object.assign(new Error('Document already exists'), { code: 409 })
		);

		await expect(
			mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 5000 })
		).resolves.toBe(0);
		expect(createDocument).toHaveBeenCalledTimes(1);
	});

	it('si falla el asiento, suelta el reclamo para no dejar el pedido trabado', async () => {
		createDocument
			.mockResolvedValueOnce({ $id: 'lock-pedido' })
			.mockResolvedValueOnce({ $id: 'lock-cliente' })
			.mockRejectedValueOnce(new Error('boom'));
		listDocuments.mockResolvedValue({ documents: [movimiento({ monto_centavos: 10000 })] });

		await expect(
			mod.reservarParaOrden({ profileId: 'p1', orderId: 'o1', hastaCentavos: 4000 })
		).rejects.toThrow('boom');
		expect(deleteDocument).toHaveBeenCalledWith('urbanpoint', 'processing_locks', 'credito-reserva_o1');
	});
});

describe('confirmar y liberar la reserva', () => {
	it('confirmar marca el asiento como gastado', async () => {
		listDocuments.mockResolvedValue({
			documents: [movimiento({ $id: 'r1', tipo: 'reserva', estado: 'reservado', monto_centavos: -4000 })]
		});

		await mod.confirmarReserva('o1');

		expect(updateDocument).toHaveBeenCalledWith('urbanpoint', 'credit_ledger', 'r1', { estado: 'confirmado' });
	});

	it('confirmar dos veces no vuelve a escribir', async () => {
		listDocuments.mockResolvedValue({
			documents: [movimiento({ tipo: 'reserva', estado: 'confirmado' })]
		});

		await mod.confirmarReserva('o1');

		expect(updateDocument).not.toHaveBeenCalled();
	});

	it('liberar devuelve el saldo y deja el motivo asentado', async () => {
		listDocuments.mockResolvedValue({
			documents: [movimiento({ $id: 'r1', tipo: 'reserva', estado: 'reservado', motivo: 'Saldo aplicado' })]
		});

		await mod.liberarReserva('o1', 'pago rechazado');

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBe('liberado');
		expect(payload.motivo).toContain('pago rechazado');
	});

	it('liberar nunca hace fallar al que la llama', async () => {
		listDocuments.mockRejectedValue(new Error('red caída'));
		await expect(mod.liberarReserva('o1', 'lo que sea')).resolves.toBeUndefined();
	});
});

describe('emisión y ajuste', () => {
	it('emitir acredita un asiento positivo ya confirmado', async () => {
		createDocument.mockResolvedValue({ $id: 'e1' });

		await mod.emitirCredito({ profileId: 'p1', montoCentavos: 2500, motivo: 'Devolución', returnId: 'd1' });

		const payload = createDocument.mock.calls[0][3];
		expect(payload.monto_centavos).toBe(2500);
		expect(payload.tipo).toBe('emision');
		expect(payload.estado).toBe('confirmado');
		expect(payload.return_id).toBe('d1');
	});

	it('no se puede emitir cero ni negativo', async () => {
		await expect(mod.emitirCredito({ profileId: 'p1', montoCentavos: 0, motivo: 'x' })).rejects.toThrow();
		await expect(mod.emitirCredito({ profileId: 'p1', montoCentavos: -100, motivo: 'x' })).rejects.toThrow();
		expect(createDocument).not.toHaveBeenCalled();
	});

	it('un ajuste manual sí puede ser negativo, pero exige motivo', async () => {
		createDocument.mockResolvedValue({ $id: 'a1' });

		await mod.ajustarSaldo({ profileId: 'p1', montoCentavos: -500, motivo: 'Carga duplicada' });
		expect(createDocument.mock.calls[0][3].monto_centavos).toBe(-500);

		await expect(mod.ajustarSaldo({ profileId: 'p1', montoCentavos: -500, motivo: '  ' })).rejects.toThrow();
	});
});

describe('degradación cuando la colección no existe', () => {
	it('el saldo del cliente se lee como cero y la página sigue viva', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.saldoDisponible('p1')).resolves.toBe(0);
		await expect(mod.movimientosDe('p1')).resolves.toEqual([]);
	});

	it('creditosDisponibles avisa que no, en vez de tirar', async () => {
		listDocuments.mockRejectedValue(faltaColeccion);
		await expect(mod.creditosDisponibles()).resolves.toBe(false);
	});

	it('emitir sí falla, con un mensaje que dice qué correr', async () => {
		createDocument.mockRejectedValue(faltaColeccion);
		await expect(
			mod.emitirCredito({ profileId: 'p1', montoCentavos: 100, motivo: 'x' })
		).rejects.toThrow(/setup_credit_ledger/);
	});

	it('un error real no se confunde con colección faltante', async () => {
		listDocuments.mockRejectedValue(Object.assign(new Error('Rate limit'), { code: 429 }));
		await expect(mod.creditosDisponibles()).rejects.toThrow('Rate limit');
	});
});
