import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { Query } from 'node-appwrite';

export const prerender = false;

/**
 * Campos que se pueden publicar de un punto de retiro.
 *
 * Allowlist explícita: `pickup_points` guarda CBU, condición fiscal y
 * `profile_id` (la clave que enlaza con commission_ledger y payouts).
 * Nada de eso puede salir al cliente.
 */
const publicar = (p: Record<string, any>) => ({
	$id: p.$id,
	nombre_comercial: p.nombre_comercial,
	direccion: p.direccion,
	localidad: p.localidad,
	provincia: p.provincia,
	horarios: p.horarios,
	slug: p.slug,
	lat: p.lat,
	lng: p.lng
});

export const GET: APIRoute = async ({ url }) => {
	const { databases } = createAdminClient();
	const id = url.searchParams.get('id');

	try {
		// Consulta de un punto puntual (la usa /checkout/pago para mostrar el
		// punto elegido sin exponer la colección al SDK del navegador).
		if (id) {
			const doc = await databases.getDocument('urbanpoint', 'pickup_points', id);
			if (doc.estado !== 'activo') {
				return json({ error: 'Punto de retiro no disponible' }, 404);
			}
			return json(publicar(doc));
		}

		const pickupRes = await databases.listDocuments('urbanpoint', 'pickup_points', [
			Query.equal('estado', 'activo'),
			Query.limit(500)
		]);
		return json(pickupRes.documents.map(publicar));
	} catch (error) {
		if (id) {
			return json({ error: 'Punto de retiro no encontrado' }, 404);
		}
		// Un fallo de backend no puede parecerse a "no hay puntos": eso enmascara
		// incidentes y deja al checkout mostrando una lista vacía como si fuera normal.
		console.error('GET /api/pickup-points falló:', error);
		return json({ error: 'No se pudieron obtener los puntos de retiro' }, 503);
	}
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
