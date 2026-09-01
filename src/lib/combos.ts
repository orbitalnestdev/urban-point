/**
 * Combos: un producto que se vende como uno solo pero sale del depósito como
 * varios.
 *
 * La regla que ordena todo: **un combo no tiene stock propio**. Lo que hay
 * disponible sale de sus integrantes, y venderlo descuenta a cada uno.
 *
 * Sin esto el inventario miente en las dos direcciones: la vitrina mostraría
 * el combo agotado porque su propio `stock` es 0, y si igual se vendiera no
 * bajaría ni una unidad de lo que realmente se entregó.
 *
 * Funciones puras, sin dependencias: las usan tanto el checkout y el descuento
 * de stock como la vista del catálogo.
 */

export interface IntegranteCombo {
	product_id: string;
	cantidad: number;
}

/** Producto con lo mínimo para razonar sobre stock. */
export interface ProductoConStock {
	$id?: string;
	tipo?: string | null;
	combo_items?: string | unknown[] | null;
	stock?: number | null;
	[k: string]: any;
}

/**
 * Integrantes de un combo. Devuelve [] si no es un combo o si el JSON está
 * roto: en ese caso el producto se trata como uno simple, que es lo
 * conservador —mueve su propio stock en vez de no mover ninguno.
 */
export function integrantesDeCombo(producto: ProductoConStock): IntegranteCombo[] {
	if (!producto || producto.tipo !== 'combo' || !producto.combo_items) return [];

	try {
		const crudos = typeof producto.combo_items === 'string'
			? JSON.parse(producto.combo_items)
			: producto.combo_items;

		if (!Array.isArray(crudos)) return [];

		return crudos
			.filter((it: any) => it && it.product_id)
			.map((it: any) => ({
				product_id: String(it.product_id),
				cantidad: Math.max(1, Math.floor(Number(it.cantidad) || 1))
			}));
	} catch {
		return [];
	}
}

/** ¿Es un combo con integrantes cargados? */
export function esCombo(producto: ProductoConStock): boolean {
	return integrantesDeCombo(producto).length > 0;
}

/**
 * Unidades que mueve vender `cantidad` de este producto.
 * Un combo se expande en sus integrantes; el resto se devuelve tal cual.
 */
export function unidadesQueMueve(
	producto: ProductoConStock,
	cantidad: number
): Array<{ productId: string; cantidad: number }> {
	const integrantes = integrantesDeCombo(producto);
	const id = String(producto?.$id || '');

	if (integrantes.length === 0) {
		return id ? [{ productId: id, cantidad }] : [];
	}

	return integrantes.map((it) => ({
		productId: it.product_id,
		cantidad: it.cantidad * cantidad
	}));
}

/**
 * Cuántas unidades de este producto se pueden vender.
 *
 * Para un combo es cuántas veces alcanza el integrante más escaso. Un
 * integrante que no está en `porId` cuenta como 0: mejor mostrarlo agotado que
 * vender algo que no se puede armar.
 */
export function stockDisponible(
	producto: ProductoConStock,
	porId: Map<string, ProductoConStock>
): number {
	const integrantes = integrantesDeCombo(producto);

	if (integrantes.length === 0) {
		return Math.max(0, Math.floor(Number(producto?.stock) || 0));
	}

	let posibles = Infinity;
	for (const it of integrantes) {
		const stockIntegrante = Math.max(0, Math.floor(Number(porId.get(it.product_id)?.stock) || 0));
		posibles = Math.min(posibles, Math.floor(stockIntegrante / it.cantidad));
		if (posibles === 0) return 0;
	}

	return Number.isFinite(posibles) ? posibles : 0;
}
