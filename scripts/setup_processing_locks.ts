/**
 * Crea la colección `processing_locks`: reclamos de exclusión mutua para
 * operaciones que no pueden correr dos veces en paralelo (acreditar una
 * orden, liquidar un saldo, abrir una solicitud de cobro). Ver
 * src/lib/server/locks.ts para el porqué (Appwrite no tiene transacciones
 * ni upsert condicional, pero sí IDs de documento únicos).
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_processing_locks.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_processing_locks.ts --apply
 *
 * Es idempotente: si la colección ya existe, no toca nada.
 */
import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const aplicar = process.argv.includes('--apply');
if (!aplicar && !process.argv.includes('--dry-run')) {
	console.error('Pasá --dry-run para ver qué haría, o --apply para crearla.');
	process.exit(1);
}

const DB_ID = 'urbanpoint';
const COL = 'processing_locks';

const db = new Databases(
	new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
	console.log(`Base ${DB_ID} · colección ${COL} · ${aplicar ? 'APLICAR' : 'simulación'}\n`);

	try {
		await db.getCollection(DB_ID, COL);
		console.log(`La colección ${COL} ya existe: no se toca nada.`);
		return;
	} catch (e: any) {
		if (e.code !== 404) throw e;
	}

	const plan = [
		'crear colección processing_locks (sin permisos públicos: sólo la API key del servidor)',
		'motivo   string(255)   opcional   — sólo para poder mirar qué hay reclamado, no se usa en la lógica',
		'sin índices: la exclusión la da el propio $id del documento, no un atributo'
	];
	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	await db.createCollection(DB_ID, COL, 'Processing Locks', []);
	await db.createStringAttribute(DB_ID, COL, 'motivo', 255, false);
	await esperar(400);

	console.log(`\nColección ${COL} creada.`);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
