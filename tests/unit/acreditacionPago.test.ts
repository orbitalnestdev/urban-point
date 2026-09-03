import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

/**
 * La cadena que se dispara cuando entra un pago: acreditar la orden, descontar
 * stock, devengar la comisión y avisar por mail.
 *
 * Es lo más sensible del sistema y nunca se había ejecutado en una prueba: la
 * auditoría de agosto lo dejó anotado como "no verificado" y seguía igual,
 * porque probarlo de verdad exige credenciales de Mercado Pago.
 *
 * Esto no las necesita. Se simulan Appwrite, el mailer y las comisiones, y se
 * verifica lo que hace NUESTRO código con cada estado de pago. Lo que no
 * cubre —y sigue pendiente— es que Mercado Pago entregue el webhook y que la
 * respuesta real de su API tenga la forma que esperamos; eso sólo se cierra
 * con un pago de prueba real.
 */

const getDocument = vi.fn();
const updateDocument = vi.fn();
const listDocuments = vi.fn();

const resolverComisiones = vi.fn();
const revertirComisiones = vi.fn();
const restaurarStockDeOrden = vi.fn();
const cancelarOrdenYRestaurarStock = vi.fn();
const sendOrderNotificationEmails = vi.fn();

vi.mock('../../src/lib/server/appwrite', () => ({
	createAdminClient: () => ({ databases: { getDocument, updateDocument, listDocuments } }),
	escribirDocumentoTolerante: vi.fn()
}));

vi.mock('../../src/lib/commissions', () => ({
	resolverComisiones,
	revertirComisiones,
	restaurarStockDeOrden,
	cancelarOrdenYRestaurarStock
}));

vi.mock('../../src/lib/server/mailer', () => ({ sendOrderNotificationEmails }));
vi.mock('../../src/lib/server/mercadopagoOAuth', () => ({
	obtenerTokenPlataformaValido: vi.fn(async () => 'TEST-token')
}));

let mod: typeof import('../../src/pages/api/webhooks/mercadopago');

/** Orden pendiente de pago, por $10.000 (en centavos). */
const ordenPendiente = () => ({
	$id: 'orden-1',
	numero: '123456',
	estado: 'pendiente_pago',
	total: 1000000,
	subtotal: 1000000,
	costo_envio: 0,
	fulfillment: 'retiro',
	customer_id: 'cliente-1',
	pickup_point_id: null
});

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	listDocuments.mockResolvedValue({ documents: [] });
	updateDocument.mockResolvedValue({});
	mod = await import('../../src/pages/api/webhooks/mercadopago');
});

afterEach(() => vi.restoreAllMocks());

describe('pago aprobado', () => {
	it('marca la orden como pagada y devenga las comisiones', async () => {
		getDocument.mockResolvedValue(ordenPendiente());

		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 10000);

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBe('pagado');
		expect(payload.mp_payment_id).toBe('pago-9');
		expect(typeof payload.paid_at).toBe('string');

		// El descuento de stock vive dentro de resolverComisiones.
		expect(resolverComisiones).toHaveBeenCalledWith('orden-1');
	});

	it('no reprocesa una orden que ya estaba pagada', async () => {
		getDocument.mockResolvedValue({ ...ordenPendiente(), estado: 'pagado' });

		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 10000);

		expect(updateDocument).not.toHaveBeenCalled();
		expect(resolverComisiones).not.toHaveBeenCalled();
	});

	it('reenviar el mismo webhook no duplica el descuento de stock', async () => {
		getDocument.mockResolvedValueOnce(ordenPendiente());
		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 10000);

		// El segundo aviso ya encuentra la orden pagada.
		getDocument.mockResolvedValueOnce({ ...ordenPendiente(), estado: 'pagado' });
		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 10000);

		expect(resolverComisiones).toHaveBeenCalledTimes(1);
	});
});

describe('el importe tiene que cubrir el total', () => {
	it('un pago parcial NO acredita la orden', async () => {
		getDocument.mockResolvedValue(ordenPendiente());

		// Pagó $50 de una orden de $10.000.
		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 50);

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.estado).toBeUndefined();
		expect(payload.mp_status).toContain('monto_insuficiente');
		expect(resolverComisiones).not.toHaveBeenCalled();
	});

	it('pagar de más sí acredita', async () => {
		getDocument.mockResolvedValue(ordenPendiente());
		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', 10500);
		expect(updateDocument.mock.calls[0][3].estado).toBe('pagado');
	});

	it('sin importe informado se acredita igual, sin inventar una comparación', async () => {
		getDocument.mockResolvedValue(ordenPendiente());
		await mod.aplicarEstadoDePago('orden-1', 'approved', 'pago-9', null);
		expect(updateDocument.mock.calls[0][3].estado).toBe('pagado');
	});
});

