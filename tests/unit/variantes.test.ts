import { describe, it, expect } from 'vitest';
import {
	grupoDeProducto,
	etiquetaDeVariante,
	agruparVariantes,
	claveDeGrupo,
	compararPorPrioridad
} from '../../src/lib/variantes';

describe('grupoDeProducto', () => {
	it('corta el último tramo después del guion', () => {
		expect(grupoDeProducto({ nombre: 'Construye el Titanic - Fasciculo N.01 + piezas' }))
			.toBe('Construye el Titanic');
	});

	it('corta sólo el último tramo, no el primero', () => {
		expect(grupoDeProducto({ nombre: 'Objetos de Coleccion - Vehiculos - Autos' }))
			.toBe('Objetos de Coleccion - Vehiculos');
	});

	it('un producto sin guion es su propio grupo', () => {
		expect(grupoDeProducto({ nombre: 'Café' })).toBe('Café');
	});

	it('el campo grupo le gana al nombre: el CSV manda', () => {
		expect(grupoDeProducto({ nombre: 'Alfajor de maizena - X6', grupo: 'Alfajores Clásicos' }))
			.toBe('Alfajores Clásicos');
	});

	it('un grupo en blanco no cuenta como override', () => {
		expect(grupoDeProducto({ nombre: 'Metal Planet - #01 AC/DC', grupo: '   ' }))
			.toBe('Metal Planet');
	});

	it('no confunde un guion sin espacios con un separador', () => {
		expect(grupoDeProducto({ nombre: 'Anteojos LVL837-Magneticas' }))
			.toBe('Anteojos LVL837-Magneticas');
	});
});

describe('etiquetaDeVariante', () => {
	it('devuelve el tramo que distingue a la variante', () => {
		expect(etiquetaDeVariante({ nombre: 'Metal Planet - #01 AC/DC' })).toBe('#01 AC/DC');
	});

	it('con grupo explícito, saca el prefijo del nombre', () => {
		expect(etiquetaDeVariante({ nombre: 'Metal Planet - #02 METALLICA', grupo: 'Metal Planet' }))
			.toBe('#02 METALLICA');
	});

	it('ignora acentos y mayúsculas al sacar el prefijo', () => {
		expect(etiquetaDeVariante({ nombre: 'Café Premium - Tostado', grupo: 'cafe premium' }))
			.toBe('Tostado');
	});

	it('si el grupo no es prefijo del nombre, devuelve el nombre entero', () => {
		expect(etiquetaDeVariante({ nombre: 'Alfajor de maizena', grupo: 'Promos de Invierno' }))
			.toBe('Alfajor de maizena');
	});

	it('un producto sin variantes se etiqueta con su propio nombre', () => {
		expect(etiquetaDeVariante({ nombre: 'Café' })).toBe('Café');
	});
});

