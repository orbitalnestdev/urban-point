import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Cobro directo del canillita: cuando el punto cobró el pedido con su propia
 * cuenta de Mercado Pago (order.cobro_directo_canillita = true),
 * resolverComisiones no le devenga un fee_logistica al canillita —ya se
 * quedó con su margen apenas cobró— sino que registra lo que le queda
 * debiendo a la tienda (precio_canillita de cada ítem, fotografiado en
 * createCheckout como costo_canillita_unitario).
 */

const getDocument = vi.fn();
const listDocuments = vi.fn();
const decrementDocumentAttribute = vi.fn();
const createDocument = vi.fn();
const escribirDocumentoTolerante = vi.fn();

vi.mock('../../src/lib/server/appwrite', () => ({
	createAdminClient: () => ({
		databases: { getDocument, listDocuments, decrementDocumentAttribute, createDocument }
	}),
	escribirDocumentoTolerante
}));

let mod: typeof import('../../src/lib/commissions');

const ORDER_ID = 'orden-1';
const CANILLITA_ID = 'canillita-1';

const ordenPagada = (overrides: Record<string, any> = {}) => ({
	$id: ORDER_ID,
	estado: 'pagado',
	price_tier: 'publico',
	pickup_point_id: 'punto-1',
	customer_id: 'cliente-1',
	referral_code_id: null,
	stock_descontado: false,
	...overrides
});

const ITEM = {
	$id: 'item-1',
	product_id: 'prod-1',
	precio_unitario: 100000, // $1000
	cantidad: 1,
	subtotal: 100000,
	costo_canillita_unitario: 90000 // $900 — foto de precio_canillita al vender
};

const PRODUCTO = { $id: 'prod-1', nombre: 'Termo', stock: 50, categoria_id: null };
const PUNTO = { $id: 'punto-1', profile_id: CANILLITA_ID };

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});

	createDocument.mockResolvedValue({ $id: 'lock-1' }); // reclamo de locks.ts
	decrementDocumentAttribute.mockResolvedValue({});
	escribirDocumentoTolerante.mockResolvedValue({});

	getDocument.mockImplementation((_db: string, col: string, id: string) => {
		if (col === 'orders') return Promise.resolve(ordenActual);
		if (col === 'products') return Promise.resolve(PRODUCTO);
		if (col === 'pickup_points') return Promise.resolve(PUNTO);
		return Promise.reject(new Error(`getDocument sin mock para ${col}`));
	});

	listDocuments.mockImplementation((_db: string, col: string) => {
		if (col === 'commission_ledger') return Promise.resolve({ documents: [] });
		if (col === 'order_items') return Promise.resolve({ documents: [ITEM] });
		if (col === 'commission_rules') {
			return Promise.resolve({
				documents: [{ $id: 'regla-1', tipo: 'porcentaje', valor: 1000 }] // 10%
			});
		}
		return Promise.resolve({ documents: [] });
	});

	mod = await import('../../src/lib/commissions');
});

afterEach(() => vi.restoreAllMocks());

// Se reasigna en cada test antes de llamar a resolverComisiones.
let ordenActual: any = ordenPagada();

describe('resolverComisiones — cobro directo del canillita', () => {
	it('registra una deuda (ajuste negativo), no un fee_logistica', async () => {
		ordenActual = ordenPagada({ cobro_directo_canillita: true });

		await mod.resolverComisiones(ORDER_ID);

		const escrituras = escribirDocumentoTolerante.mock.calls
			.filter(([col]) => col === 'commission_ledger')
			.map(([, payload]) => payload);

		expect(escrituras).toHaveLength(1);
		expect(escrituras[0]).toMatchObject({
			profile_id: CANILLITA_ID,
			order_id: ORDER_ID,
			tipo: 'ajuste',
			estado: 'disponible',
			monto_centavos: -90000 // -(costo_canillita_unitario * cantidad)
		});

		// Nunca un fee_logistica en este camino.
		expect(escrituras.some((p: any) => p.tipo === 'fee_logistica')).toBe(false);
	});

	it('sin la foto de costo_canillita_unitario, no inventa una deuda', async () => {
		ordenActual = ordenPagada({ cobro_directo_canillita: true });
		listDocuments.mockImplementation((_db: string, col: string) => {
			if (col === 'order_items') return Promise.resolve({ documents: [{ ...ITEM, costo_canillita_unitario: undefined }] });
			if (col === 'commission_ledger') return Promise.resolve({ documents: [] });
			return Promise.resolve({ documents: [] });
		});

		await mod.resolverComisiones(ORDER_ID);

		const escrituras = escribirDocumentoTolerante.mock.calls.filter(([col]) => col === 'commission_ledger');
		expect(escrituras).toHaveLength(0);
	});

	it('pedidos normales (sin cobro directo) siguen generando fee_logistica, como siempre', async () => {
		ordenActual = ordenPagada({ cobro_directo_canillita: false });

		await mod.resolverComisiones(ORDER_ID);

		const escrituras = escribirDocumentoTolerante.mock.calls
			.filter(([col]) => col === 'commission_ledger')
			.map(([, payload]) => payload);

		expect(escrituras).toHaveLength(1);
		expect(escrituras[0]).toMatchObject({
			profile_id: CANILLITA_ID,
			tipo: 'fee_logistica',
			estado: 'pendiente',
			monto_centavos: 10000 // 10% de $1000
		});
	});

	it('la comisión de referido sigue pagándose aunque el referido sea el dueño del punto', async () => {
		// En el modelo viejo esto se suprimía (ya cobraba fee_logistica). En
		// cobro directo no hay fee_logistica que se le solape: el punto no
		// cobra nada de la plataforma, así que la comisión de referido no es
		// un doble pago.
		ordenActual = ordenPagada({ cobro_directo_canillita: true, referral_code_id: 'ref-1' });
		listDocuments.mockImplementation((_db: string, col: string) => {
			if (col === 'commission_ledger') return Promise.resolve({ documents: [] });
			if (col === 'order_items') return Promise.resolve({ documents: [ITEM] });
			if (col === 'referral_codes') return Promise.resolve({ documents: [] });
			if (col === 'commission_rules') {
				return Promise.resolve({ documents: [{ $id: 'r', tipo: 'porcentaje', valor: 500 }] }); // 5%
			}
			return Promise.resolve({ documents: [] });
		});
		getDocument.mockImplementation((_db: string, col: string) => {
			if (col === 'orders') return Promise.resolve(ordenActual);
			if (col === 'products') return Promise.resolve(PRODUCTO);
			if (col === 'pickup_points') return Promise.resolve(PUNTO);
			if (col === 'referral_codes') return Promise.resolve({ $id: 'ref-1', owner_id: CANILLITA_ID });
			return Promise.reject(new Error(`sin mock para ${col}`));
		});

		await mod.resolverComisiones(ORDER_ID);

		const escrituras = escribirDocumentoTolerante.mock.calls
			.filter(([col]) => col === 'commission_ledger')
			.map(([, payload]) => payload);

		const deuda = escrituras.find((p: any) => p.tipo === 'ajuste');
		const referido = escrituras.find((p: any) => p.tipo === 'comision_referido');

		expect(deuda).toMatchObject({ monto_centavos: -90000 });
		expect(referido).toMatchObject({ profile_id: CANILLITA_ID, monto_centavos: 5000 });
	});
});
