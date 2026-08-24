import { describe, it, expect } from 'vitest';
import { 
	recalculateProductPrices, 
	resolveProductPriceForUser, 
	sanitizeProductForUser,
	calculateLevelPriceCentavos,
	applyRoundingCentavos,
	resolveLevelMarkupPercent
} from '../../src/lib/pricingEngine';

describe('Motor de Precios Multinivel (Multilevel Pricing Engine)', () => {
	const defaultSettings: any = {
		default_markup_distribuidor: 6.25,
		default_markup_canillita: 12.5,
		default_markup_publico: 25.0,
		round_to: 0,
		round_mode: 'nearest'
	};

	it('ejemplo del enunciado: costo 80 ARS (8000 centavos) → distribuidor +6.25% = 85, canillita +12.5% = 90, público +25% = 100', () => {
		const product = {
			costo: 8000
		};

		const result = recalculateProductPrices(product, null, defaultSettings);

		expect(result.price_distribuidor).toBe(8500); // 80 * 1.0625 = 85 ARS -> 8500 centavos
		expect(result.price_canillita).toBe(9000);    // 80 * 1.125 = 90 ARS -> 9000 centavos
		expect(result.price_publico).toBe(10000);     // 80 * 1.25 = 100 ARS -> 10000 centavos
	});

	it('jerarquía de resolución: Override Producto > Regla Categoría > Defaults Globales', () => {
		const product = {
			costo: 10000, // 100 ARS
			canillita_mode: 'percent',
			canillita_percent: 20.0 // Override producto solo en canillita
		};

		const category = {
			markup_distribuidor: 10.0, // Regla categoría distribuidor
			markup_canillita: 32.0,     // Debería ser ignorado por el override del producto
			markup_publico: 50.0        // Regla categoría público
		};

		const result = recalculateProductPrices(product, category, defaultSettings);

		expect(result.price_distribuidor).toBe(11000); // Hereda de categoría (10%): 100 * 1.10 = 110
		expect(result.price_canillita).toBe(12000);    // Usa override de producto (20%): 100 * 1.20 = 120 (en lugar de 32% cat)
		expect(result.price_publico).toBe(15000);     // Hereda de categoría (50%): 100 * 1.50 = 150
	});

	it('soporta precio fijo manual por producto', () => {
		const product = {
			costo: 10000,
			publico_mode: 'fixed',
			publico_fixed_price: 18000 // $180 ARS fijo
		};

		const result = recalculateProductPrices(product, null, defaultSettings);

		expect(result.price_publico).toBe(18000);
	});

	it('redondeo configurable (nearest, up, down)', () => {
		const settingsNearest: any = {
			...defaultSettings,
			round_to: 10, // Redondear a multiplos de $10 ARS (1000 centavos)
			round_mode: 'nearest'
		};

		const settingsUp: any = {
			...defaultSettings,
			round_to: 10,
			round_mode: 'up'
		};

		// Costo: $83.33 ARS (8333 centavos), markup publico 25% -> 83.33 * 1.25 = 104.1625 ARS (10416 centavos)
		const product = { costo: 8333 };

		const resNearest = recalculateProductPrices(product, null, settingsNearest);
		const resUp = recalculateProductPrices(product, null, settingsUp);

		expect(resNearest.price_publico).toBe(10000); // 10416 centavos se redondea a 10000 centavos ($100 ARS)
		expect(resUp.price_publico).toBe(11000);      // Ceil to step 1000 -> 11000 centavos ($110 ARS)
	});

	it('resolución de precio por rol de usuario (resolveProductPriceForUser)', () => {
		const product = {
			costo: 10000,
			precio_distribuidor: 11000,
			precio_canillita: 12000,
			precio: 15000,
			precio_publico: 15000
		};

		expect(resolveProductPriceForUser(product, 'distribuidor')).toEqual({ unitPriceCentavos: 11000, appliedLevel: 'distribuidor' });
		expect(resolveProductPriceForUser(product, 'canillita')).toEqual({ unitPriceCentavos: 12000, appliedLevel: 'canillita' });
		expect(resolveProductPriceForUser(product, 'publico')).toEqual({ unitPriceCentavos: 15000, appliedLevel: 'publico' });
		expect(resolveProductPriceForUser(product, undefined)).toEqual({ unitPriceCentavos: 15000, appliedLevel: 'publico' });
	});

	it('sanitización de datos por rol para evitar filtrado de costos a clientes públicos', () => {
		const fullProduct = {
			$id: 'prod-1',
			nombre: 'Diario Clarín',
			cost: 5000,
			costo: 5000,
			precio_distribuidor: 6000,
			precio_canillita: 7000,
			precio: 10000,
			precio_publico: 10000,
			canillita_percent: 40.0
		};

		const sanitizedPublic = sanitizeProductForUser(fullProduct, 'publico');
		expect(sanitizedPublic.cost).toBeUndefined();
		expect(sanitizedPublic.costo).toBeUndefined();
		expect(sanitizedPublic.precio_distribuidor).toBeUndefined();
		expect(sanitizedPublic.precio_canillita).toBeUndefined();
		expect(sanitizedPublic.canillita_percent).toBeUndefined();
		expect(sanitizedPublic.precio).toBe(10000);

		const sanitizedAdmin = sanitizeProductForUser(fullProduct, 'admin');
		expect(sanitizedAdmin.costo).toBe(5000);
		expect(sanitizedAdmin.precio_distribuidor).toBe(6000);
		expect(sanitizedAdmin.precio_canillita).toBe(7000);
	});

	it('cálculo del margen real sobre venta: ((precio - costo) / precio) * 100', () => {
		// Ejemplo 1: costo 80 ARS, precio público 100 ARS (+25% markup s/ costo) -> margen s/ venta = (100 - 80) / 100 = 20%
		const costo1 = 80;
		const precio1 = 100;
		const margenReal1 = ((precio1 - costo1) / precio1) * 100;
		expect(margenReal1).toBe(20);

		// Ejemplo 2: costo 80 ARS, precio canillita 90 ARS (+12.5% markup s/ costo) -> margen s/ venta = (90 - 80) / 90 = 11.111...%
		const costo2 = 80;
		const precio2 = 90;
		const margenReal2 = ((precio2 - costo2) / precio2) * 100;
		expect(parseFloat(margenReal2.toFixed(2))).toBe(11.11);
	});
});

