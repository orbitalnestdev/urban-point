import { describe, it, expect } from 'vitest';
import { tierDeRol, resolveProductPriceForUser } from '../../src/lib/pricingEngine';
import { precioParaTier } from '../../src/lib/server/catalogView';
import { precioDeVentaCentavos, precioListaCentavos } from '../../src/lib/pricing';
import { esComprador, ROLES_COMPRADORES, NIVEL_ROL } from '../../src/lib/server/auth';

/**
 * El nivel `distribuidor` estaba implementado en el catálogo, en el importador
 * y en el checkout, pero no existía como rol: `UserRole` no lo incluía, así que
 * getClientProfile lo trataba como "no es cliente" y devolvía null. El
 * distribuidor quedaba fuera de /mi-cuenta y su pedido se guardaba SIN
 * customer_id, mientras el checkout le cobraba precio mayorista.
 */
describe('roles compradores', () => {
	it('cliente y distribuidor compran; el resto no', () => {
		expect(esComprador('cliente')).toBe(true);
		expect(esComprador('distribuidor')).toBe(true);
		expect(esComprador('canillita')).toBe(false);
		expect(esComprador('admin')).toBe(false);
		expect(esComprador('gestion')).toBe(false);
		expect(esComprador(undefined)).toBe(false);
		expect(esComprador('')).toBe(false);
	});

	it('los dos compradores están en la jerarquía de roles', () => {
		for (const rol of ROLES_COMPRADORES) {
			expect(NIVEL_ROL[rol]).toBeDefined();
			expect(NIVEL_ROL[rol]).toBeLessThan(NIVEL_ROL.admin);
		}
	});
});

describe('tierDeRol', () => {
	it('mapea cada rol a su nivel de precio', () => {
		expect(tierDeRol('distribuidor')).toBe('distribuidor');
		expect(tierDeRol('canillita')).toBe('canillita');
		expect(tierDeRol('cliente')).toBe('publico');
	});

	it('cualquier otro rol, o ninguno, paga precio público', () => {
		expect(tierDeRol('admin')).toBe('publico');
		expect(tierDeRol('gestion')).toBe('publico');
		expect(tierDeRol(undefined)).toBe('publico');
		expect(tierDeRol(null)).toBe('publico');
		expect(tierDeRol('inventado')).toBe('publico');
	});

	it('no distingue mayúsculas', () => {
		expect(tierDeRol('DISTRIBUIDOR')).toBe('distribuidor');
		expect(tierDeRol('Canillita')).toBe('canillita');
	});
});

describe('precioParaTier: lo que se muestra es lo que se cobra', () => {
	const producto = {
		precio: 100000,
		price_publico: 100000,
		price_canillita: 80000,
		price_distribuidor: 60000
	};

	it('cada nivel ve su propio precio', () => {
		expect(precioParaTier(producto, 'publico').venta).toBe(100000);
		expect(precioParaTier(producto, 'canillita').venta).toBe(80000);
		expect(precioParaTier(producto, 'distribuidor').venta).toBe(60000);
	});

	it('coincide con lo que el checkout va a cobrar', () => {
		for (const [rol, tier] of [['cliente','publico'],['canillita','canillita'],['distribuidor','distribuidor']] as const) {
			const mostrado = precioParaTier(producto, tier).venta;
			const cobrado = resolveProductPriceForUser(producto, rol).unitPriceCentavos;
			expect(mostrado).toBe(cobrado);
		}
	});

	it('el precio público queda tachado para que el descuento se vea', () => {
		expect(precioParaTier(producto, 'distribuidor').lista).toBe(100000);
		expect(precioParaTier(producto, 'canillita').lista).toBe(80000 < 100000 ? 100000 : null);
	});

	it('sin promoción, el nivel público no tacha nada', () => {
		expect(precioParaTier(producto, 'publico').lista).toBeNull();
	});

	it('el nivel público conserva exactamente el comportamiento anterior', () => {
		const conPromo = { precio: 100000, price_publico: 100000, precio_promocional: 70000 };
		expect(precioParaTier(conPromo, 'publico').venta).toBe(precioDeVentaCentavos(conPromo));
		expect(precioParaTier(conPromo, 'publico').lista).toBe(precioListaCentavos(conPromo));
	});

	it('sin precio para su nivel, cae a público y no inventa descuento', () => {
		const soloPublico = { precio: 50000, price_publico: 50000 };
		const r = precioParaTier(soloPublico, 'distribuidor');
		expect(r.venta).toBe(50000);
		expect(r.lista).toBeNull();
	});

	it('sin precio de nivel pero con promo pública, muestra la promo y su lista', () => {
		const conPromo = { precio: 50000, price_publico: 50000, precio_promocional: 40000 };
		const r = precioParaTier(conPromo, 'distribuidor');
		expect(r.venta).toBe(40000);
		expect(r.lista).toBe(50000);
	});

	it('si el precio del nivel no es menor al público, no tacha', () => {
		const parejo = { precio: 60000, price_publico: 60000, price_distribuidor: 60000 };
		expect(precioParaTier(parejo, 'distribuidor').lista).toBeNull();
	});
});
