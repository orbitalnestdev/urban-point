import { describe, it, expect } from 'vitest';
import { agruparCategorias, GRUPOS } from '../../src/lib/categoryGroups';

describe('agruparCategorias', () => {
	it('agrupa categorías conocidas en su grupo temático', () => {
		const categorias = [
			{ nombre: 'Autos Alemanes' },
			{ nombre: 'Rock de Acá' },
			{ nombre: 'Hogar' }
		];
		const grupos = agruparCategorias(categorias);
		const porNombreDeGrupo = new Map(grupos.map((g) => [g.grupo.id, g.categorias.map((c) => c.nombre)]));

		expect(porNombreDeGrupo.get('vehiculos')).toEqual(['Autos Alemanes']);
		expect(porNombreDeGrupo.get('musica')).toEqual(['Rock de Acá']);
		expect(porNombreDeGrupo.get('hogar')).toEqual(['Hogar']);
	});

	it('manda a "Otras categorías" lo que no está mapeado, sin perderlo', () => {
		const grupos = agruparCategorias([{ nombre: 'Una categoría nueva que nadie mapeó todavía' }]);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].grupo.id).toBe('otras');
		expect(grupos[0].categorias).toHaveLength(1);
	});

	it('no incluye grupos vacíos en el resultado', () => {
		const grupos = agruparCategorias([{ nombre: 'Hogar' }]);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].grupo.id).toBe('hogar');
	});

	it('mantiene el orden de entrada dentro de cada grupo', () => {
		const grupos = agruparCategorias([
			{ nombre: 'Rolling Stone' },
			{ nombre: 'Madonna' },
			{ nombre: 'Blue Note' }
		]);
		expect(grupos[0].categorias.map((c) => c.nombre)).toEqual(['Rolling Stone', 'Madonna', 'Blue Note']);
	});

	it('devuelve un array vacío si no hay categorías', () => {
		expect(agruparCategorias([])).toEqual([]);
	});

	it('cada grupo declarado tiene id, nombre e ícono', () => {
		for (const g of GRUPOS) {
			expect(g.id).toBeTruthy();
			expect(g.nombre).toBeTruthy();
			expect(g.icono).toBeTruthy();
		}
	});
});
