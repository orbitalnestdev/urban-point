/**
 * Crea la colección `credit_ledger`: el saldo a favor del cliente.
 *
 * Por qué un libro de movimientos y no un número en `profiles`:
 *
 * Primero, porque es plata: hace falta poder responder "¿de dónde salió este
 * saldo?" y un contador mutable no lo cuenta. Cada fila acá dice cuánto, por
 * qué, quién lo cargó y contra qué pedido o devolución.
 *
 * Segundo, porque el campo que parecía servir ya está ocupado y significa otra
 * cosa: `profiles.saldo_disponible_centavos` es el saldo de COMISIONES del
 * canillita, y `sincronizarSaldoPerfil` (src/actions/index.ts) lo recalcula
 * entero desde `commission_ledger` y lo pisa. Guardar el saldo a favor ahí lo
 * borraría solo en el primer movimiento de comisión.
 *
 * El saldo es la suma de `monto_centavos` de los movimientos que no estén
 * `liberado`. Positivo acredita (emisión, ajuste a favor), negativo consume
 * (reserva de un pedido).
 *
 * Los tres estados son el ciclo de vida de una reserva: se reserva al crear la
 * orden (`reservado`), y cuando el pago se resuelve pasa a `confirmado` (se
 * gastó) o a `liberado` (vuelve al saldo). Las emisiones nacen `confirmado`.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_credit_ledger.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/setup_credit_ledger.ts --apply
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
const COL = 'credit_ledger';

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
		'crear colección credit_ledger (sin permisos públicos: la app usa la API key del servidor)',
		'profile_id      string(36)   requerido   — cliente dueño del saldo',
		'monto_centavos  integer      requerido   — positivo acredita, NEGATIVO consume',
		'tipo            enum         requerido   — emision | reserva | ajuste',
		'estado          enum         requerido   — reservado | confirmado | liberado',
		'order_id        string(36)   opcional    — pedido que reservó el saldo',
		'return_id       string(36)   opcional    — devolución que lo originó',
		'motivo          string(500)  opcional',
		'creado_por      string(36)   opcional    — profileId del admin, si fue manual',
		'created_at      datetime     requerido',
		'índice por profile_id y por order_id'
	];

	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	// Sin permisos: ningún cliente accede directo, todo pasa por el servidor.
	// Mismo criterio que scripts/secure_perms.ts.
	await db.createCollection(DB_ID, COL, 'Credit Ledger', []);

	await db.createStringAttribute(DB_ID, COL, 'profile_id', 36, true);
	await esperar(400);
	// El mínimo es negativo a propósito: los consumos son montos negativos.
	await db.createIntegerAttribute(DB_ID, COL, 'monto_centavos', true, -999999999, 999999999);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'tipo', ['emision', 'reserva', 'ajuste'], true);
	await esperar(400);
	await db.createEnumAttribute(DB_ID, COL, 'estado', ['reservado', 'confirmado', 'liberado'], true);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'order_id', 36, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'return_id', 36, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'motivo', 500, false);
	await esperar(400);
	await db.createStringAttribute(DB_ID, COL, 'creado_por', 36, false);
	await esperar(400);
	await db.createDatetimeAttribute(DB_ID, COL, 'created_at', true);

	// Los índices necesitan que los atributos estén disponibles.
	await esperar(2500);
	try {
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