describe('agruparVariantes', () => {
	const productos = [
		{ $id: '1', nombre: 'Construye el Titanic - Fasciculo N.01' },
		{ $id: '2', nombre: 'Café' },
		{ $id: '3', nombre: 'Construye el Titanic - Fasciculo N.02' },
		{ $id: '4', nombre: 'Construye el Titanic - Fasciculo N.03' }
	];

	it('junta las variantes en un solo grupo', () => {
		const grupos = agruparVariantes(productos);
		expect(grupos).toHaveLength(2);
		expect(grupos[0].base).toBe('Construye el Titanic');
		expect(grupos[0].variantes).toHaveLength(3);
	});

	it('respeta el orden de entrada: el primero manda como principal', () => {
		const grupos = agruparVariantes(productos);
		expect(grupos[0].principal.$id).toBe('1');
		expect(grupos[1].principal.$id).toBe('2');
	});

	it('un producto suelto queda como grupo de uno', () => {
		const grupos = agruparVariantes(productos);
		const cafe = grupos.find(g => g.base === 'Café');
		expect(cafe?.variantes).toHaveLength(1);
	});

	/**
	 * El guion separa la variante en las colecciones por fascículo, pero en el
	 * resto del catálogo es puntuación del nombre. Recortarlo igual dejaba 136
	 * de 1.081 productos (13%) con la tarjeta mutilada —"Aire Acondicionado
	 * Portatil Vitta Home" por "... - 5000w Frio/calor Blanco"— y, como el
	 * buscador de la vitrina indexa sobre este campo, 129 no aparecían al
	 * buscar palabras de su propio nombre.
	 */
	describe('grupo de una sola variante: la tarjeta muestra el nombre completo', () => {
		it('no recorta cuando el guion no separa una variante', () => {
			const grupos = agruparVariantes([
				{ $id: '1', nombre: 'Aire Acondicionado Portatil Vitta Home - 5000w Frio/calor Blanco' }
			]);
			expect(grupos).toHaveLength(1);
			expect(grupos[0].base).toBe('Aire Acondicionado Portatil Vitta Home - 5000w Frio/calor Blanco');
		});

		it('conserva el tronco común cuando el grupo sí tiene varias variantes', () => {
			const grupos = agruparVariantes([
				{ $id: '1', nombre: 'Construye el Titanic - Fasciculo N.01' },
				{ $id: '2', nombre: 'Construye el Titanic - Fasciculo N.02' }
			]);
			expect(grupos[0].base).toBe('Construye el Titanic');
		});

		it('la clave de agrupado no cambia: si aparece una hermana, se juntan', () => {
			const solo = agruparVariantes([{ $id: '1', nombre: 'Anafe Cocina - Gas Envasado' }]);
			const conHermana = agruparVariantes([
				{ $id: '1', nombre: 'Anafe Cocina - Gas Envasado' },
				{ $id: '2', nombre: 'Anafe Cocina - Gas Natural' }
			]);
			expect(solo[0].clave).toBe(conHermana[0].clave);
			expect(solo[0].base).toBe('Anafe Cocina - Gas Envasado');
			expect(conHermana[0].base).toBe('Anafe Cocina');
			expect(conHermana[0].variantes).toHaveLength(2);
		});

		it('el override de grupo tampoco recorta si queda solo', () => {
			const grupos = agruparVariantes([
				{ $id: '1', nombre: 'Remera Algodón - Talle S Negro', grupo: 'Remera Algodón' }
			]);
			expect(grupos[0].base).toBe('Remera Algodón - Talle S Negro');
			expect(grupos[0].clave).toBe(claveDeGrupo({ nombre: 'Remera Algodón - Talle M' , grupo: 'Remera Algodón' }));
		});

		it('un nombre vacío no rompe el grupo', () => {
			const grupos = agruparVariantes([{ $id: '1', nombre: '', grupo: 'Coleccion' }]);
			expect(grupos[0].base).toBe('Coleccion');
		});
	});

	it('agrupa aunque difieran acentos o mayúsculas', () => {
		const grupos = agruparVariantes([
			{ $id: 'a', nombre: 'Novelas Eternas - 01 Orgullo' },
			{ $id: 'b', nombre: 'NOVELAS ETERNAS - 02 Cumbres' }
		]);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].variantes).toHaveLength(2);
	});

	it('el override permite juntar productos con nombres distintos', () => {
		const grupos = agruparVariantes([
			{ $id: 'a', nombre: 'Alfajor de maizena', grupo: 'Alfajores' },
			{ $id: 'b', nombre: 'Alfajor marplatense', grupo: 'Alfajores' }
		]);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].variantes).toHaveLength(2);
	});

	it('tolera una lista vacía o con nombres vacíos', () => {
		expect(agruparVariantes([])).toHaveLength(0);
		expect(agruparVariantes([{ nombre: '' }, { nombre: '   ' }])).toHaveLength(0);
	});
});

describe('compararPorPrioridad', () => {
	it('el orden manual le gana a la fecha', () => {
		const viejo = { orden: 10, $createdAt: '2020-01-01T00:00:00.000Z' };
		const nuevo = { orden: 0, $createdAt: '2026-01-01T00:00:00.000Z' };
		expect([nuevo, viejo].sort(compararPorPrioridad)[0]).toBe(viejo);
	});

	it('con igual orden, gana el más nuevo', () => {
		const viejo = { orden: 5, $createdAt: '2020-01-01T00:00:00.000Z' };
		const nuevo = { orden: 5, $createdAt: '2026-01-01T00:00:00.000Z' };
		expect([viejo, nuevo].sort(compararPorPrioridad)[0]).toBe(nuevo);
	});

	it('un orden negativo manda el producto al fondo', () => {
		const normal = { orden: 0, $createdAt: '2020-01-01T00:00:00.000Z' };
		const hundido = { orden: -50, $createdAt: '2026-01-01T00:00:00.000Z' };
		expect([hundido, normal].sort(compararPorPrioridad)[0]).toBe(normal);
	});

	it('trata orden ausente como cero, sin romper el orden por fecha', () => {
		const sinOrden = { $createdAt: '2026-01-01T00:00:00.000Z' };
		const conCero = { orden: 0, $createdAt: '2020-01-01T00:00:00.000Z' };
		expect([conCero, sinOrden].sort(compararPorPrioridad)[0]).toBe(sinOrden);
	});
});
