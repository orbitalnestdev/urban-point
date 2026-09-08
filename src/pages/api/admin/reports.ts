import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/server/appwrite';
import { requireRole } from '../../../lib/server/auth';
import { generateCsvString } from '../../../lib/exports';
import { Query } from 'node-appwrite';

export const prerender = false;

const TIPOS_VALIDOS = ['ventas', 'comisiones', 'liquidaciones', 'inventario'] as const;
type TipoReporte = (typeof TIPOS_VALIDOS)[number];

/** La relación puede venir como string plano o como documento expandido. */
const relId = (rel: any): string =>
	typeof rel === 'string' ? rel : rel?.$id || '';

/**
 * Trae TODOS los documentos que matchean, paginando con cursor. El
 * `Query.limit(5000)` fijo que tenía cada reporte antes truncaba en
 * silencio cualquier rango con más filas que eso — para un reporte que se
 * usa para conciliar plata, un CSV incompleto sin avisar es peor que uno
 * que tarda un poco más en generarse.
 */
async function fetchAllDocuments(databases: any, collection: string, queries: any[]) {
	const out: any[] = [];
	let cursor: string | null = null;
	while (true) {
		const q = [...queries, Query.limit(500)];
		if (cursor) q.push(Query.cursorAfter(cursor));
		const page = await databases.listDocuments('urbanpoint', collection, q);
		out.push(...page.documents);
		if (page.documents.length < 500) break;
		cursor = page.documents[page.documents.length - 1].$id;
	}
	return out;
}

/**
 * GET /api/admin/reports?type=ventas|comisiones|liquidaciones|inventario
 *
 * Genera los CSV del Centro de Reportes. Los cuatro botones del panel
 * apuntaban a /api/products-raw.json, que devuelve JSON de productos: el
 * "reporte de ventas" descargaba el catálogo. Acá cada dataset sale de su
 * colección real, con rango de fechas opcional (`desde`/`hasta`, ISO;
 * default últimos 30 días).
 */
export const GET: APIRoute = async ({ locals, url }) => {
	// requireRole tira si no hay sesión o el rol no alcanza: la página protege
	// la UI pero el endpoint tiene que verificar por su cuenta.
	try {
		requireRole({ locals }, 'admin', 'gestion');
	} catch {
		return new Response(JSON.stringify({ error: 'No autorizado' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const type = (url.searchParams.get('type') || '') as TipoReporte;
	if (!TIPOS_VALIDOS.includes(type)) {
		return new Response(
			JSON.stringify({ error: `Tipo de reporte inválido. Usá: ${TIPOS_VALIDOS.join(', ')}` }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// Rango de fechas: default últimos 30 días. Un valor inválido se ignora en
	// favor del default para no romper la descarga.
	//
	// El <input type="date"> del panel manda "YYYY-MM-DD" sin hora. Pasarlo
	// directo a `new Date(v)` lo interpreta como medianoche UTC, no medianoche
	// en Argentina (UTC-3, sin horario de verano desde 2009) — con eso, pedir
	// un solo día como "desde" y "hasta" caía en el mismo instante UTC y el
	// reporte salía vacío; en general, todo el día "hasta" quedaba afuera.
	const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;
	const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/;

	const parseInicioArg = (v: string | null): Date | null => {
		if (!v) return null;
		const m = soloFecha.exec(v);
		if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + ARG_OFFSET_MS);
		const d = new Date(v);
		return isNaN(d.getTime()) ? null : d;
	};
	const parseFinArg = (v: string | null): Date | null => {
		if (!v) return null;
		const m = soloFecha.exec(v);
		if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + ARG_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);
		const d = new Date(v);
		return isNaN(d.getTime()) ? null : d;
	};

	const hasta = parseFinArg(url.searchParams.get('hasta')) || new Date();
	const desde = parseInicioArg(url.searchParams.get('desde')) ||
		new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);

	// El inventario es una foto del stock actual: filtrarlo por fecha de alta
	// del producto no tiene sentido.
	const dateQueries = type === 'inventario' ? [] : [
		Query.greaterThanEqual('$createdAt', desde.toISOString()),
		Query.lessThanEqual('$createdAt', hasta.toISOString())
	];

	// Columnas fijas por tipo: sin esto, un rango sin resultados generaba un
	// CSV de 0 bytes (sólo el BOM), indistinguible de un archivo roto.
	const HEADERS_BY_TYPE: Record<TipoReporte, string[]> = {
		ventas: ['numero', 'fecha', 'estado', 'fulfillment', 'subtotal', 'costo_envio', 'total'],
		comisiones: ['fecha', 'tipo', 'estado', 'monto', 'motivo', 'profile_id', 'order_id'],
		liquidaciones: ['fecha', 'profile_id', 'monto', 'medio_pago', 'referencia'],
		inventario: ['sku', 'nombre', 'estado', 'stock', 'precio', 'costo']
	};

	try {
		const { databases } = createAdminClient();
		let rows: Array<Record<string, any>> = [];

		if (type === 'ventas') {
			const docs = await fetchAllDocuments(databases, 'orders', [
				...dateQueries,
				Query.orderDesc('$createdAt')
			]);
			rows = docs.map((o: any) => ({
				numero: o.numero || o.$id,
				fecha: o.$createdAt,
				estado: o.estado || '',
				fulfillment: o.fulfillment || '',
				subtotal: (o.subtotal || 0) / 100,
				costo_envio: (o.costo_envio || 0) / 100,
				total: (o.total || 0) / 100
			}));
		} else if (type === 'comisiones') {
			const docs = await fetchAllDocuments(databases, 'commission_ledger', [
				...dateQueries,
				Query.orderDesc('$createdAt')
			]);
			rows = docs.map((l: any) => ({
				fecha: l.$createdAt,
				tipo: l.tipo || '',
				estado: l.estado || '',
				monto: (l.monto_centavos || 0) / 100,
				motivo: l.motivo || '',
				// Sin esto no se podía saber a qué canillita corresponde cada
				// fila — el reporte de liquidaciones sí lo trae (ver abajo).
				profile_id: relId(l.profile_id),
				order_id: relId(l.order_id)
			}));
		} else if (type === 'liquidaciones') {
			const docs = await fetchAllDocuments(databases, 'payouts', [
				...dateQueries,
				Query.orderDesc('$createdAt')
			]);
			rows = docs.map((p: any) => ({
				fecha: p.$createdAt,
				profile_id: relId(p.profile_id),
				monto: (p.monto_centavos || 0) / 100,
				medio_pago: p.medio_pago || '',
				referencia: p.referencia_pago || p.idempotency_key || ''
			}));
		} else {
			const docs = await fetchAllDocuments(databases, 'products', [
				Query.orderDesc('$createdAt')
			]);
			rows = docs.map((p: any) => ({
				sku: p.sku || '',
				nombre: p.nombre || '',
				estado: p.estado || '',
				stock: p.stock || 0,
				precio: (p.precio || 0) / 100,
				costo: (p.costo || 0) / 100
			}));
		}

		const csv = generateCsvString(rows, HEADERS_BY_TYPE[type]);
		const fechaStr = new Date().toISOString().slice(0, 10);
		const filename = `reporte_${type}_urbanpoint_${fechaStr}.csv`;

		// El BOM inicial hace que Excel abra el archivo como UTF-8 y no rompa
		// los acentos.
		return new Response('\uFEFF' + csv, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		console.error(`GET /api/admin/reports?type=${type} falló:`, error);
		return new Response(JSON.stringify({ error: 'No se pudo generar el reporte' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
