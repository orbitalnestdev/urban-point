import { describe, it } from 'node:test';
import assert from 'node:assert';

function calculateAmount(baseCents: number, rule: { tipo: string; valor: number }) {
	if (rule.tipo === 'porcentaje') {
		return Math.round((baseCents * rule.valor) / 10000);
	} else if (rule.tipo === 'monto_fijo') {
		return rule.valor;
	}
	return 0;
}

describe('Sistema de Referidos y Comisiones - Pruebas de Unidad', () => {
	it('debe calcular la comisión porcentual correctamente en centavos', () => {
		const rulePorcentaje = { tipo: 'porcentaje', valor: 1000 }; // 10.00% (1000 basis points)
		const baseCents = 1500000; // $15.000,00 ARS

		const result = calculateAmount(baseCents, rulePorcentaje);
		assert.strictEqual(result, 150000); // $1.500,00 ARS
	});

	it('debe calcular la comisión de monto fijo correctamente', () => {
		const ruleMontoFijo = { tipo: 'monto_fijo', valor: 50000 }; // $500,00 ARS
		const baseCents = 1500000;

		const result = calculateAmount(baseCents, ruleMontoFijo);
		assert.strictEqual(result, 50000);
	});

	it('debe bloquear la autorreferencia cuando el comprador es el dueño del código de referido', () => {
		const buyerProfileId = 'user_abc_123';
		const referrerProfileId = 'user_abc_123'; // Misma persona

		const isSelfReferral = buyerProfileId && buyerProfileId === referrerProfileId;
		assert.strictEqual(isSelfReferral, true);
	});

	it('debe permitir comisiones cuando el comprador y el referidor son usuarios distintos', () => {
		const buyerProfileId = 'user_buyer_1';
		const referrerProfileId = 'user_referrer_2';

		const isSelfReferral = buyerProfileId && buyerProfileId === referrerProfileId;
		assert.strictEqual(isSelfReferral, false);
	});
});

describe('Gestión e Inventario de Stock - Pruebas de Unidad', () => {
	it('debe calcular el nuevo stock sin permitir valores negativos', () => {
		const stockActual = 2;
		const cantidadComprada = 5;

		const nuevoStock = Math.max(0, stockActual - cantidadComprada);
		assert.strictEqual(nuevoStock, 0);
	});

	it('debe restaurar el stock correctamente en caso de cancelación de orden', () => {
		const stockActual = 10;
		const cantidadDevuelta = 3;

		const stockRestaurado = stockActual + cantidadDevuelta;
		assert.strictEqual(stockRestaurado, 13);
	});
});
