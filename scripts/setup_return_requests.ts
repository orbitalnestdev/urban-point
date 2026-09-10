/**
 * Crea la colección `return_requests`: las solicitudes de devolución.
 *
 * Por qué una colección aparte y no un estado más del pedido:
 *
 * El pedido ya tiene su máquina de estados (src/lib/orderStates.ts) y
 * `reembolsado` es terminal. Una devolución es un trámite con vida propia —se
 * pide, se evalúa, se aprueba o se rechaza— que puede terminar SIN mover el
 * pedido (un cambio por talle) o moviéndolo (un reintegro). Meterla como
 * estado obligaría a inventar transiciones para cada combinación y perdería el
 * motivo, la fecha del pedido y quién resolvió.
 *
 * `motivo` no es decorativo: define qué resolución corresponde por ley (ver
 * src/pages/cambios-y-devoluciones.astro). En un arrepentimiento —10 días
 * corridos, sin causa— la Ley 24.240 obliga a devolver el dinero al mismo
 * medio de pago; el saldo a favor sólo vale si el cliente lo acepta. Por eso
 * se guardan los dos datos por separado: el motivo que declaró el cliente y la
 * resolución que eligió la administración.
 *
 * `monto_centavos` nace con el total del pedido y la administración puede
 * bajarlo al resolver: así una devolución parcial (uno de tres productos) se
 * resuelve sin construir una UI de selección de ítems.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_return_requests.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_return_requests.ts --apply
 *
 * Es idempotente: si la colección ya existe, no toca nada.
 */
import { Client, Databases, IndexType } from 'node-appwrite';
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
const COL = 'return_requests';

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
		'crear colección return_requests (sin permisos públicos: la app usa la API key del servidor)',
		'order_id        string(36)   requerido   — pedido que se devuelve',
		'profile_id      string(36)   requerido   — cliente que la pide',
		'motivo          enum         requerido   — arrepentimiento | garantia | cambio_preferencia',
		'detalle         string(1000) opcional    — lo que contó el cliente',
		'estado          enum         requerido   — solicitada | aprobada | rechazada',
		'resolucion      enum         opcional    — reintegro | saldo_a_favor',
		'monto_centavos  integer      requerido   — total del pedido; se puede bajar al resolver',
		'dentro_de_plazo boolean      requerido   — si entró dentro de los 10 días corridos',
		'solicitado_at   datetime     requerido',
		'resuelto_at     datetime     opcional',
		'resuelto_por    string(36)   opcional    — profileId de quien resolvió',
		'nota_admin      string(500)  opcional',
		'índice por estado, por profile_id y por order_id'
	];

	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	// Sin permisos: ningún cliente accede directo, todo pasa por el servidor.
	// Mismo criterio que scripts/secure_perms.ts.
	await db.createCollection(DB_ID, COL, 'Return Requests', []);

	await db.createStringAttribute(DB_ID, COL, 'order_id', 36, true);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'profile_id', 36, true);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'motivo', ['arrepentimiento', 'garantia', 'cambio_preferencia'], true);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'detalle', 1000, false);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'estado', ['solicitada', 'aprobada', 'rechazada'], true);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'resolucion', ['reintegro', 'saldo_a_favor'], false);
	await esperar(400);
	await db.createIntegerAttribute(DB_ID, COL, 'monto_centavos', true, 0, 999999999);
	await esperar(400);
	await db.createBooleanAttribute(DB_ID, COL, 'dentro_de_plazo', true);
	await esperar(400);
	await db.createDatetimeAttribute(DB_ID, COL, 'solicitado_at', true);
	await esperar(400);
	await db.createDatetimeAttribute(DB_ID, COL, 'resuelto_at', false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'resuelto_por', 36, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'nota_admin', 500, false);

	// Los índices necesitan que los atributos estén disponibles.
	await esperar(2500);
	try {
		await db.createIndex(DB_ID, COL, 'idx_estado', IndexType.Key, ['estado']);
		await esperar(600);
		await db.createIndex(DB_ID, COL, 'idx_profile', IndexType.Key, ['profile_id']);
		await esperar(600);
		await db.createIndex(DB_ID, COL, 'idx_order', IndexType.Key, ['order_id']);
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
