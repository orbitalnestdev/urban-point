/**
 * Cierra los permisos públicos de las colecciones de Appwrite. [C-01]
 *
 * Reemplaza a scripts/fix_perms.ts, que había abierto read(any) sobre siete
 * colecciones —incluidas orders, payouts, commission_ledger y pickup_points—
 * dejando expuestos a internet domicilios de clientes, códigos de retiro, el
 * libro de comisiones y los CBU de los canillitas.
 *
 * Criterio: la app SSR usa siempre la API key de servidor, así que ninguna
 * colección necesita permisos públicos para que el sitio funcione. El catálogo
 * se sirve igual desde el servidor. Se cierra todo.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/secure_perms.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/secure_perms.ts --apply
 */
import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const DB_ID = 'urbanpoint';

/** Toda colección que hoy tiene permisos públicos y no debería tenerlos. */
const COLECCIONES = [
	'products',
	'categories',
	'pickup_points',
	'orders',
	'commission_ledger',
	'payouts',
	'order_items',
	'profiles',
	'canillita_applications',
	'referral_codes',
	'commission_rules',
	'settings',
	'order_events'
];

const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const apply = process.argv.includes('--apply');
const dryRun = !apply;

async function main() {
	console.log(dryRun ? '=== DRY RUN (no escribe nada) ===\n' : '=== APLICANDO CAMBIOS ===\n');

	let cambios = 0;

	for (const colId of COLECCIONES) {
		try {
			const col = await db.getCollection(DB_ID, colId);
			const permisosActuales = (col as any).$permissions ?? [];

			if (permisosActuales.length === 0) {
				console.log(`  ok      ${colId.padEnd(24)} ya está cerrada`);
				continue;
			}

			console.log(`  CERRAR  ${colId.padEnd(24)} ${JSON.stringify(permisosActuales)}`);
			cambios++;

			if (apply) {
				// El 3er argumento es el NOMBRE de la colección: hay que preservarlo.
				// fix_perms.ts pasaba el id acá y renombraba las colecciones sin querer.
				await db.updateCollection(
					DB_ID,
					colId,
					col.name,
					[], // sin permisos públicos: solo la API key de servidor
					(col as any).documentSecurity ?? false,
					(col as any).enabled ?? true
				);
				console.log(`          -> cerrada`);
			}
		} catch (e: any) {
			console.error(`  ERROR   ${colId.padEnd(24)} ${e.message}`);
		}
	}

	console.log(`\n${cambios} colección(es) con permisos públicos.`);
	if (dryRun && cambios > 0) {
		console.log('Volvé a correr con --apply para cerrarlas.');
	}
}

main();
