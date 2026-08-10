import { createAdminClient } from '../src/lib/server/appwrite.ts';
import { Query } from 'node-appwrite';
import 'dotenv/config';

const { databases } = createAdminClient();

async function fetchAllDocs(collectionId) {
  let allDocs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments('urbanpoint', collectionId, [
      Query.limit(100),
      Query.offset(offset)
    ]);
    allDocs = allDocs.concat(res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return allDocs;
}

async function verify() {
  const products = await fetchAllDocs('products');
  console.log(`✅ Total de productos cargados por fetchAllDocs: ${products.length}`);
  console.log(`✅ Borradores: ${products.filter(p => p.estado === 'borrador').length}`);
  console.log(`✅ Publicados: ${products.filter(p => p.estado === 'activo').length}`);
}

verify().catch(console.error);
