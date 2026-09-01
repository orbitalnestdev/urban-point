/**
 * Regresión — la carga de variantes tenía dos modelos conviviendo.
 *
 * El que funciona: cada variante es su propio documento y se agrupan por el
 * campo `grupo` (ver src/lib/variantes.ts). Así cada una conserva su stock, su
 * SKU y su historial en order_items.
 *
 * El que no: el editor tenía una pestaña "Variantes" que guardaba un JSON
 * dentro del mismo producto. No servía para nada:
 *  - `currentVariants` nunca entraba al payload de guardado, así que ni
 *    siquiera persistía;
 *  - sembraba tres filas S/M/L con stock inventado (10/15/8) que parecían
 *    datos reales;
 *  - la pestaña dependía de `?tipo=variantes` en la URL, y `createProduct`
 *    descartaba `tipo`, así que al volver desde el listado desaparecía.
 *
 * Y `grupo`, el campo que sí se usa, no era editable desde ninguna parte del
 * panel: sólo se podía cargar importando un CSV.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const acciones = leer('src/actions/index.ts');
const editor = leer('src/pages/admin/catalogo/[id].astro');
const listado = leer('src/pages/admin/catalogo/index.astro');
const modal = leer('src/components/admin/NewProductModal.tsx');

const handlerUpdate = acciones.slice(
	acciones.indexOf('updateProduct: defineAction'),
	acciones.indexOf('bulkUpdateProducts: defineAction')
);

describe('updateProduct maneja grupo, no el JSON de variantes', () => {
	it('acepta grupo y es opcional', () => {
		const decl = /grupo: z\.[^\n]*/.exec(handlerUpdate)?.[0] ?? '';
		expect(decl, 'grupo no está declarado').not.toBe('');
		expect(decl.includes('.optional()')).toBe(true);
	});

	it('persiste grupo en el documento', () => {
		expect(/updateData\.grupo\s*=/.test(handlerUpdate)).toBe(true);
	});

	it('ya no acepta el campo variantes, que nadie escribía ni leía', () => {
		expect(/^\s*variantes: z\./m.test(handlerUpdate)).toBe(false);
		expect(/updateData\.variantes\s*=/.test(handlerUpdate)).toBe(false);
	});

	it('createProduct ya no recibe un tipo que descartaba', () => {
		const handlerCreate = acciones.slice(
			acciones.indexOf('createProduct: defineAction'),
			acciones.indexOf('updateProduct: defineAction')
		);
		expect(/tipo: z\./.test(handlerCreate)).toBe(false);
	});
});

describe('el panel deja editar el grupo', () => {
	it('el editor de producto tiene el campo y lo manda al guardar', () => {
		expect(editor.includes('id="input-grupo"'), 'falta el input').toBe(true);
		expect(/getElementById\('input-grupo'\)/.test(editor), 'no se lee al guardar').toBe(true);
		expect(/^\s*grupo,$/m.test(editor), 'no viaja en el payload').toBe(true);
	});

	it('la edición rápida del listado también', () => {
		expect(listado.includes('id="qe-grupo"')).toBe(true);
		expect(listado.includes('data-grupo=')).toBe(true);
		expect(/getElementById\('qe-grupo'\)/.test(listado)).toBe(true);
		expect(/^\s*grupo,$/m.test(listado)).toBe(true);
	});

	it('el campo del listado avisa si quedan cambios sin guardar', () => {
		const lista = /\['qe-precio'[^\]]*\]/.exec(listado)?.[0] ?? '';
		expect(lista.includes("'qe-grupo'")).toBe(true);
	});
});

describe('la pestaña de variantes JSON ya no existe', () => {
	it('no queda panel, botón ni estado de variantes en el editor', () => {
		for (const rastro of [
			'tab-variantes',
			'lista-variantes',
			'btn-agregar-variante',
			'currentVariants',
			'renderVariants'
		]) {
			expect(editor.includes(rastro), `quedó "${rastro}" en el editor`).toBe(false);
		}
	});

	it('el editor ya no depende de ?tipo= para decidir qué mostrar', () => {
		expect(editor.includes('tipoParam')).toBe(false);
		expect(editor.includes("searchParams.get('tipo')")).toBe(false);
	});

	it('no quedan las variantes sembradas con stock inventado', () => {
		expect(/S \/ Estándar|M \/ Estándar|L \/ Estándar/.test(editor)).toBe(false);
	});

	it('el alta ya no ofrece tipos que no se guardaban', () => {
		expect(/handleSelectType/.test(modal)).toBe(false);
		expect(/'combo'/.test(modal)).toBe(false);
		// Sobre el código, no sobre los comentarios: lo que importa es que la
		// redirección no arrastre un ?tipo= del que dependía la pestaña.
		const redireccion = /window\.location\.href\s*=\s*`[^`]*`/.exec(modal)?.[0] ?? '';
		expect(redireccion, 'no se encontró la redirección').not.toBe('');
		expect(redireccion.includes('tipo')).toBe(false);
	});

	it('el alta explica cómo se cargan las variantes de verdad', () => {
		expect(/Grupo de variantes/.test(modal)).toBe(true);
		expect(/su propio producto/i.test(modal)).toBe(true);
	});
});
