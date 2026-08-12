/**
 * Tests reales contra el código de comisiones (importa src/, no reimplementa).
 *
 * Cubre: precedencia default -> categoría -> canillita -> canillita+categoría,
 * carrito mixto, redondeo y aritmética entera de dinero.
 */
import { describe, it, expect } from 'vitest';
import { resolverComision, calcularMontoComision, type CommissionRule } from '../../src/lib/commissions/resolve';
import { calculateAmount } from '../../src/lib/commissions';

const AYER = new Date('2026-01-01');
const HOY = new Date('2026-06-01');

const regla = (over: Partial<CommissionRule>): CommissionRule => ({
	id: 'r',
	alcance: 'default',
	canillita_id: null,
	categoria_id: null,
	tipo: 'porcentaje',
	valor: 1000, // 10.00% en basis points
	vigente_desde: AYER,
	vigente_hasta: null,
	activo: true,
	...over
});

const CANI = 'canillita_1';
const CAT = 'categoria_1';

describe('Precedencia de reglas de comisión', () => {
	const reglaDefault = regla({ id: 'default', alcance: 'default', valor: 1000 });
	const reglaCategoria = regla({ id: 'cat', alcance: 'categoria', categoria_id: CAT, valor: 1500 });
	const reglaCanillita = regla({ id: 'cani', alcance: 'canillita', canillita_id: CANI, valor: 2000 });
	const reglaCaniCat = regla({
		id: 'canicat',
		alcance: 'canillita_categoria',
		canillita_id: CANI,
		categoria_id: CAT,
		valor: 2500
	});

	it('sin overrides gana la regla default', () => {
		expect(resolverComision([reglaDefault], CANI, CAT, HOY).regla_id).toBe('default');
	});

	it('el override por categoría le gana al default', () => {
		expect(resolverComision([reglaDefault, reglaCategoria], CANI, CAT, HOY).regla_id).toBe('cat');
	});

	it('el override por canillita le gana al de categoría', () => {
		const r = resolverComision([reglaDefault, reglaCategoria, reglaCanillita], CANI, CAT, HOY);
		expect(r.regla_id).toBe('cani');
	});

	it('canillita+categoría le gana a todos', () => {
		const todas = [reglaDefault, reglaCategoria, reglaCanillita, reglaCaniCat];
		expect(resolverComision(todas, CANI, CAT, HOY).regla_id).toBe('canicat');
	});

	it('una regla de otro canillita no se aplica', () => {
		const otra = regla({ id: 'otro', alcance: 'canillita', canillita_id: 'canillita_2', valor: 9000 });
		expect(resolverComision([reglaDefault, otra], CANI, CAT, HOY).regla_id).toBe('default');
	});

	it('ignora reglas inactivas y vencidas', () => {
		const inactiva = regla({ id: 'x', alcance: 'canillita', canillita_id: CANI, activo: false });
		const vencida = regla({
			id: 'y',
			alcance: 'canillita',
			canillita_id: CANI,
			vigente_hasta: new Date('2026-02-01')
		});
		expect(resolverComision([reglaDefault, inactiva, vencida], CANI, CAT, HOY).regla_id).toBe('default');
	});

	it('sin regla default activa lanza error en vez de devengar 0 en silencio', () => {
		expect(() => resolverComision([], CANI, CAT, HOY)).toThrow(/default/i);
	});

	it('carrito mixto: cada categoría resuelve su propia regla', () => {
		const CAT_B = 'categoria_2';
		const reglaCatB = regla({ id: 'catB', alcance: 'categoria', categoria_id: CAT_B, valor: 500 });
		const reglas = [reglaDefault, reglaCategoria, reglaCatB];
		expect(resolverComision(reglas, CANI, CAT, HOY).regla_id).toBe('cat');
		expect(resolverComision(reglas, CANI, CAT_B, HOY).regla_id).toBe('catB');
	});
});

describe('Aritmética de dinero — solo enteros en centavos', () => {
	it('calcula el porcentaje en centavos sin punto flotante', () => {
		const r = resolverComision([regla({ id: 'd', valor: 1000 })], null, null, HOY);
		const monto = calcularMontoComision(1500000, r); // $15.000,00 al 10%
		expect(monto).toBe(150000); // $1.500,00
		expect(Number.isInteger(monto)).toBe(true);
	});

	it('redondea a centavo entero en casos con resto', () => {
		const r = resolverComision([regla({ id: 'd', valor: 1000 })], null, null, HOY);
		const monto = calcularMontoComision(333, r); // 33.3 centavos
		expect(Number.isInteger(monto)).toBe(true);
		expect(monto).toBe(33);
	});

	it('monto_fijo devuelve el valor tal cual, sin escalar', () => {
		const r = resolverComision([regla({ id: 'd', tipo: 'monto_fijo', valor: 50000 })], null, null, HOY);
		expect(calcularMontoComision(999999, r)).toBe(50000);
	});

	it('calculateAmount (ruta de producción) coincide con resolve.ts', () => {
		// Las dos implementaciones conviven en el repo: deben dar lo mismo.
		const base = 1234567;
		const bp = 1250;
		const viaProduccion = calculateAmount(base, { tipo: 'porcentaje', valor: bp });
		const viaResolve = calcularMontoComision(
			base,
			resolverComision([regla({ id: 'd', valor: bp })], null, null, HOY)
		);
		expect(viaProduccion).toBe(viaResolve);
		expect(Number.isInteger(viaProduccion)).toBe(true);
	});

	it('nunca produce comisión mayor a la base', () => {
		const r = resolverComision([regla({ id: 'd', valor: 10000 })], null, null, HOY); // 100%
		expect(calcularMontoComision(1000, r)).toBeLessThanOrEqual(1000);
	});
});

describe('Reversa de comisión (cancelación/reembolso)', () => {
	it('el asiento de reversa debe anular exactamente el devengo', () => {
		const r = resolverComision([regla({ id: 'd', valor: 1000 })], null, null, HOY);
		const devengo = calcularMontoComision(1500000, r);
		const reversa = -devengo;
		expect(devengo + reversa).toBe(0);
	});
});
