import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function fetchAllDocs(collectionId) {
  let allDocs = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DB_ID, collectionId, [
      Query.limit(100),
      Query.offset(offset)
    ]);
    allDocs = allDocs.concat(res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return allDocs;
}

async function analyzeCatalog() {
  console.log('📊 Analizando estado del catálogo en Appwrite...');

  const products = await fetchAllDocs('products');
  const categories = await fetchAllDocs('categories');

  console.log(`\n📦 Total de productos en la base de datos: ${products.length}`);
  
  const byState = {
    activo: [],
    borrador: [],
    pausado: [],
    inactivo: []
  };

  products.forEach(p => {
    const state = p.estado || 'borrador';
    if (!byState[state]) byState[state] = [];
    byState[state].push(p);
  });

  console.log('\n--- Desglose por Estado ---');
  console.log(`✅ Activos (Publicados en tienda): ${byState.activo.length}`);
  console.log(`📝 Borradores (Attain u otros en revisión): ${byState.borrador.length}`);
  console.log(`⏸️ Pausados / Inactivos: ${(byState.pausado.length + byState.inactivo.length)}`);

  console.log('\n--- Productos Activos Publicados ---');
  byState.activo.forEach((p, i) => {
    const cat = categories.find(c => c.$id === (p.categoria_id?.$id || p.categoria_id));
    console.log(`${i + 1}. [${p.sku}] ${p.nombre} - $${p.precio/100} ARS (Categoría: ${cat ? cat.nombre : 'Sin Categoría'})`);
  });

  console.log('\n--- Resumen de Categorías Existentes ---');
  categories.forEach(c => {
    const count = products.filter(p => (p.categoria_id?.$id || p.categoria_id) === c.$id).length;
    console.log(`- ${c.nombre} (Slug: ${c.slug}, Padre ID: ${c.parent_id || 'Ninguno'}): ${count} productos`);
  });
}

analyzeCatalog().catch(console.error);
