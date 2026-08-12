import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { Query } from 'node-appwrite';

export const prerender = false;

/**
 * Catálogo completo para la exportación a CSV del admin. [M-08]
 *
 * El botón "Exportar" de /admin/catalogo ya llamaba a esta ruta, pero el
 * endpoint no existía: el fetch fallaba y caía a un alert('Exportando
 * productos...') seguido de un reload. Nunca exportó nada.
 */
export const GET: APIRoute = async ({ locals }) => {
	const user = locals.user;
	if (!user || (user.role !== 'admin' && user.role !== 'gestion')) {
		// El middleware sólo protege /admin y /canillita: las rutas de /api
		// tienen que verificar por su cuenta.
		return new Response(JSON.stringify({ error: 'No autorizado' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const { databases } = createAdminClient();
		const productos: any[] = [];
		let offset = 0;

		// Paginado: sin esto Appwrite devuelve sólo los primeros 25 y la
		// exportación saldría truncada en silencio.
		while (true) {
			const res = await databases.listDocuments('urbanpoint', 'products', [
				Query.limit(100),
				Query.offset(offset),
				Query.orderDesc('$createdAt')
			]);
			productos.push(...res.documents);
			if (res.documents.length < 100) break;
			offset += 100;
		}

		return new Response(JSON.stringify(productos), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('GET /api/products-raw.json falló:', error);
		return new Response(JSON.stringify({ error: 'No se pudo exportar el catálogo' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
