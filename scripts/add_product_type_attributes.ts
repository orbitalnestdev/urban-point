/**
 * Agrega a `products` los atributos del tipo de producto y del agrupado.
 *
 * Por qué hace falta:
 *
 * - `grupo` es lo que junta las variantes bajo una sola tarjeta en la vitrina
 *   (ver src/lib/variantes.ts). El importador de CSV lo escribe desde hace
 *   rato y el panel ahora también, pero NINGÚN script lo creaba: como todas
 *   las escrituras pasan por escribirDocumentoTolerante, que ante un atributo
 *   desconocido lo saca del payload y reintenta, el campo se venía
 *   descartando en silencio. El agrupado funcionaba sólo por deducción del
 *   nombre (cortando lo que va después del último " - ").
 *
 * - `tipo` distingue simple / variantes / combo. Se recibía en createProduct y
 *   se descartaba, así que el editor lo leía de `?tipo=` en la URL y al volver
 *   desde el listado se perdía.
 *
 * - `combo_items` guarda los productos que integran un combo, como JSON
 *   [{ product_id, cantidad }].
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/add_product_type_attributes.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/add_product_type_attributes.ts --apply
 *
 * Es idempotente: los atributos que ya existen no se tocan.
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
	console.error('Pasá --dry-run para ver qué haría, o --apply para crearlos.');
	process.exit(1);
}

const DB_ID = 'urbanpoint';
const COL = 'products';

const db = new Databases(
	new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Atributos actuales de la colección, por key. */
async function existentes(): Promise<Set<string>> {
	const res: any = await db.listAttributes(DB_ID, COL);
	return new Set((res.attributes || []).map((a: any) => a.key));
}

async function main() {
	console.log(`Base ${DB_ID} · colección ${COL} · ${aplicar ? 'APLICAR' : 'simulación'}\n`);

	const yaEstan = await existentes();

	const plan: Array<{ key: string; desc: string; crear: () => Promise<unknown> }> = [
		{
			key: 'grupo',
			desc: 'string(255) — junta las variantes bajo una tarjeta en la vitrina',
			crear: () => db.createStringAttribute(DB_ID, COL, 'grupo', 255, false)
		},
		{
			key: 'tipo',
			desc: "enum(simple|variantes|combo) — por defecto 'simple'",
			crear: () => db.createEnumAttribute(DB_ID, COL, 'tipo', ['simple', 'variantes', 'combo'], false, 'simple')
		},
		{
			key: 'combo_items',
			desc: 'string(5000) — JSON [{ product_id, cantidad }] de los integrantes',
			crear: () => db.createStringAttribute(DB_ID, COL, 'combo_items', 5000, false)
		}
	];

	const faltan = plan.filter((a) => !yaEstan.has(a.key));

	for (const a of plan) {
		const marca = yaEstan.has(a.key) ? 'ya existe' : 'FALTA';
		console.log(`  [${marca.padEnd(9)}] ${a.key.padEnd(12)} ${a.desc}`);
	}

	if (faltan.length === 0) {
		console.log('\nNo hay nada que crear.');
		return;
	}

	if (!aplicar) {
		console.log(`\nSimulación: faltan ${faltan.length}. Volvé a correrlo con --apply.`);
		return;
	}

	console.log('\nCreando...');
	for (const a of faltan) {
		await a.crear();
		console.log(`  · ${a.key} creado`);
		// Appwrite los crea de forma asíncrona; conviene espaciarlos.
		await esperar(600);
	}

	console.log(
		'\nListo. Los productos existentes quedan con los campos vacíos: el grupo se ' +
		'sigue deduciendo del nombre hasta que se cargue uno explícito.'
	);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
