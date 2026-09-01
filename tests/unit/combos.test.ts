import { describe, it, expect } from 'vitest';
import {
	integrantesDeCombo,
	esCombo,
	unidadesQueMueve,
	stockDisponible
} from '../../src/lib/combos';

/**
 * Regla que ordena todo: un combo NO tiene stock propio. Lo disponible sale de
 * sus integrantes, y venderlo los descuenta.
 *
 * Sin esto el inventario miente en las dos direcciones: la vitrina muestra el
 * combo agotado porque su `stock` es 0, y si igual se vendiera no baja ni una
 * unidad de lo que realmente se entregó.
 */

const cafe = { $id: 'cafe', stock: 10 };
const media = { $id: 'media', stock: 15 };

const combo = {
	$id: 'combo-1',
	tipo: 'combo',
	stock: 0,
	combo_items: JSON.stringify([
		{ product_id: 'cafe', cantidad: 1 },
		{ product_id: 'media', cantidad: 2 }
	])
};

const porId = new Map<string, any>([['cafe', cafe], ['media', media]]);

describe('integrantesDeCombo', () => {
	it('lee los integrantes de un combo', () => {
		expect(integrantesDeCombo(combo)).toEqual([
			{ product_id: 'cafe', cantidad: 1 },
			{ product_id: 'media', cantidad: 2 }
		]);
	});

	it('acepta el campo ya parseado, no sólo el string', () => {
		expect(integrantesDeCombo({ tipo: 'combo', combo_items: [{ product_id: 'x', cantidad: 3 }] }))
			.toEqual([{ product_id: 'x', cantidad: 3 }]);
	});

	it('un producto normal no tiene integrantes', () => {
		expect(integrantesDeCombo(cafe)).toEqual([]);
		expect(esCombo(cafe)).toBe(false);
		expect(esCombo(combo)).toBe(true);
	});

	it('con JSON roto se trata como producto simple, que es lo conservador', () => {
		expect(integrantesDeCombo({ tipo: 'combo', combo_items: '{no es json' })).toEqual([]);
		expect(integrantesDeCombo({ tipo: 'combo', combo_items: '"texto"' })).toEqual([]);
	});

	it('descarta entradas sin product_id y normaliza la cantidad', () => {
		const r = integrantesDeCombo({
			tipo: 'combo',
			combo_items: JSON.stringify([
				{ product_id: 'a' },
				{ cantidad: 5 },
				{ product_id: 'b', cantidad: 0 },
				{ product_id: 'c', cantidad: 2.7 }
			])
		});
		expect(r).toEqual([
			{ product_id: 'a', cantidad: 1 },
			{ product_id: 'b', cantidad: 1 },
			{ product_id: 'c', cantidad: 2 }
		]);
	});

	it('tipo combo sin integrantes cargados no es un combo todavía', () => {
		expect(esCombo({ tipo: 'combo', combo_items: '[]' })).toBe(false);
	});
});

describe('unidadesQueMueve', () => {
	it('un producto normal mueve su propio stock', () => {
		expect(unidadesQueMueve(cafe, 3)).toEqual([{ productId: 'cafe', cantidad: 3 }]);
	});

	it('un combo mueve el stock de sus integrantes, multiplicado', () => {
		expect(unidadesQueMueve(combo, 2)).toEqual([
			{ productId: 'cafe', cantidad: 2 },
			{ productId: 'media', cantidad: 4 }
		]);
	});

	it('vender un combo no toca el stock del combo mismo', () => {
		const ids = unidadesQueMueve(combo, 1).map((u) => u.productId);
		expect(ids).not.toContain('combo-1');
	});
});

describe('stockDisponible', () => {
	it('un producto normal informa su propio stock', () => {
		expect(stockDisponible(cafe, porId)).toBe(10);
	});

	it('un combo informa cuántas veces alcanza el integrante más escaso', () => {
		// 10 cafés alcanzan para 10; 15 medialunas de a 2 alcanzan para 7.
		expect(stockDisponible(combo, porId)).toBe(7);
	});

	it('con un integrante en cero, el combo queda agotado', () => {
		const sinCafe = new Map<string, any>([['cafe', { $id: 'cafe', stock: 0 }], ['media', media]]);
		expect(stockDisponible(combo, sinCafe)).toBe(0);
	});

	it('un integrante que no está en el catálogo cuenta como cero', () => {
		expect(stockDisponible(combo, new Map([['cafe', cafe]]))).toBe(0);
	});

	it('nunca devuelve negativos ni fracciones', () => {
		const raro = new Map<string, any>([
			['cafe', { $id: 'cafe', stock: -5 }],
			['media', { $id: 'media', stock: 3 }]
		]);
		expect(stockDisponible(combo, raro)).toBe(0);
		expect(Number.isInteger(stockDisponible(combo, porId))).toBe(true);
	});

	it('el stock propio del combo es irrelevante', () => {
		const conStockPropio = { ...combo, stock: 999 };
		expect(stockDisponible(conStockPropio, porId)).toBe(7);
	});
});
