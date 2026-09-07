/**
 * Agrega los campos para "cobro directo del canillita": cuando un nodo tiene
 * su propia cuenta de Mercado Pago conectada, el cliente le paga a ESA
 * cuenta (no a la de la tienda) el precio público de siempre, y el
 * canillita pasa a deberle a la tienda el precio canillita de lo vendido —
 * ver la nota "Cobro Directo del Canillita" para la explicación completa.
 *
 * - orders.cobro_directo_canillita (boolean): marca con qué cuenta se cobró
 *   este pedido. La escribe createCheckout al momento de armar la
 *   preferencia de pago; resolverComisiones la lee para decidir si le
 *   devenga una comisión al canillita (como siempre) o le registra una
 *   deuda (cobro directo).
 * - order_items.costo_canillita_unitario (integer, centavos): foto del
 *   precio_canillita de cada producto en el momento de la venta — igual que
 *   precio_unitario ya es una foto del precio público. Sin esto, calcular la
 *   deuda más adelante leería el precio_canillita ACTUAL del producto, que
 *   puede haber cambiado desde la venta.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/add_cobro_directo_canillita.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/add_cobro_directo_canillita.ts --apply
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
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function addAttribute(fn: () => Promise<any>, description: string) {
	try {
		await fn();
		console.log(`✅ Atributo agregado: ${description}`);
	} catch (error: any) {
		if (error?.code === 409 || error?.message?.includes('already exists')) {
			console.log(`ℹ️ Atributo ya existente: ${description}`);
		} else {
			console.error(`❌ Error al agregar ${description}:`, error.message || error);
		}
	}
}

async function main() {
	console.log(`Base ${DB_ID} · ${aplicar ? 'APLICAR' : 'simulación'}\n`);

	const plan = [
		"orders.cobro_directo_canillita  boolean  default false",
		"order_items.costo_canillita_unitario  integer (centavos)  opcional"
	];
	for (const paso of plan) console.log('  · ' + paso);

	if (!aplicar) {
		console.log('\nSimulación: no se creó nada. Volvé a correrlo con --apply.');
		return;
	}

	console.log('\nCreando...');
	await addAttribute(
		() => db.createBooleanAttribute(DB_ID, 'orders', 'cobro_directo_canillita', false, false),
		'orders.cobro_directo_canillita'
	);
	await esperar(400);
	await addAttribute(
		() => db.createIntegerAttribute(DB_ID, 'order_items', 'costo_canillita_unitario', false, 0, 999999999),
		'order_items.costo_canillita_unitario'
	);

	console.log('\nListo.');
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
