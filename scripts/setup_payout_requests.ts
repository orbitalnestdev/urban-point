/**
 * Crea la colección `payout_requests`: las solicitudes de cobro del canillita.
 *
 * Por qué una colección aparte y no un estado más en `payouts`:
 *
 * En este modelo un documento de `payouts` significa "ya se pagó". Se crea
 * recién cuando el admin liquida, y crearlo marca los devengos del
 * commission_ledger como `liquidado`. Los seis lugares que leen `payouts`
 * —el panel del canillita, su historial de liquidaciones, el panel de admin y
 * el CSV de /api/admin/reports— asumen eso y ninguno filtra por estado; dos
 * de ellos ordenan por `pagado_at`, que una solicitud no tiene.
 *
 * Meter ahí filas "solicitadas" le ensuciaría al canillita su propio historial
 * de cobros y le inflaría al admin el total liquidado. La solicitud es otra
 * cosa que el pago, y vive en su propia colección.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_payout_requests.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_payout_requests.ts --apply
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
const COL = 'payout_requests';

const db = new Databases(
	new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

/** Appwrite crea los atributos de forma asíncrona; conviene espaciarlos. */
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
		'crear colección payout_requests (sin permisos públicos: la app usa la API key del servidor)',
		'profile_id      string(36)   requerido   — canillita que solicita',
		'monto_centavos  integer      requerido   — saldo pendiente al momento de pedir',
		'estado          enum         requerido   — solicitada | aprobada | rechazada | pagada',
		'solicitado_at   datetime     requerido',
		'resuelto_at     datetime     opcional',
		'resuelto_por    string(36)   opcional    — profileId del admin que resolvió',
		'payout_id       string(36)   opcional    — pago que la cerró',
		'nota_canillita  string(500)  opcional',
		'nota_admin      string(500)  opcional',
		'índice por profile_id y por estado'
	];

	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	// Sin permisos: ningún cliente accede directo, todo pasa por el servidor.
	// Mismo criterio que scripts/secure_perms.ts.
	await db.createCollection(DB_ID, COL, 'Payout Requests', []);

	await db.createStringAttribute(DB_ID, COL, 'profile_id', 36, true);
	await esperar(400);
	await db.createIntegerAttribute(DB_ID, COL, 'monto_centavos', true, 0, 999999999);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'estado', ['solicitada', 'aprobada', 'rechazada', 'pagada'], true);
	await esperar(400);
	await db.createDatetimeAttribute(DB_ID, COL, 'solicitado_at', true);
	await esperar(400);
	await db.createDatetimeAttribute(DB_ID, COL, 'resuelto_at', false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'resuelto_por', 36, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'payout_id', 36, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'nota_canillita', 500, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'nota_admin', 500, false);

	// Los índices necesitan que los atributos estén disponibles.
	await esperar(2500);
	try {
		await db.createIndex(DB_ID, COL, 'idx_profile', 'key' as any, ['profile_id']);
		await esperar(600);
		await db.createIndex(DB_ID, COL, 'idx_estado', 'key' as any, ['estado']);
	} catch (e: any) {
		console.warn(
			'Los atributos todavía se estaban creando y falló el índice. ' +
			'Volvé a correr el script en un minuto: es idempotente.\n  ' + (e?.message || e)
		);
	}

	console.log(`\nColección ${COL} creada.`);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
