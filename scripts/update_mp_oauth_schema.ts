import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error("Falta APPWRITE_API_KEY en las variables de entorno.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'pickup_points';

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

async function runSchemaUpdate() {
  console.log("🛠️ Actualizando esquema de pickup_points para Mercado Pago OAuth...");

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_user_id', 100, false),
    'mp_user_id (ID de usuario de Mercado Pago)'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_access_token', 1000, false),
    'mp_access_token'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_refresh_token', 1000, false),
    'mp_refresh_token'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_public_key', 255, false),
    'mp_public_key'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_token_expires_at', 100, false),
    'mp_token_expires_at'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_connected_at', 100, false),
    'mp_connected_at'
  );

  await addAttribute(
    () => db.createStringAttribute(DB_ID, COLLECTION_ID, 'mp_status', 50, false, 'desconectado'),
    'mp_status'
  );

  console.log("✨ Actualización de esquema finalizada.");
}

runSchemaUpdate().catch(console.error);
