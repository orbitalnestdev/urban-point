import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

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
