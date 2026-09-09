/**
 * Crea la colección `collection_banners`: banners de colecciones/marcas
 * que la clienta administra desde /admin/banners para mostrarlos en la
 * home (grilla o carrusel, según settings.banners_display_mode).
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_collection_banners.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_collection_banners.ts --apply
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
const COL = 'collection_banners';

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
		'crear colección collection_banners (sin permisos públicos: sólo la API key del servidor)',
		'nombre       string(255)   requerido',
		'imagen_url   string(1000)  opcional',
		'link_url     string(1000)  opcional',
		'orden        integer       opcional, default 0',
		'activo       boolean       opcional, default true'
	];
	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	await db.createCollection(DB_ID, COL, 'Collection Banners', []);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'nombre', 255, true);
	await db.createStringAttribute(DB_ID, COL, 'imagen_url', 1000, false);
	await db.createStringAttribute(DB_ID, COL, 'link_url', 1000, false);
	await db.createIntegerAttribute(DB_ID, COL, 'orden', false, undefined, undefined, 0);
	await db.createBooleanAttribute(DB_ID, COL, 'activo', false, true);
	await esperar(400);

	console.log(`\nColección ${COL} creada.`);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
