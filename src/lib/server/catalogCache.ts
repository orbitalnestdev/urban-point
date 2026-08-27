import { Query } from 'node-appwrite';
import { createAdminClient } from './appwrite';
import { precioDeVentaCentavos } from '../pricing';

const globalObj = global as any;

/**
 * Tamaño de página. Medido contra este backend (RTT ~550 ms), 1000 es el punto
 * óptimo para los 4971 productos: 5 requests en vez de 50.
 *   100  -> 50 requests -> 33,0 s
 *   1000 ->  5 requests -> 13,2 s
 *   2500 ->  2 requests -> 26,8 s  (respuestas demasiado grandes)
 */
const TAMANO_PAGINA = 1000;

/**
 * El catálogo público cambia poco y se revalida de fondo, así que el TTL puede
 * ser largo. El de admin es más corto porque se edita en vivo, y además
 * invalidateCatalogCache() lo limpia en cada escritura.
 *
 * Antes el TTL era de 30 s (público) y 15 s (admin), pero llenar el caché
 * tardaba 29 s y 54 s: vencía antes de terminar de escribirse, así que cada
 * request rehacía el trabajo completo. La home tardaba 60 s y /admin 90 s.
 */
const TTL_PUBLICO_MS = 5 * 60 * 1000;
const TTL_ADMIN_MS = 60 * 1000;

const DB = 'urbanpoint';

export const getOptimizedImageUrl = (url?: string | null, width = 400, height = 400, quality = 80): string => {
  if (!url) return '';
  const cleanUrl = url.trim();
  if (cleanUrl.includes('/storage/buckets/') && cleanUrl.includes('/files/') && cleanUrl.includes('/view')) {
    return cleanUrl.replace('/view', `/preview?width=${width}&height=${height}&output=webp&quality=${quality}`);
  }
  return cleanUrl;
};

/**
 * Trae una colección entera paginando EN PARALELO.
 *
 * La primera página informa el total; el resto se dispara de una sola vez. En
 * serie —un `while` con await adentro— cada página pagaba el RTT completo:
 * 4971 productos tardaban 54 s contra los 13 s de esta versión.
 *
 * `filtros` debe incluir un orden estable: sin él, la paginación por offset
 * puede repetir o saltear documentos entre páginas.
 */
async function traerColeccionCompleta(
  databases: any,
  coleccion: string,
  filtros: any[] = []
): Promise<any[]> {
  const primera = await databases.listDocuments(DB, coleccion, [
    ...filtros,
    Query.limit(TAMANO_PAGINA),
    Query.offset(0)
  ]);

  const total = typeof primera.total === 'number' ? primera.total : primera.documents.length;
  const paginas = Math.ceil(total / TAMANO_PAGINA);
  if (paginas <= 1) return primera.documents;

  const resto = await Promise.all(
    Array.from({ length: paginas - 1 }, (_, i) =>
      databases.listDocuments(DB, coleccion, [
        ...filtros,
        Query.limit(TAMANO_PAGINA),
        Query.offset((i + 1) * TAMANO_PAGINA)
      ])
    )
  );

  return primera.documents.concat(...resto.map((r: any) => r.documents));
}

type EntradaCache = {
  datos: any | null;
  obtenidoEn: number;
  enVuelo: Promise<any> | null;
};

function obtenerEntrada(clave: string): EntradaCache {
  if (!globalObj[clave]) {
    globalObj[clave] = { datos: null, obtenidoEn: 0, enVuelo: null };
  }
  return globalObj[clave];
}

/**
 * Sirve del caché con revalidación en segundo plano.
 *
 * - Si está fresco, se devuelve tal cual.
 * - Si está vencido pero hay datos, se devuelven los viejos AL INSTANTE y la
 *   recarga sigue de fondo: ningún visitante espera el refetch.
 * - Sólo se espera cuando no hay absolutamente nada que mostrar.
 * - Una sola recarga en vuelo a la vez (single-flight): si entran veinte
 *   requests juntos, no disparan veinte paginaciones completas.
 */
/** Arranca una recarga si no hay otra en vuelo. Devuelve la promesa en curso. */
function iniciarCarga(entrada: EntradaCache, cargar: () => Promise<any>): Promise<any> {
  if (!entrada.enVuelo) {
    entrada.enVuelo = cargar()
      .then((datos) => {
        entrada.datos = datos;
        entrada.obtenidoEn = Date.now();
        return datos;
      })
      .finally(() => {
        entrada.enVuelo = null;
      });
  }
  return entrada.enVuelo;
}

/**
 * Sirve del caché con revalidación en segundo plano.
 *
 * - Si está fresco, se devuelve tal cual.
 * - Si está vencido pero hay datos, se devuelven los viejos AL INSTANTE y la
 *   recarga sigue de fondo: ningún visitante espera el refetch.
 * - Sólo se espera cuando no hay absolutamente nada que mostrar.
 * - Una sola recarga en vuelo a la vez (single-flight): si entran veinte
 *   requests juntos, no disparan veinte paginaciones completas.
 */
