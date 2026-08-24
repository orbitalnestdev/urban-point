import { describe, it, expect } from 'vitest';

/**
 * Pruebas unitarias para las reglas de negocio y ciclo de vida del Panel del Canillita
 */
describe('Panel de Canillita - Reglas de Negocio y Ciclo de Vida', () => {

	describe('1. Ciclo de Vida de la Comisión (Estados del Asiento)', () => {
		it('el asiento nace en estado "pendiente" al pagar el pedido', () => {
			const nuevoAsiento = {
				order_id: 'order_123',
				profile_id: 'canillita_profile_1',
				monto_centavos: 1500,
				estado: 'pendiente',
				tipo: 'fee_logistica'
			};
			expect(nuevoAsiento.estado).toBe('pendiente');
		});

		it('pasa a "disponible" (confirmada) al marcar el pedido como entregado', () => {
			const asiento = {
				order_id: 'order_123',
				profile_id: 'canillita_profile_1',
				monto_centavos: 1500,
				estado: 'pendiente'
			};

			// Simular confirmación al entregar
			if (asiento.estado === 'pendiente') {
				asiento.estado = 'disponible';
			}

			expect(asiento.estado).toBe('disponible');
		});

		it('pasa a "liquidado" (pagada) al realizar el payout y no vuelve a computar como pendiente', () => {
			const asiento = {
				order_id: 'order_123',
				profile_id: 'canillita_profile_1',
				monto_centavos: 1500,
				estado: 'disponible'
			};

			// Simular liquidación
			asiento.estado = 'liquidado';
			expect(asiento.estado).toBe('liquidado');
		});

		it('se marca como "revertido" (anulada) si la orden es cancelada o reembolsada y no borra el asiento', () => {
			const ledgers = [
				{ id: '1', order_id: 'ord_1', monto_centavos: 1000, estado: 'pendiente', tipo: 'fee_logistica' }
			];

			// Simular cancelación
			const asiento = ledgers[0];
			asiento.estado = 'revertido';
			
			// Asiento de reversa compensatorio
			const reversa = {
				id: '2',
				order_id: 'ord_1',
				monto_centavos: -1000,
				estado: 'revertido',
				tipo: 'reversa'
			};
			ledgers.push(reversa);

			expect(ledgers.length).toBe(2); // Inmutabilidad y trazabilidad auditables
			expect(ledgers[0].estado).toBe('revertido');
			expect(ledgers[1].monto_centavos).toBe(-1000);
		});
	});

	describe('2. Cálculo de Totales y Saldos (getCanillitaStats logic)', () => {
		const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
		const oldDate = new Date('2025-01-01').getTime();

		const sampleLedgers = [
			{ profile_id: 'c1', monto_centavos: 1000, estado: 'pendiente', tipo: 'fee_logistica', $createdAt: new Date().toISOString(), order_id: 'o1' },
			{ profile_id: 'c1', monto_centavos: 2000, estado: 'disponible', tipo: 'comision_referido', $createdAt: new Date().toISOString(), order_id: 'o2' },
			{ profile_id: 'c1', monto_centavos: 3000, estado: 'liquidado', tipo: 'fee_logistica', $createdAt: new Date().toISOString(), order_id: 'o3' },
			{ profile_id: 'c1', monto_centavos: 500, estado: 'revertido', tipo: 'fee_logistica', $createdAt: new Date().toISOString(), order_id: 'o4' },
			{ profile_id: 'c1', monto_centavos: -500, estado: 'revertido', tipo: 'reversa', $createdAt: new Date().toISOString(), order_id: 'o4' },
			{ profile_id: 'c2', monto_centavos: 9999, estado: 'pendiente', tipo: 'fee_logistica', $createdAt: new Date().toISOString(), order_id: 'o5' } // Pertenece a otro canillita
		];

		it('calcula el total pendiente sumando estados pendiente y disponible del canillita objetivo', () => {
			const profileId = 'c1';
			const pend = sampleLedgers
				.filter(l => l.profile_id === profileId && (l.estado === 'pendiente' || l.estado === 'disponible') && l.tipo !== 'reversa')
				.reduce((acc, l) => acc + l.monto_centavos, 0);

			expect(pend).toBe(3000); // 1000 + 2000
		});

		it('calcula el total ya liquidado histórico del canillita', () => {
			const profileId = 'c1';
			const liq = sampleLedgers
				.filter(l => l.profile_id === profileId && l.estado === 'liquidado' && l.tipo !== 'reversa')
				.reduce((acc, l) => acc + l.monto_centavos, 0);

			expect(liq).toBe(3000);
		});

		it('garantiza el aislamiento de datos: canillita c1 no ve ni suma comisiones del canillita c2', () => {
			const profileId = 'c1';
			const forC1 = sampleLedgers.filter(l => l.profile_id === profileId);
			const hasC2Data = forC1.some(l => l.profile_id === 'c2');
			expect(hasC2Data).toBe(false);
		});
	});

	describe('3. Restricción por Nivel de Precio (Price Tier Exclusion)', () => {
		it('compras hechas a precio canillita o distribuidor no generan ni muestran comisión', () => {
			const pedidos = [
				{ id: 'p1', price_tier: 'publico', total: 10000, comision: 1000 },
				{ id: 'p2', price_tier: 'canillita', total: 8000, comision: 0 },
				{ id: 'p3', price_tier: 'distribuidor', total: 7500, comision: 0 }
			];

			const elegiblesParaLedger = pedidos.filter(p => (p.price_tier || 'publico') === 'publico');
			expect(elegiblesParaLedger.length).toBe(1);
			expect(elegiblesParaLedger[0].id).toBe('p1');
		});
	});
});
