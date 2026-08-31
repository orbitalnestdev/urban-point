import { describe, it, expect } from 'vitest';
import { puedeImpersonar, NIVEL_ROL, ROLES_IMPERSONABLES } from '../../src/lib/server/auth';

/**
 * Regresión de la escalada de privilegios por impersonación.
 *
 * El endpoint aceptaba al rol `gestion` como impersonador y el middleware
 * adoptaba el perfil destino sin mirar su rol: con el $id de un administrador,
 * un `gestion` pasaba a tener rol admin y se salteaba el 403 que lo mantiene
 * fuera de /admin/configuracion y /admin/equipo.
 */
describe('puedeImpersonar', () => {
	it('un gestion no puede impersonar a un admin', () => {
		expect(puedeImpersonar('gestion', 'admin')).toBe(false);
	});

	it('un gestion no puede impersonar a nadie, ni por debajo suyo', () => {
		expect(puedeImpersonar('gestion', 'canillita')).toBe(false);
		expect(puedeImpersonar('gestion', 'cliente')).toBe(false);
		expect(puedeImpersonar('gestion', 'gestion')).toBe(false);
	});

	it('un admin impersona cualquier rol por debajo suyo', () => {
		expect(puedeImpersonar('admin', 'gestion')).toBe(true);
		expect(puedeImpersonar('admin', 'canillita')).toBe(true);
		expect(puedeImpersonar('admin', 'cliente')).toBe(true);
	});

	it('un admin no puede impersonar a otro admin', () => {
		expect(puedeImpersonar('admin', 'admin')).toBe(false);
	});

	it('canillita y cliente no impersonan nada', () => {
		for (const actor of ['canillita', 'cliente']) {
			for (const destino of ['admin', 'gestion', 'canillita', 'cliente']) {
				expect(puedeImpersonar(actor, destino)).toBe(false);
			}
		}
	});

	it('un rol desconocido o ausente nunca habilita la impersonación', () => {
		expect(puedeImpersonar('superadmin', 'cliente')).toBe(false);
		expect(puedeImpersonar('admin', 'superadmin')).toBe(false);
		expect(puedeImpersonar(undefined, 'cliente')).toBe(false);
		expect(puedeImpersonar('admin', null)).toBe(false);
		expect(puedeImpersonar('', '')).toBe(false);
	});

	it('admin es el nivel más alto de la jerarquía', () => {
		const otros = Object.entries(NIVEL_ROL).filter(([rol]) => rol !== 'admin');
		for (const [, nivel] of otros) {
			expect(nivel).toBeLessThan(NIVEL_ROL.admin);
		}
	});

	it('ningún rol sintético impersonable alcanza el nivel de admin', () => {
		for (const rol of ROLES_IMPERSONABLES) {
			expect(puedeImpersonar('admin', rol)).toBe(true);
			expect(NIVEL_ROL[rol]).toBeLessThan(NIVEL_ROL.admin);
		}
		expect(ROLES_IMPERSONABLES).not.toContain('admin');
	});
});
