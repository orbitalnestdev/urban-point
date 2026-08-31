import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { Query } from 'node-appwrite';

export const prerender = false;

/**
 * Catálogo completo y mapa de categorías para la exportación a CSV del admin.
 */
export const GET: APIRoute = async ({ locals }) => {
	const user = locals.user;
	const role = user?.role;

	if (!user || (role !== 'admin' && role !== 'gestion')) {
		return new Response(JSON.stringify({ error: 'No autorizado' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const { databases } = createAdminClient();
		const productos: any[] = [];
		let offset = 0;

		// Paginado de productos
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

		// Categorías
		const categoryMap: Record<string, string> = {};
		try {
			const catRes = await databases.listDocuments('urbanpoint', 'categories', [Query.limit(100)]);
			catRes.documents.forEach((cat: any) => {
				categoryMap[cat.$id] = cat.nombre || '';
			});
		} catch (e) {
			console.warn('No se pudieron listar las categorías para la exportación:', e);
		}

		return new Response(JSON.stringify({ products: productos, categoryMap }), {
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