describe('reembolsos y contracargos', () => {
	it('revierte la comisión y devuelve el stock', async () => {
		getDocument.mockResolvedValue({ ...ordenPendiente(), estado: 'pagado' });

		await mod.aplicarEstadoDePago('orden-1', 'refunded', 'pago-9', 10000);

		expect(revertirComisiones).toHaveBeenCalled();
		expect(restaurarStockDeOrden).toHaveBeenCalledWith('orden-1');
		expect(updateDocument.mock.calls[0][3].estado).toBe('reembolsado');
	});

	it('un contracargo se trata igual que un reembolso', async () => {
		getDocument.mockResolvedValue({ ...ordenPendiente(), estado: 'pagado' });
		await mod.aplicarEstadoDePago('orden-1', 'charged_back', 'pago-9', 10000);
		expect(revertirComisiones).toHaveBeenCalled();
		expect(restaurarStockDeOrden).toHaveBeenCalled();
	});

	it('no reembolsa dos veces', async () => {
		getDocument.mockResolvedValue({ ...ordenPendiente(), estado: 'reembolsado' });
		await mod.aplicarEstadoDePago('orden-1', 'refunded', 'pago-9', 10000);
		expect(revertirComisiones).not.toHaveBeenCalled();
	});
});

describe('pagos rechazados o cancelados', () => {
	it('cancela la orden y restaura el stock', async () => {
		getDocument.mockResolvedValue(ordenPendiente());
		await mod.aplicarEstadoDePago('orden-1', 'rejected', 'pago-9', null);
		expect(cancelarOrdenYRestaurarStock).toHaveBeenCalledWith('orden-1');
	});

	it('no cancela una orden que ya se había pagado', async () => {
		getDocument.mockResolvedValue({ ...ordenPendiente(), estado: 'pagado' });
		await mod.aplicarEstadoDePago('orden-1', 'cancelled', 'pago-9', null);
		expect(cancelarOrdenYRestaurarStock).not.toHaveBeenCalled();
	});
});

describe('pagos en curso', () => {
	it('deja registro del estado sin acreditar', async () => {
		getDocument.mockResolvedValue(ordenPendiente());
		await mod.aplicarEstadoDePago('orden-1', 'in_process', 'pago-9', 10000);

		const payload = updateDocument.mock.calls[0][3];
		expect(payload.mp_status).toBe('in_process');
		expect(payload.estado).toBeUndefined();
		expect(resolverComisiones).not.toHaveBeenCalled();
	});
});

/**
 * La firma es lo único que separa un aviso real de Mercado Pago de un POST
 * de cualquiera. Antes no se validaba nada.
 */
describe('validación de la firma del webhook', () => {
	const SECRETO = 'secreto-de-prueba';

	const pedido = (dataId: string, ts: string, v1: string, requestId?: string) =>
		new Request('https://ejemplo.test/api/webhooks/mercadopago', {
			method: 'POST',
			headers: {
				'x-signature': `ts=${ts},v1=${v1}`,
				...(requestId ? { 'x-request-id': requestId } : {})
			}
		});

	const firmar = (dataId: string, ts: string, requestId?: string) => {
		let manifiesto = '';
		if (dataId) manifiesto += `id:${dataId.toLowerCase()};`;
		if (requestId) manifiesto += `request-id:${requestId};`;
		manifiesto += `ts:${ts};`;
		return crypto.createHmac('sha256', SECRETO).update(manifiesto).digest('hex');
	};

	it('acepta una firma correcta', () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const req = pedido('123', ts, firmar('123', ts));
		expect(mod.firmaValida(req, '123', SECRETO)).toBe(true);
	});

	it('acepta cuando viene x-request-id, incluyéndolo en el manifiesto', () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const req = pedido('123', ts, firmar('123', ts, 'req-7'), 'req-7');
		expect(mod.firmaValida(req, '123', SECRETO)).toBe(true);
	});

	it('rechaza una firma inválida', () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const req = pedido('123', ts, 'a'.repeat(64));
		expect(mod.firmaValida(req, '123', SECRETO)).toBe(false);
	});

	it('rechaza la firma hecha con otro secreto', () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const otra = crypto.createHmac('sha256', 'otro').update(`id:123;ts:${ts};`).digest('hex');
		expect(mod.firmaValida(pedido('123', ts, otra), '123', SECRETO)).toBe(false);
	});

	it('rechaza un aviso viejo, aunque la firma sea válida', () => {
		// Reenvío de hace una hora: fuera de la ventana de 5 minutos.
		const viejo = String(Math.floor(Date.now() / 1000) - 3600);
		const req = pedido('123', viejo, firmar('123', viejo));
		expect(mod.firmaValida(req, '123', SECRETO)).toBe(false);
	});

	it('rechaza cuando no hay header de firma', () => {
		const req = new Request('https://ejemplo.test/', { method: 'POST' });
		expect(mod.firmaValida(req, '123', SECRETO)).toBe(false);
	});
});
