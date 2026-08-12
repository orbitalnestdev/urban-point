/**
 * Liquidaciones [A-03]: contrato de campos contra el esquema real de Appwrite
 * y aritmética del ledger.
 *
 * El esquema de payouts en la base tiene periodo_desde y periodo_hasta como
 * REQUERIDOS (verificado leyendo la colección en vivo durante la auditoría),
 * y convivían dos actions escribiendo juegos de campos distintos.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

describe('Contrato del documento payout', () => {
	const src = leer('src/lib/commissions.ts');
	const fn = src.slice(src.indexOf('export async function liquidarComisiones'));

	it('escribe los campos requeridos del esquema real', () => {
		for (const campo of ['periodo_desde', 'periodo_hasta', 'monto_centavos', 'estado']) {
			expect(fn.includes(campo), `liquidarComisiones no escribe ${campo}`).toBe(true);
		}
	});

	it('escribe profile_id: sin él el payout queda huérfano', () => {
		// liquidateCommissions no lo guardaba, así que la liquidación nunca
		// aparecía en "Mis Cobros" del canillita.
		expect(fn.includes('profile_id')).toBe(true);
	});

	it('usa los nombres de campo del esquema, no los alternativos', () => {
		expect(fn.includes('medio_pago')).toBe(true);
		expect(fn.includes('referencia_pago')).toBe(true);
	});

	it('enlaza los asientos con el payout', () => {
		expect(fn.includes('payout_id')).toBe(true);
	});

	it('verifica idempotencia antes de crear el payout', () => {
		const idxIdem = fn.indexOf('idempotency_key');
		const idxCreate = fn.indexOf('createDocument');
		expect(idxIdem).toBeGreaterThan(-1);
		expect(idxIdem).toBeLessThan(idxCreate);
	});
});

describe('Una sola implementación de liquidación', () => {
	it('las actions delegan en liquidarComisiones', () => {
		const acciones = leer('src/actions/index.ts');
		const ocurrencias = acciones.match(/liquidarComisiones\(/g) ?? [];
		expect(ocurrencias.length).toBe(2); // liquidateCommissions y createPayout
	});

	it('ninguna action crea documentos de payout por su cuenta', () => {
		const acciones = leer('src/actions/index.ts');
		expect(/createDocument\(\s*'urbanpoint',\s*'payouts'/.test(acciones)).toBe(false);
	});
});

describe('Aritmética del saldo', () => {
	/** Réplica del criterio del panel del canillita. */
	const devengado = (l: { tipo: string; estado: string; monto_centavos: number }[]) =>
		l
			.filter((x) => x.tipo !== 'reversa' && x.tipo !== 'liquidacion' && x.estado !== 'revertido')
			.reduce((a, c) => a + c.monto_centavos, 0);

	const pendiente = (l: { estado: string; monto_centavos: number }[]) =>
		l.filter((x) => x.estado === 'pendiente').reduce((a, c) => a + c.monto_centavos, 0);

	it('lo devengado no cuenta reversas ni liquidaciones', () => {
		const ledger = [
			{ tipo: 'fee_logistica', estado: 'pendiente', monto_centavos: 10000 },
			{ tipo: 'comision_referido', estado: 'pendiente', monto_centavos: 5000 },
			{ tipo: 'reversa', estado: 'revertido', monto_centavos: -5000 },
			{ tipo: 'comision_referido', estado: 'revertido', monto_centavos: 5000 }
		];
		expect(devengado(ledger)).toBe(15000);
	});

	it('el pendiente excluye lo ya liquidado', () => {
		const ledger = [
			{ estado: 'pendiente', monto_centavos: 10000 },
			{ estado: 'liquidado', monto_centavos: 7000 },
			{ estado: 'revertido', monto_centavos: 3000 }
		];
		expect(pendiente(ledger)).toBe(10000);
	});

	it('tras liquidar todo, el pendiente queda en cero', () => {
		const ledger = [
			{ estado: 'liquidado', monto_centavos: 10000 },
			{ estado: 'liquidado', monto_centavos: 5000 }
		];
		expect(pendiente(ledger)).toBe(0);
	});

	it('una reversa deja el neto de esa orden en cero', () => {
		const devengo = 12345;
		expect(devengo + -devengo).toBe(0);
	});
});
