/**
 * Regresión — M-01 y M-02: la edición desde el catálogo corrompía productos.
 *
 * updateProduct exigía nombre, precio, stock y estado, y los escribía siempre.
 * Como consecuencia:
 *  - Cambiar el estado desde el desplegable de la tabla mandaba
 *    nombre:'Producto', precio:100, stock:0 y renombraba el producto.
 *  - Guardar desde el panel rápido no enviaba descripcion, y el handler
 *    forzaba `descripcion: input.descripcion || ''`, vaciándola.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const acciones = leer('src/actions/index.ts');
const handler = acciones.slice(
	acciones.indexOf('updateProduct: defineAction'),
	acciones.indexOf('bulkUpdateProducts: defineAction')
);

describe('updateProduct acepta actualizaciones parciales', () => {
	it('ningún campo de contenido es obligatorio', () => {
		for (const campo of ['nombre', 'precio', 'stock', 'estado']) {
			const decl = new RegExp(`${campo}: z\\.[^\\n]*`).exec(handler)?.[0] ?? '';
			expect(decl, `${campo} no está declarado`).not.toBe('');
			expect(decl.includes('.optional()'), `${campo} sigue siendo obligatorio: ${decl}`).toBe(true);
		}
	});

	it('no escribe campos que no se informaron', () => {
		for (const campo of ['nombre', 'precio', 'stock', 'descripcion', 'estado']) {
			const guardado = new RegExp(`if \\(input\\.${campo} !== undefined\\)`).test(handler);
			expect(guardado, `${campo} se escribe sin verificar si vino`).toBe(true);
		}
	});

	it('el objeto de update arranca vacío', () => {
		// Antes se inicializaba con nombre/descripcion/precio/stock/estado ya
		// dentro, así que toda llamada los sobrescribía.
		expect(/const updateData: any = \{\s*\};/.test(handler)).toBe(true);
	});

	it('no fuerza la descripción a cadena vacía', () => {
		// `descripcion: input.descripcion || ''` la borraba en cada guardado.
		expect(/descripcion: input\.descripcion \|\| ''/.test(handler)).toBe(false);
	});
});

describe('Los llamadores no mandan valores inventados', () => {
	const catalogo = leer('src/pages/admin/catalogo/index.astro');

	it('el desplegable de estado sólo envía el estado', () => {
		expect(/nombre: 'Producto'/.test(catalogo), 'sigue mandando nombre:"Producto"').toBe(false);
		expect(/precio: 100,/.test(catalogo), 'sigue mandando precio:100').toBe(false);
	});

	it('el panel rápido no envía descripción', () => {
		const guardado = catalogo.slice(
			catalogo.indexOf('const nombreEditado'),
			catalogo.indexOf('const nombreEditado') + 600
		);
		expect(guardado.includes('descripcion')).toBe(false);
	});

	it('el editor completo sí sigue enviando la descripción', () => {
		// Es el único que la edita: debe poder guardarla.
		const editor = leer('src/pages/admin/catalogo/[id].astro');
		expect(editor.includes('descripcion,')).toBe(true);
	});
});
