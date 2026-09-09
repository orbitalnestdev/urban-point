import { describe, it, expect } from 'vitest';
import { idDeGrupo, GRUPOS } from '../../src/lib/categoryGroups';

describe('idDeGrupo', () => {
	it('resuelve categorías conocidas a su grupo temático', () => {
		expect(idDeGrupo('Autos Alemanes')).toBe('infantil');
		expect(idDeGrupo('Rock de Acá')).toBe('musica');
		expect(idDeGrupo('Hogar')).toBe('hogar');
	});

	it('manda a "otras" lo que no está mapeado, en vez de fallar', () => {
		expect(idDeGrupo('Una categoría nueva que nadie mapeó todavía')).toBe('otras');
	});

	it('tolera espacios extra en el nombre', () => {
		expect(idDeGrupo('  Hogar  ')).toBe('hogar');
	});

	it('cada grupo declarado tiene id, nombre e ícono', () => {
		for (const g of GRUPOS) {
			expect(g.id).toBeTruthy();
			expect(g.nombre).toBeTruthy();
			expect(g.icono).toBeTruthy();
		}
	});

	it('no hay ids de grupo repetidos', () => {
		const ids = GRUPOS.map((g) => g.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
