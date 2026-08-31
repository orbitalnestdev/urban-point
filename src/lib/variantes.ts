/**
 * Agrupado de variantes. Fuente única para vitrina, ficha e importador.
 *
 * El catálogo trae cada variante como un producto separado: 6.185 fichas
 * activas que al agrupar quedan en 1.695. Son colecciones por fascículo o por
 * color ("Construye el Titanic - Fasciculo N.01", "... N.02"), y en la vitrina
 * se veían como decenas de tarjetas casi idénticas.
 *
 * NO se fusionan documentos. Cada variante sigue siendo su propio producto, con
 * su stock, su SKU y su historial: `order_items` apunta a esos documentos y el
 * descuento de stock trabaja sobre ellos. Meterlas dentro de un JSON rompería
 * las dos cosas. Acá sólo se agrupa para mostrar.
 *
 * El grupo sale de dos lados, en este orden:
 *   1. El campo `grupo` del producto, si tiene valor. Lo puede cargar el CSV o
 *      el panel: es la palabra final cuando el nombre no alcanza.
 *   2. El nombre, cortando el último tramo después de " - ".
 *
 * Que el campo sea un override y no un dato obligatorio evita migrar los 5.743
 * productos que ya existen, y hace que el agrupado se pueda revertir sin tocar
 * la base.
 */

/** Guion (normal, en o em) rodeado de espacios. */
const SEPARADOR = /\s+[-–—]\s+/;

export interface ProductoAgrupable {
	$id?: string;
	nombre?: string;
	grupo?: string | null;
	[k: string]: any;
}

export interface GrupoDeVariantes<T = ProductoAgrupable> {
	/** Nombre que se muestra en la tarjeta. */
	base: string;
	/** Clave de agrupado, normalizada. */
	clave: string;
	/** El producto que representa al grupo en la vitrina. */
	principal: T;
	/** Todas las variantes, incluida la principal, en el orden recibido. */
	variantes: T[];
}

const normalizar = (s: string) =>
	s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Clave de agrupado de un producto. Es la que usa `agruparVariantes`, y la
 * única forma correcta de preguntar "¿estos dos productos son variantes del
 * mismo?".
 *
 * Existe porque la ficha de producto comparaba con
 * `grupoDeProducto(p).toLowerCase()`, sin normalizar tildes ni espacios. Con un
 * nombre acentuado de forma inconsistente —cosa normal en un catálogo
 * importado por CSV desde varias fuentes— la vitrina y la ficha discrepaban: la
 * tarjeta anunciaba tres variantes y la ficha mostraba dos, dejando la tercera
 * inalcanzable. Que la clave viva en un solo lugar impide que vuelvan a
 * separarse.
 */
export function claveDeGrupo(producto: ProductoAgrupable): string {
	return normalizar(grupoDeProducto(producto));
}

/**
 * Nombre del grupo al que pertenece un producto.
 * Si no tiene separador ni override, el producto es su propio grupo.
 */
export function grupoDeProducto(producto: ProductoAgrupable): string {
	const explicito = typeof producto?.grupo === 'string' ? producto.grupo.trim() : '';
	if (explicito) return explicito;

	const nombre = (producto?.nombre || '').trim();
	const partes = nombre.split(SEPARADOR);
	if (partes.length < 2) return nombre;

	// Se corta sólo el último tramo: "Objetos de Coleccion - Vehiculos - Autos"
	// agrupa como "Objetos de Coleccion - Vehiculos", no como "Objetos".
	return partes.slice(0, -1).join(' - ').trim() || nombre;
}

/**
 * Etiqueta que distingue a esta variante dentro de su grupo: "Fasciculo N.01",
 * "Dorado/Marrón". Si no se puede separar, se devuelve el nombre completo.
 */
export function etiquetaDeVariante(producto: ProductoAgrupable): string {
	const nombre = (producto?.nombre || '').trim();
	const explicito = typeof producto?.grupo === 'string' ? producto.grupo.trim() : '';

	if (explicito) {
		if (normalizar(nombre).startsWith(normalizar(explicito))) {
			const resto = nombre.slice(explicito.length).replace(/^\s*[-–—]\s*/, '').trim();
			if (resto) return resto;
		}
		return nombre;
	}

	const partes = nombre.split(SEPARADOR);
	return partes.length > 1 ? partes[partes.length - 1].trim() : nombre;
}

/**
 * Agrupa preservando el orden de entrada: el primero de cada grupo queda como
 * principal, así el ordenamiento de la vitrina manda también acá.
 */
export function agruparVariantes<T extends ProductoAgrupable>(productos: T[]): GrupoDeVariantes<T>[] {
	const porClave = new Map<string, GrupoDeVariantes<T>>();

	for (const producto of productos || []) {
		const base = grupoDeProducto(producto);
		const clave = claveDeGrupo(producto);
		if (!clave) continue;

		const existente = porClave.get(clave);
		if (existente) {
			existente.variantes.push(producto);
		} else {
			porClave.set(clave, { base, clave, principal: producto, variantes: [producto] });
		}
	}

	return [...porClave.values()];
}

/**
 * Orden de la vitrina: primero la prioridad manual (`orden`, mayor primero) y
 * después la fecha de alta.
 *
 * Antes se ordenaba sólo por fecha, así que lo último importado quedaba arriba:
 * un lote de lentes desplazaba a todo lo demás sin que nadie lo decidiera.
 */
export function compararPorPrioridad(a: ProductoAgrupable, b: ProductoAgrupable): number {
	const ordenA = Number(a?.orden) || 0;
	const ordenB = Number(b?.orden) || 0;
	if (ordenA !== ordenB) return ordenB - ordenA;

	const fechaA = Date.parse(a?.$createdAt || '') || 0;
	const fechaB = Date.parse(b?.$createdAt || '') || 0;
	return fechaB - fechaA;
}
