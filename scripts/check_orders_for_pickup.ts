/**
 * Auditoría de solo lectura: ¿hay pedidos u otros documentos que referencien
 * alguno de estos pickup_points? Se usa antes de decidir si borrarlos es
 * seguro.
 *
 * Uso:
 *   npx tsx scripts/check_orders_for_pickup.ts <id1> <id2> ...
 */
import { Client, Databases, Query } from 'node-appwrite';
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
		console.log(`\n🔎 Punto ${id}:`);

		const ordenes = await db.listDocuments('urbanpoint', 'orders', [
			Query.equal('origin_node_id', id),
			Query.limit(5)
		]).catch((e) => { console.log('  (orders: ' + e.message + ')'); return { total: 0, documents: [] }; });
		console.log(`  Pedidos con origin_node_id = este punto: ${ordenes.total}`);

		const referidos = await db.listDocuments('urbanpoint', 'referral_codes', [
			Query.limit(200)
		]).catch(() => ({ total: 0, documents: [] as any[] }));
		const propios = referidos.documents.filter((r: any) => {
			const owner = typeof r.owner_id === 'string' ? r.owner_id : r.owner_id?.$id;
			return owner === id;
		});
		console.log(`  Códigos de referido cuyo owner_id es este punto: ${propios.length}`);

		const punto = await db.getDocument('urbanpoint', 'pickup_points', id).catch(() => null);
		console.log(`  profile_id vinculado: ${punto?.profile_id ? JSON.stringify(punto.profile_id) : '(ninguno)'}`);
	}
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
