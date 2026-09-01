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

	it('createProduct recibe el tipo Y lo guarda', () => {
		const handlerCreate = acciones.slice(
			acciones.indexOf('createProduct: defineAction'),
			acciones.indexOf('createProductoConVariantes: defineAction')
		);
		// Antes se recibía y se descartaba: nunca entraba al payload, así que el
		// editor tenía que leerlo de ?tipo= en la URL y se perdía al volver.
		expect(/tipo: z\.enum\(\['simple', 'variantes', 'combo'\]\)/.test(handlerCreate)).toBe(true);
		expect(/tipo: input\.tipo/.test(handlerCreate)).toBe(true);
	});
});

describe('createProductoConVariantes crea documentos hermanos', () => {
	const handler = acciones.slice(
		acciones.indexOf('createProductoConVariantes: defineAction'),
		acciones.indexOf('updateProduct: defineAction')
	);

	it('existe la action', () => {
		expect(handler).not.toBe('');
	});

	it('escribe un producto por variante, no un JSON adentro de uno solo', () => {
		expect(/for \(const \[i, v\] of input\.variantes\.entries\(\)\)/.test(handler)).toBe(true);
		expect(/escribirDocumentoTolerante\('products'/.test(handler)).toBe(true);
	});

	it('todas comparten el mismo grupo, que es lo que las junta en la vitrina', () => {
		expect(/\bgrupo\b/.test(handler)).toBe(true);
		expect(/tipo: 'variantes'/.test(handler)).toBe(true);
	});

	it('rechaza etiquetas repetidas, que darían fichas indistinguibles', () => {
		expect(/está repetida/.test(handler)).toBe(true);
	});

	it('el slug lleva el índice: un lote colisiona con sólo un random corto', () => {
		expect(/\$\{i\}/.test(handler)).toBe(true);
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

	it('la redirección al editor no arrastra el ?tipo= del que dependía', () => {
		const redireccion = /window\.location\.href\s*=\s*`[^`]*`/.exec(modal)?.[0] ?? '';
		expect(redireccion, 'no se encontró la redirección').not.toBe('');
		expect(redireccion.includes('tipo')).toBe(false);
	});
});

describe('el alta ofrece los tres tipos, y cada uno hace lo suyo', () => {
	it('están las tres opciones', () => {
		for (const tipo of ['simple', 'variantes', 'combo']) {
			expect(new RegExp(`id: '${tipo}'`).test(modal), `falta la opción ${tipo}`).toBe(true);
		}
	});

	it('cada tipo tiene su propio flujo de creación', () => {
		expect(/crearSimple/.test(modal)).toBe(true);
		expect(/crearConVariantes/.test(modal)).toBe(true);
		expect(/crearCombo/.test(modal)).toBe(true);
	});

	it('las variantes se crean con la action de documentos hermanos', () => {
		expect(/actions\.createProductoConVariantes/.test(modal)).toBe(true);
	});

	it('el tipo viaja al crear, para que quede guardado', () => {
		expect(/tipo: 'simple'/.test(modal)).toBe(true);
		expect(/tipo: 'combo'/.test(modal)).toBe(true);
	});

	it('no usa clases de Tailwind armadas al vuelo, que no se compilan', () => {
		// Sobre el código, no sobre los comentarios: el propio archivo explica
		// el problema citando un `bg-${color}-50` de ejemplo.
		const soloCodigo = modal
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.split('\n')
			.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
			.join('\n');
		expect(/(bg|text|border)-\$\{/.test(soloCodigo)).toBe(false);
	});
});

/**
 * El agrupado funcionaba en la tienda pero era invisible en el panel: cargabas
 * "un producto con variantes" y te quedaban tres filas sueltas que no se veían
 * relacionadas, y el editor de una variante no mostraba las otras.
 */
describe('el panel muestra el agrupado', () => {
	it('el editor lista las variantes hermanas', () => {
		expect(/const hermanas =/.test(editor), 'el editor no calcula las hermanas').toBe(true);
		expect(/Otras variantes de/.test(editor), 'no las muestra').toBe(true);
		expect(/\/admin\/catalogo\/\$\{h\.\$id\}/.test(editor), 'no enlaza a cada una').toBe(true);
	});

	it('el editor usa el criterio canónico, no uno propio', () => {
		expect(/claveDeGrupo\(p\)\s*===\s*claveActual/.test(editor)).toBe(true);
		expect(/\.toLowerCase\(\)\s*===/.test(editor), 'volvió a comparar a mano').toBe(false);
	});

	it('el editor busca sobre el catálogo completo, no sobre una tanda de 100', () => {
		expect(/getAdminCachedCatalog/.test(editor)).toBe(true);
		expect(/'products',\s*\[Query\.limit\(100\)\]/.test(editor)).toBe(false);
	});

	it('el listado marca las filas que son variantes de un mismo producto', () => {
		expect(/conteoPorGrupo/.test(listado)).toBe(true);
		expect(/grupoDeFila/.test(listado)).toBe(true);
	});

	it('el listado no marca los productos que están solos', () => {
		// grupoDeFila devuelve null cuando el grupo tiene una sola ficha.
		expect(/>\s*1\s*\?\s*grupoDeProducto\(p\)\s*:\s*null/.test(listado)).toBe(true);
	});
});

describe('los integrantes del combo no son un dato invisible', () => {
	const ficha = leer('src/pages/productos/[slug].astro');

	it('el editor los muestra y los deja editar', () => {
		expect(editor.includes('combo-lista')).toBe(true);
		expect(editor.includes('combo-agregar')).toBe(true);
	});

	it('viajan al guardar', () => {
		expect(/combo_items: JSON\.stringify/.test(editor)).toBe(true);
	});

	it('updateProduct los persiste', () => {
		expect(/updateData\.combo_items\s*=/.test(handlerUpdate)).toBe(true);
	});

	it('el comprador ve qué incluye el combo en la ficha', () => {
		expect(ficha.includes('comboIncluye')).toBe(true);
		expect(/Qué incluye este combo/.test(ficha)).toBe(true);
	});
});