async function servirConRevalidacion(
  entrada: EntradaCache,
  ttlMs: number,
  cargar: () => Promise<any>
): Promise<any> {
  if (entrada.datos && Date.now() - entrada.obtenidoEn < ttlMs) {
    return entrada.datos;
  }

  const enCurso = iniciarCarga(entrada, cargar);

  if (entrada.datos) {
    // El error de una revalidación de fondo no debe tumbar la request que ya
    // tiene datos válidos para mostrar; queda logueado en el cargador.
    enCurso.catch(() => {});
    return entrada.datos;
  }

  return enCurso;
}

async function cargarCatalogoPublico() {
  const { databases } = createAdminClient();

  // Las tres colecciones en paralelo: antes se encadenaban una tras otra.
  const [productos, categorias, puntos] = await Promise.all([
    traerColeccionCompleta(databases, 'products', [
      Query.notEqual('estado', 'borrador'),
      Query.orderDesc('$createdAt')
    ]),
    traerColeccionCompleta(databases, 'categories', [Query.orderAsc('$createdAt')]),
    traerColeccionCompleta(databases, 'pickup_points', [Query.orderAsc('$createdAt')])
  ]);

  // Un producto sin precio no se puede vender, y mostrarlo igual es peor que
  // no listarlo: aparecía en la vitrina como "$ 0" —primero de todo al ordenar
  // por precio ascendente— y, si además tenía stock, se podía agregar al
  // carrito y comprar a cero. El botón sólo se deshabilitaba por falta de
  // stock. Se excluyen acá, junto con los borradores, y se deja registro para
  // que no sea una desaparición silenciosa.
  const activos = productos.filter((p: any) => p.estado === 'activo' || !p.estado);
  const vendibles = activos.filter((p: any) => precioDeVentaCentavos(p) > 0);
  const sinPrecio = activos.length - vendibles.length;
  if (sinPrecio > 0) {
    console.warn(
      `[Cache] ${sinPrecio} producto(s) activo(s) sin precio quedaron fuera de la vitrina. ` +
      'Cargales el precio en /admin/catalogo para que vuelvan a publicarse.'
    );
  }

  return {
    products: vendibles,
    categories: categorias,
    // Allowlist explícita: esto se serializa dentro del HTML, así que no puede
    // arrastrar CBU, condición fiscal, profile_id ni los tokens de Mercado Pago.
    pickupPoints: puntos
      .filter((p: any) => p.estado === 'activo' || !p.estado)
      .map((p: any) => ({
        $id: p.$id,
        nombre_comercial: p.nombre_comercial,
        direccion: p.direccion,
        localidad: p.localidad,
        provincia: p.provincia,
        horarios: p.horarios,
        lat: p.lat,
        lng: p.lng,
        slug: p.slug || '',
        telefono: p.telefono || ''
      })),
    degradado: false
  };
}

async function cargarCatalogoAdmin() {
  const { databases } = createAdminClient();

  // El admin sí necesita los borradores: /admin/catalogo cuenta y filtra por
  // estado. Por eso acá no se filtra como en el catálogo público.
  const [productos, categorias] = await Promise.all([
    traerColeccionCompleta(databases, 'products', [Query.orderDesc('$createdAt')]),
    traerColeccionCompleta(databases, 'categories', [Query.orderAsc('$createdAt')])
  ]);

  return { products: productos, categories: categorias };
}

export const getCachedCatalog = async () => {
  const entrada = obtenerEntrada('__urbanpointCache');
  try {
    return await servirConRevalidacion(entrada, TTL_PUBLICO_MS, cargarCatalogoPublico);
  } catch (err: any) {
    // Distinguir "no hay catálogo" de "no pudimos cargarlo": si no, un fallo de
    // backend se ve igual que una tienda vacía y el cliente no se entera.
    console.error('[Cache] Error cargando el catálogo público:', err?.message || err);
    return { products: [], categories: [], pickupPoints: [], degradado: true };
  }
};

export const getAdminCachedCatalog = async () => {
  const entrada = obtenerEntrada('__urbanpointAdminCache');
  try {
    return await servirConRevalidacion(entrada, TTL_ADMIN_MS, cargarCatalogoAdmin);
  } catch (err: any) {
    console.error('[AdminCache] Error cargando el catálogo de admin:', err?.message || err);
    return { products: [], categories: [] };
  }
};

export const invalidateCatalogCache = () => {
  const cargadores: Array<[string, () => Promise<any>]> = [
    ['__urbanpointCache', cargarCatalogoPublico],
    ['__urbanpointAdminCache', cargarCatalogoAdmin]
  ];

  for (const [clave, cargar] of cargadores) {
    const entrada = obtenerEntrada(clave);
    entrada.datos = null;
    entrada.obtenidoEn = 0;

    // Se arranca la recarga YA, sin esperarla. Invalidar y nada más dejaba al
    // siguiente que abriera el panel pagando la paginación entera; así, cuando
    // el admin vuelve al listado después de guardar, el refetch ya viene en
    // curso y su request se engancha al mismo vuelo en vez de iniciar otro.
    iniciarCarga(entrada, cargar).catch((err: any) => {
      console.error('[Cache] Falló la recarga tras invalidar:', err?.message || err);
    });
  }
};
