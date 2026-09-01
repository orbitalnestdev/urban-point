/**
 * Vista derivada del catálogo: lo que la vitrina y la ficha necesitan ya
 * calculado.
 *
 * `getCachedCatalog()` cachea los documentos crudos cinco minutos, pero cada
 * página rehacía sobre ellos el mismo trabajo en CADA request: agrupar las
 * variantes, contar productos por categoría, compactar el catálogo y
 * serializarlo. Medido con 6.185 productos y 199 categorías, eran ~36 ms por
 * visita, de los cuales 27 se iban en el conteo por categoría.
 *
 * Como Node es monohilo, esos milisegundos no son latencia de un request: son
 * tiempo en el que no se atiende a nadie más. Y el resultado no depende de
 * quién mire —`precioDeVentaCentavos()` toma sólo el producto, no el rol—, así
 * que era exactamente el mismo objeto recalculado para cada visitante.
 *
 * La vista se memoiza contra la IDENTIDAD del objeto de caché, con un WeakMap.
 * Cuando el caché se refresca produce un objeto nuevo, la búsqueda falla y la
 * vista se reconstruye sola. No hay invalidación que mantener ni TTL que se
 * pueda desincronizar del de los datos: si los datos son viejos, la vista es
 * igual de vieja, que es justo lo que se quiere.
 */

import { precioDeVentaCentavos, precioListaCentavos } from '../pricing';
import { resolveProductPriceForUser, tierDeRol, type PricingLevel } from '../pricingEngine';
import { agruparVariantes, claveDeGrupo, etiquetaDeVariante, type GrupoDeVariantes } from '../variantes';
import { stockDisponible } from '../combos';
import { getOptimizedImageUrl } from './catalogCache';

/**
 * Precio que este comprador ve, y lista tachada si corresponde.
 *
 * Para `publico` es exactamente lo de siempre (precioDeVentaCentavos, con su
 * promoción). Para canillita y distribuidor se muestra SU precio, y el público
 * queda tachado al lado cuando es mayor: el descuento del nivel tiene que ser
 * visible, si no el comprador no tiene forma de saber que lo tiene.
 */
export function precioParaTier(producto: any, tier: PricingLevel): { venta: number; lista: number | null } {
	if (tier === 'publico') {
		return { venta: precioDeVentaCentavos(producto), lista: precioListaCentavos(producto) };
	}

	const { unitPriceCentavos, appliedLevel } = resolveProductPriceForUser(producto, tier);

	// Sin precio cargado para su nivel, cae a público: ahí la lista tachada es
	// la promoción normal, no un descuento inventado.
	if (appliedLevel === 'publico') {
		return { venta: unitPriceCentavos, lista: precioListaCentavos(producto) };
	}

	const publico = precioDeVentaCentavos(producto);
	return { venta: unitPriceCentavos, lista: publico > unitPriceCentavos ? publico : null };
}

/** Id de la categoría, venga como string o como documento expandido. */
const idCategoria = (p: any): string =>
	(typeof p?.categoria_id === 'object' ? p?.categoria_id?.$id : p?.categoria_id) || '';

/** Id del padre de una categoría, con la misma tolerancia. */
const idPadre = (c: any): string =>
	(typeof c?.parent_id === 'string' ? c.parent_id : c?.parent_id?.$id) || '';

/**
 * Productos por categoría, sumando a cada padre lo de sus hijas.
 *
 * Antes era un producto cartesiano: por cada categoría se recorría el catálogo
 * entero, y para las padre se recorría otra vez con un `includes()` adentro del
 * filtro. Con 199 categorías y 6.185 productos daba ~1,2 M de comparaciones y
 * 29 ms. Esto son dos pasadas y da el mismo resultado en 0,36 ms.
 */
