import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY!;

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'canillita_applications';

async function main() {
  console.log("🛠️ Actualizando atributos en 'canillita_applications'...");

  try {
    await db.createStringAttribute(DB_ID, COLLECTION_ID, 'localidad', 255, false, 'CABA');
    console.log("✅ Atributo 'localidad' agregado.");
  } catch (e: any) {
    console.log("ℹ️ 'localidad':", e.message || e);
  }

  try {
    await db.createStringAttribute(DB_ID, COLLECTION_ID, 'provincia', 255, false, 'CABA');
    console.log("✅ Atributo 'provincia' agregado.");
  } catch (e: any) {
    console.log("ℹ️ 'provincia':", e.message || e);
  }

  try {
    await db.createStringAttribute(DB_ID, COLLECTION_ID, 'cbu', 50, false);
    console.log("✅ Atributo 'cbu' agregado.");
  } catch (e: any) {
    console.log("ℹ️ 'cbu':", e.message || e);
  }

  try {
    await db.createStringAttribute(DB_ID, COLLECTION_ID, 'condicion_fiscal', 50, false, 'Monotributo');
    console.log("✅ Atributo 'condicion_fiscal' agregado.");
  } catch (e: any) {
    console.log("ℹ️ 'condicion_fiscal':", e.message || e);
  }

  console.log("🎉 Atributos actualizados exitosamente.");
}

main().catch(console.error);
