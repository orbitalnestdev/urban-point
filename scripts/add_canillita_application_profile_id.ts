/**
 * Agrega a `canillita_applications` el campo `profile_id`: el backlink al
 * profile/pickup_point creados en approveCanillita.
 *
 * Sin esto, suspendCanillita —que sólo recibe el applicationId desde el
 * botón "Suspender Canillita"— no tenía forma de encontrar el punto de
 * retiro real para desactivarlo: el punto seguía "activo" pese al mensaje
 * de éxito.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/add_canillita_application_profile_id.ts
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
const COLLECTION_ID = 'canillita_applications';

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
	console.log('🛠️ Agregando profile_id a canillita_applications...');

	const ok = await addAttribute(
		() => db.createStringAttribute(DB_ID, COLLECTION_ID, 'profile_id', 255, false),
		'profile_id'
	);

	if (ok) {
		console.log('✨ Listo.');
	} else {
		console.error('⚠️ Terminó con errores. Revisá el ❌ de arriba.');
		process.exit(1);
	}
}

run().catch(console.error);