export function contarProductosPorCategoria(products: any[], categories: any[]): any[] {
	const directo = new Map<string, number>();
	for (const p of products) {
		const id = idCategoria(p);
		if (id) directo.set(id, (directo.get(id) || 0) + 1);
	}

	const total = new Map<string, number>();
	for (const c of categories) total.set(c.$id, directo.get(c.$id) || 0);

	// Cada hija suma en su padre. Un solo nivel, igual que la versión anterior.
	for (const c of categories) {
		const padre = idPadre(c);
		if (padre && total.has(padre)) {
			total.set(padre, (total.get(padre) || 0) + (directo.get(c.$id) || 0));
		}
	}

	return categories.map((c: any) => ({ ...c, productCount: total.get(c.$id) || 0 }));
}

/** Entrada compacta del catálogo que viaja al navegador como JSON. */
export interface EntradaVitrina {
	i: string; s: string; n: string; m: string;
	p: number; x: number; l: number | null;
	k: number; c: string; u: string; q: string; v: number;
	/** Etiquetas de las variantes, para que el buscador las alcance. */
	t?: string;
}

export interface VistaCatalogo {
	/** Categorías con `productCount` ya calculado. */
	categorias: any[];
	/** Padres con productos, de mayor a menor. */
	categoriasPadre: any[];
	/** parent.$id -> "idPadre,idHija1,idHija2" para los filtros de la vitrina. */
	familiaPorPadre: Map<string, string>;
	/** Un grupo de variantes por tarjeta. */
	grupos: GrupoDeVariantes<any>[];
	/** El catálogo compacto que se serializa en el HTML. */
	compacto: EntradaVitrina[];
	/** slug -> producto. Evita el barrido lineal de la ficha. */
	porSlug: Map<string, any>;
	/** clave de grupo -> variantes, con el MISMO criterio que la vitrina. */
	porGrupo: Map<string, any[]>;
	/** id de categoría -> productos. */
	porCategoria: Map<string, any[]>;
}

