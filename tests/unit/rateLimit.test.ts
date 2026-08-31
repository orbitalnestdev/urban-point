import { describe, it, expect } from 'vitest';
import { crearLimitador } from '../../src/lib/server/rateLimit';

/**
 * El alta pública de canillitas deduplicaba sólo por email exacto: variando el
 * email se creaban documentos con DNI y CBU sin tope y salía un mail a los
 * administradores por cada intento.
 */
describe('crearLimitador', () => {
	it('permite hasta el máximo y rechaza el siguiente', () => {
		const lim = crearLimitador(3, 60_000);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.permitir('ip-1', 1)).toBe(true);
		expect(lim.permitir('ip-1', 2)).toBe(true);
		expect(lim.permitir('ip-1', 3)).toBe(false);
	});

	it('cuenta cada clave por separado', () => {
		const lim = crearLimitador(1, 60_000);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.permitir('ip-1', 0)).toBe(false);
		expect(lim.permitir('ip-2', 0)).toBe(true);
	});

	it('vuelve a permitir cuando la ventana pasó', () => {
		const lim = crearLimitador(2, 1000);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.permitir('ip-1', 500)).toBe(true);
		expect(lim.permitir('ip-1', 900)).toBe(false);
		// A los 1001 ms el intento del instante 0 ya salió de la ventana.
		expect(lim.permitir('ip-1', 1001)).toBe(true);
	});

	it('es deslizante, no por bloques fijos', () => {
		const lim = crearLimitador(1, 1000);
		expect(lim.permitir('ip-1', 900)).toBe(true);
		// Un esquema por bloques dejaría pasar este; el deslizante no.
		expect(lim.permitir('ip-1', 1100)).toBe(false);
		expect(lim.permitir('ip-1', 1901)).toBe(true);
	});

	it('un intento rechazado no consume cupo de la ventana siguiente', () => {
		const lim = crearLimitador(1, 1000);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.permitir('ip-1', 100)).toBe(false);
		expect(lim.permitir('ip-1', 200)).toBe(false);
		expect(lim.permitir('ip-1', 1001)).toBe(true);
	});

	it('restantes informa el cupo sin consumirlo', () => {
		const lim = crearLimitador(2, 1000);
		expect(lim.restantes('ip-1', 0)).toBe(2);
		lim.permitir('ip-1', 0);
		expect(lim.restantes('ip-1', 0)).toBe(1);
		expect(lim.restantes('ip-1', 0)).toBe(1);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.restantes('ip-1', 0)).toBe(0);
	});

	it('reiniciar limpia el historial de una clave', () => {
		const lim = crearLimitador(1, 60_000);
		expect(lim.permitir('ip-1', 0)).toBe(true);
		expect(lim.permitir('ip-1', 0)).toBe(false);
		lim.reiniciar('ip-1');
		expect(lim.permitir('ip-1', 0)).toBe(true);
	});

	it('no crece sin límite ante muchas claves distintas', () => {
		const lim = crearLimitador(1, 60_000, 10);
		for (let i = 0; i < 500; i++) {
			expect(lim.permitir(`ip-${i}`, 0)).toBe(true);
		}
		// La clave más vieja fue descartada, así que vuelve a tener cupo.
		expect(lim.permitir('ip-0', 0)).toBe(true);
		// La más reciente sigue registrada.
		expect(lim.permitir('ip-499', 0)).toBe(false);
	});
});
