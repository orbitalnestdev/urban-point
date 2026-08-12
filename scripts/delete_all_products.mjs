import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'products';

async function deleteAllProducts() {
  console.log('📦 Consultando productos existentes en la colección "products"...');
  
  let allDocs = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DB_ID, COLLECTION_ID, [
      Query.limit(100),
      Query.offset(offset)
    ]);
    allDocs.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }

  console.log(`📋 Total de productos encontrados: ${allDocs.length}`);

  if (allDocs.length === 0) {
    console.log('✨ La colección de productos ya está completamente vacía.');
    return;
  }

  console.log('🗑️ Eliminando productos...');
  let deletedCount = 0;
  for (const doc of allDocs) {
    try {
      await db.deleteDocument(DB_ID, COLLECTION_ID, doc.$id);
      deletedCount++;
      if (deletedCount % 10 === 0 || deletedCount === allDocs.length) {
        console.log(`🗑️ Progreso: ${deletedCount}/${allDocs.length} productos eliminados...`);
      }
    } catch (err) {
      console.error(`❌ Error al eliminar producto [${doc.$id}] (${doc.nombre}):`, err.message);
    }
  }

  console.log(`\n🎉 Eliminación completada! Se eliminaron ${deletedCount} productos de la base de datos.`);
}

deleteAllProducts().catch(console.error);
