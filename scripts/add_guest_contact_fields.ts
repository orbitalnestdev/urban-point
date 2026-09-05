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

async function run() {
	console.log('🛠️ Agregando campos de contacto de invitado a orders...');

	await addAttribute(
		() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_name', 255, false),
		'guest_name'
	);
	await addAttribute(
		() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_phone', 50, false),
		'guest_phone'
	);
	await addAttribute(
		() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'guest_email', 255, false),
		'guest_email'
	);

	console.log('✨ Listo.');
}

run().catch(console.error);
