import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'categories';

async function addParentIdAttribute() {
  console.log('🛠️ Creando atributo "parent_id" en la colección categories...');
  try {
    await db.createStringAttribute(DB_ID, COLLECTION_ID, 'parent_id', 36, false);
    console.log('✅ Atributo "parent_id" creado exitosamente.');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️ Atributo "parent_id" ya existe.');
    } else {
      console.error('❌ Error creando parent_id:', err.message);
    }
  }
}

addParentIdAttribute();
