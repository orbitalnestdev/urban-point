/**
 * Agrega a `orders` los campos de contacto de compras sin cuenta (invitado):
 * guest_name, guest_phone, guest_email.
 *
 * Hasta ahora un pedido de invitado no guardaba ningún dato de contacto —
 * el canillita recibía el aviso de "Nuevo Pedido" sin poder identificar ni
 * comunicarse con quien compró. `guest_name`/`guest_email` ya los esperaba
 * el código de notificación (mailer.ts, el webhook de MP) desde antes, pero
 * nunca se escribían ni existían como atributo: quedaban en `undefined`
 * silenciosamente. `guest_phone` es nuevo.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/add_guest_contact_fields.ts
 */
import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en las variables de entorno.');
	process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'orders';

async function addAttribute(fn: () => Promise<any>, description: string): Promise<boolean> {
	try {
		await fn();
		console.log(`✅ Atributo agregado: ${description}`);
		return true;
	} catch (error: any) {
		if (error?.code === 409 || error?.message?.includes('already exists')) {
			console.log(`ℹ️ Atributo ya existente: ${description}`);
			return true;
		}
		console.error(`❌ Error al agregar ${description}:`, error.message || error);
		return false;
	}
}

async function run() {
	console.log('🛠️ Agregando campos de contacto de invitado a orders...');

	const resultados = await Promise.all([
		addAttribute(() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_name', 255, false), 'guest_name'),
		addAttribute(() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_phone', 50, false), 'guest_phone'),
		addAttribute(() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_email', 255, false), 'guest_email')
	]);

	// "Listo" incondicional hacía pensar que había terminado bien aunque los
	// tres agregados hubieran fallado (ej: API key inválida) — el único rastro
	// del fallo real quedaba arriba, entre los ✅ de otras corridas previas.
	if (resultados.every(Boolean)) {
		console.log('✨ Listo: los 3 atributos están creados (o ya existían).');
	} else {
		console.error('⚠️ Terminó con errores: no todos los atributos se crearon. Revisá los ❌ de arriba.');
		process.exit(1);
	}
}

run().catch(console.error);