function construirVista(cache: any, tier: PricingLevel): VistaCatalogo {
	const products: any[] = cache?.products || [];
	const categoriasCrudas: any[] = cache?.categories || [];

	const categorias = contarProductosPorCategoria(products, categoriasCrudas);

	const categoriasPadre = categorias
		.filter((c: any) => !c.parent_id && c.productCount > 0)
		.sort((a: any, b: any) => (b.productCount || 0) - (a.productCount || 0));

	// Una pasada por categorías en vez de un filtro por cada padre renderizado.
	const hijasPorPadre = new Map<string, string[]>();
	for (const c of categorias) {
		const padre = idPadre(c);
		if (!padre) continue;
		const lista = hijasPorPadre.get(padre);
		if (lista) lista.push(c.$id);
		else hijasPorPadre.set(padre, [c.$id]);
	}
	const familiaPorPadre = new Map<string, string>();
	for (const c of categorias) {
		familiaPorPadre.set(c.$id, [c.$id, ...(hijasPorPadre.get(c.$id) || [])].join(','));
	}

	// Índice por id: lo necesita el stock de los combos, que no tienen stock
	// propio sino el que permitan sus integrantes.
	const productoPorId = new Map<string, any>(products.map((p: any) => [p.$id, p]));

	const grupos = agruparVariantes(products);

	const compacto: EntradaVitrina[] = grupos.map((grupo) => {
		const principal: any = grupo.principal;

		// Un solo recorrido para mínimo, máximo y stock: antes eran un map, dos
		// spreads a Math.min/Math.max y un reduce sobre la misma lista. El
		// spread además tiene un techo de argumentos, así que un grupo enorme
		// —si alguien carga mal el campo `grupo`— podía tirar la página entera.
		let minimo = Infinity;
		let maximo = 0;
		let stockTotal = 0;
		for (const v of grupo.variantes) {
			const precio = precioParaTier(v, tier).venta;
			if (precio > 0) {
				if (precio < minimo) minimo = precio;
				if (precio > maximo) maximo = precio;
			}
			stockTotal += stockDisponible(v, productoPorId);
		}
		if (minimo === Infinity) {
			minimo = precioParaTier(principal, tier).venta;
			maximo = minimo;
		}

		const listaCentavos = precioParaTier(principal, tier).lista;

		// Etiquetas distintivas de las variantes, para el buscador. La tarjeta
		// muestra el tronco común ("Construye el Titanic"), así que sin esto
		// buscar "Fasciculo N.42" no encontraba nada: en el catálogo real son
		// 4.513 productos (73%) inalcanzables por su propia etiqueta.
		//
		// Se indexan SÓLO las etiquetas, no los nombres completos: repetir el
		// tronco en cada una multiplicaba el peso del JSON sin agregar nada,
		// porque el tronco ya está en `n`.
		let terminos = '';
		if (grupo.variantes.length > 1) {
			const vistas = new Set<string>();
			for (const v of grupo.variantes) {
				const etq = etiquetaDeVariante(v).trim();
				if (etq && etq !== grupo.base) vistas.add(etq);
			}
			terminos = [...vistas].join(' ');
		}

		return {
			i: principal.$id,
			s: principal.slug,
			n: grupo.base,
			m: principal.marca || '',
			p: minimo / 100,
			x: maximo / 100,
			l: listaCentavos === null ? null : listaCentavos / 100,
			k: stockTotal,
			c: idCategoria(principal) || 'none',
			u: getOptimizedImageUrl(principal.portada_url || '', 400, 400, 80),
			q: principal.sku || principal.$id,
			v: grupo.variantes.length,
			...(terminos ? { t: terminos } : {})
		};
	});

	const porSlug = new Map<string, any>();
	const porCategoria = new Map<string, any[]>();
	for (const p of products) {
		if (p.slug && !porSlug.has(p.slug)) porSlug.set(p.slug, p);
		const cat = idCategoria(p);
		if (cat) {
			const lista = porCategoria.get(cat);
			if (lista) lista.push(p);
			else porCategoria.set(cat, [p]);
		}
	}

	// Se reusa el agrupado ya hecho: misma clave, sin recorrer de nuevo.
	const porGrupo = new Map<string, any[]>();
	for (const grupo of grupos) porGrupo.set(grupo.clave, grupo.variantes);

	return {
		categorias,
		categoriasPadre,
		familiaPorPadre,
		grupos,
		compacto,
		porSlug,
		porGrupo,
		porCategoria
	};
}

/**
 * Memo por identidad del objeto de caché y por nivel de precio.
 *
 * Son tres niveles, no uno por usuario: público, canillita y distribuidor. La
 * vista de cada uno se construye a lo sumo una vez por refresco del caché, así
 * que mostrar el precio correcto a cada comprador cuesta dos vistas más, no un
 * recálculo por visita.
 */
const vistas = new WeakMap<object, Map<PricingLevel, VistaCatalogo>>();

/**
 * Vista derivada del catálogo para el nivel de precio indicado.
 *
 * @param rolOTier Rol del usuario (`Astro.locals.user?.role`) o el nivel
 *                 directamente. Sin argumento, precio público.
 */
export function getVistaCatalogo(cache: any, rolOTier?: string | null): VistaCatalogo {
	const tier = tierDeRol(rolOTier);

	if (!cache || typeof cache !== 'object') {
		return construirVista({ products: [], categories: [] }, tier);
	}

	let porTier = vistas.get(cache);
	if (!porTier) {
		porTier = new Map<PricingLevel, VistaCatalogo>();
		vistas.set(cache, porTier);
	}

	const existente = porTier.get(tier);
	if (existente) return existente;

	const vista = construirVista(cache, tier);
	porTier.set(tier, vista);
	return vista;
}

/** Variantes hermanas de un producto, con el criterio de la vitrina. */
export function variantesDelGrupo(vista: VistaCatalogo, producto: any): any[] {
	return vista.porGrupo.get(claveDeGrupo(producto)) || [producto];
}
