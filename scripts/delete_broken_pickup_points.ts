/**
 * Borra puntos de retiro puntuales por $id, previa verificación de que no
 * tengan pedidos ni códigos de referido asociados (ver
 * scripts/check_orders_for_pickup.ts). Uso puntual, no un script recurrente.
 *
 * Uso:
 *   npx tsx scripts/delete_broken_pickup_points.ts <id1> <id2> ...
 */
import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const ids = process.argv.slice(2);
if (ids.length === 0) {
	console.error('Pasá al menos un $id de pickup_points como argumento.');
	process.exit(1);
}

async function main() {
	for (const id of ids) {
		try {
			const punto = await db.getDocument('urbanpoint', 'pickup_points', id);
			await db.deleteDocument('urbanpoint', 'pickup_points', id);
			console.log(`✅ Eliminado: [${id}] "${punto.nombre_comercial}"`);
		} catch (e: any) {
			console.error(`❌ No se pudo eliminar ${id}: ${e?.message || e}`);
		}
	}
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
