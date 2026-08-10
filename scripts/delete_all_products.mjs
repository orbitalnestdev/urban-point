import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

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
