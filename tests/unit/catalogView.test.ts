import { describe, it, expect } from 'vitest';
import { contarProductosPorCategoria } from '../../src/lib/server/catalogView';
import { agruparVariantes, claveDeGrupo, grupoDeProducto } from '../../src/lib/variantes';

/**
 * La vitrina contaba productos por categoría con un producto cartesiano: por
 * cada categoría recorría el catálogo entero, y para las padre lo recorría de
 * nuevo con un includes() adentro del filtro. Con 199 categorías y 6.185
 * productos eran ~1,2 M de comparaciones (29 ms) por request.
 */
describe('contarProductosPorCategoria', () => {
	const categorias = [
		{ $id: 'p1', parent_id: null },
		{ $id: 'p2', parent_id: null },
		{ $id: 'h1', parent_id: 'p1' },
		{ $id: 'h2', parent_id: 'p1' },
		{ $id: 'h3', parent_id: 'p2' }
	];

	const cuenta = (res: any[], id: string) => res.find((c) => c.$id === id).productCount;

	it('cuenta los productos asignados directamente a cada categoría', () => {
		const res = contarProductosPorCategoria(
			[{ categoria_id: 'h1' }, { categoria_id: 'h1' }, { categoria_id: 'h3' }],
			categorias
		);
		expect(cuenta(res, 'h1')).toBe(2);
		expect(cuenta(res, 'h3')).toBe(1);
		expect(cuenta(res, 'h2')).toBe(0);
	});

	it('suma en el padre lo de todas sus hijas', () => {
		const res = contarProductosPorCategoria(
			[{ categoria_id: 'h1' }, { categoria_id: 'h2' }, { categoria_id: 'h2' }, { categoria_id: 'h3' }],
			categorias
		);
		expect(cuenta(res, 'p1')).toBe(3); // h1 + h2
		expect(cuenta(res, 'p2')).toBe(1); // h3
	});

	it('el padre suma lo propio más lo de sus hijas', () => {
		const res = contarProductosPorCategoria(
			[{ categoria_id: 'p1' }, { categoria_id: 'h1' }, { categoria_id: 'h2' }],
			categorias
		);
		expect(cuenta(res, 'p1')).toBe(3);
	});

	it('acepta categoria_id como documento expandido', () => {
		const res = contarProductosPorCategoria(
			[{ categoria_id: { $id: 'h1' } }, { categoria_id: 'h1' }],
			categorias
		);
		expect(cuenta(res, 'h1')).toBe(2);
		expect(cuenta(res, 'p1')).toBe(2);
	});

	it('acepta parent_id como documento expandido', () => {
		const res = contarProductosPorCategoria(
			[{ categoria_id: 'hx' }],
			[{ $id: 'px', parent_id: null }, { $id: 'hx', parent_id: { $id: 'px' } }]
		);
		expect(cuenta(res, 'px')).toBe(1);
	});

	it('ignora productos sin categoría y no rompe con listas vacías', () => {
		const res = contarProductosPorCategoria([{ categoria_id: null }, {}], categorias);
		expect(res.every((c) => c.productCount === 0)).toBe(true);
		expect(contarProductosPorCategoria([], [])).toEqual([]);
	});

	it('no cuenta productos de una categoría que no existe', () => {
		const res = contarProductosPorCategoria([{ categoria_id: 'fantasma' }], categorias);
		expect(res.every((c) => c.productCount === 0)).toBe(true);
	});

	it('coincide con el conteo cartesiano que reemplaza', () => {
		const cats: any[] = [];
		for (let i = 0; i < 12; i++) cats.push({ $id: 'p' + i, parent_id: null });
		for (let i = 0; i < 20; i++) cats.push({ $id: 'h' + i, parent_id: 'p' + (i % 12) });

		const prods: any[] = [];
		for (let i = 0; i < 300; i++) {
			prods.push({ categoria_id: i % 3 === 0 ? 'p' + (i % 12) : 'h' + (i % 20) });
		}

		// Implementación anterior, tal cual estaba en productos/index.astro.
		const anterior = cats.map((cat: any) => {
			const isParent = !cat.parent_id;
			const exact = prods.filter((p: any) => (p.categoria_id?.$id || p.categoria_id) === cat.$id).length;
			let total = exact;
			if (isParent) {
				const hijas = cats
					.filter((c: any) => (typeof c.parent_id === 'string' ? c.parent_id : c.parent_id?.$id) === cat.$id)
					.map((c: any) => c.$id);
				total += prods.filter((p: any) => hijas.includes(p.categoria_id?.$id || p.categoria_id)).length;
			}
			return { $id: cat.$id, productCount: total };
		});

		const nuevo = contarProductosPorCategoria(prods, cats);
		for (const esperado of anterior) {
			expect(cuenta(nuevo, esperado.$id)).toBe(esperado.productCount);
		}
	});
});

/**
 * La vitrina agrupaba con normalizar() —minúsculas, sin tildes, espacios
 * colapsados— y la ficha comparaba con grupoDeProducto(p).toLowerCase(). Con un
 * nombre acentuado de forma inconsistente la tarjeta anunciaba tres variantes y
 * la ficha mostraba dos, dejando la tercera inalcanzable.
 */
describe('claveDeGrupo: un solo criterio para vitrina y ficha', () => {
	const titanic = [
		{ $id: '1', nombre: 'Construcción del Titanic - Fasciculo N.01' },
		{ $id: '2', nombre: 'Construccion del Titanic - Fasciculo N.02' },
		{ $id: '3', nombre: 'Construcción del Titanic - Fasciculo N.03' }
	];

	it('agrupa nombres que difieren sólo en las tildes', () => {
		const grupos = agruparVariantes(titanic);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].variantes).toHaveLength(3);
	});

	it('la clave del grupo es la misma para todas las variantes', () => {
		const claves = new Set(titanic.map(claveDeGrupo));
		expect(claves.size).toBe(1);
	});

	it('la clave coincide con la que usa agruparVariantes', () => {
		const grupos = agruparVariantes(titanic);
		for (const p of titanic) {
			expect(claveDeGrupo(p)).toBe(grupos[0].clave);
		}
	});

	it('el criterio viejo separaba lo que la vitrina unía', () => {
		// Deja constancia del bug: con toLowerCase() eran dos grupos distintos.
		const viejo = new Set(titanic.map((p) => grupoDeProducto(p).toLowerCase()));
		expect(viejo.size).toBe(2);
		expect(new Set(titanic.map(claveDeGrupo)).size).toBe(1);
	});

	it('colapsa espacios repetidos y respeta el override de grupo', () => {
		expect(claveDeGrupo({ nombre: 'Minerales  del   Mundo - N 5' }))
			.toBe(claveDeGrupo({ nombre: 'Minerales del Mundo - N 6' }));
		expect(claveDeGrupo({ nombre: 'Otra cosa', grupo: 'Minerales del Mundo' }))
			.toBe(claveDeGrupo({ nombre: 'Minerales del Mundo - N 7' }));
	});

	it('no junta productos que sí son distintos', () => {
		expect(claveDeGrupo({ nombre: 'Titanic - N.01' }))
			.not.toBe(claveDeGrupo({ nombre: 'Bismarck - N.01' }));
	});
});
