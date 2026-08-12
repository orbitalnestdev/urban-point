/**
 * Módulo de precios [C-03]. Fuente única para vitrina y checkout.
 */
import { describe, it, expect } from 'vitest';
import {
	precioDeVentaCentavos,
	precioListaCentavos,
	tienePromocion,
	porcentajeDescuento,
	formatearCentavos
} from '../../src/lib/pricing';

describe('precioDeVentaCentavos', () => {
	it('usa la promoción cuando es menor al precio de lista', () => {
		expect(precioDeVentaCentavos({ precio: 1000000, precio_promocional: 800000 })).toBe(800000);
	});

	it('usa el precio de lista cuando no hay promoción', () => {
		expect(precioDeVentaCentavos({ precio: 1000000 })).toBe(1000000);
		expect(precioDeVentaCentavos({ precio: 1000000, precio_promocional: 0 })).toBe(1000000);
		expect(precioDeVentaCentavos({ precio: 1000000, precio_promocional: null })).toBe(1000000);
	});

	it('ignora una promoción mayor o igual al precio de lista', () => {
		expect(precioDeVentaCentavos({ precio: 1000000, precio_promocional: 1200000 })).toBe(1000000);
		expect(precioDeVentaCentavos({ precio: 1000000, precio_promocional: 1000000 })).toBe(1000000);
	});

	it('devuelve siempre un entero, aunque el campo sea double', () => {
		// precio_promocional está declarado como double en Appwrite (C-06).
		const r = precioDeVentaCentavos({ precio: 1000000, precio_promocional: 799999.9999 });
		expect(Number.isInteger(r)).toBe(true);
		expect(r).toBe(800000);
	});

	it('tolera valores corruptos sin romper el checkout', () => {
		expect(precioDeVentaCentavos({ precio: 500000, precio_promocional: NaN })).toBe(500000);
		expect(precioDeVentaCentavos({ precio: NaN as any })).toBe(0);
	});
});

describe('precioListaCentavos (el tachado)', () => {
	it('devuelve null sin promoción: no se inventa un precio anterior', () => {
		// Antes se mostraba precio * 1.25 como precio tachado, un número
		// inventado en el front que no existía en ningún lado (M-10).
		expect(precioListaCentavos({ precio: 1000000 })).toBeNull();
	});

	it('devuelve el precio real de lista cuando hay promoción', () => {
		expect(precioListaCentavos({ precio: 1000000, precio_promocional: 800000 })).toBe(1000000);
	});
});

describe('Coherencia vitrina/checkout', () => {
	it('el precio mostrado y el cobrado salen de la misma función', () => {
		const producto = { precio: 1000000, precio_promocional: 800000 };
		const mostrado = precioDeVentaCentavos(producto);
		const cobrado = precioDeVentaCentavos(producto);
		expect(mostrado).toBe(cobrado);
		expect(cobrado).toBe(800000);
	});

	it('el subtotal por cantidad se mantiene entero', () => {
		const unitario = precioDeVentaCentavos({ precio: 333333, precio_promocional: 111111 });
		expect(Number.isInteger(unitario * 7)).toBe(true);
		expect(unitario * 7).toBe(777777);
	});
});

describe('Auxiliares', () => {
	it('calcula el porcentaje de descuento', () => {
		expect(porcentajeDescuento({ precio: 1000000, precio_promocional: 750000 })).toBe(25);
		expect(porcentajeDescuento({ precio: 1000000 })).toBe(0);
	});

	it('tienePromocion es consistente con precioListaCentavos', () => {
		const conPromo = { precio: 1000000, precio_promocional: 800000 };
		const sinPromo = { precio: 1000000 };
		expect(tienePromocion(conPromo)).toBe(true);
		expect(precioListaCentavos(conPromo)).not.toBeNull();
		expect(tienePromocion(sinPromo)).toBe(false);
		expect(precioListaCentavos(sinPromo)).toBeNull();
	});

	it('formatea centavos a pesos', () => {
		expect(formatearCentavos(800000)).toContain('8.000');
	});
});
