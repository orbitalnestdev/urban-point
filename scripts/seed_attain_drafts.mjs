import { Client, Databases, Query, ID } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function run() {
  console.log('🚀 Iniciando seeder de productos de Attain en estado BORRADOR...');

  const jsonPath = path.resolve(process.cwd(), 'scripts/attain_products.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ No se encontró scripts/attain_products.json. Primero ejecutá scrape_attain_all.mjs.');
    return;
  }

  const productsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📦 Se encontraron ${productsData.length} productos para importar.`);

  // 1. Ensure categories exist in Appwrite
  const categoryMap = {}; // categoryName -> categoryId
  const uniqueCatNames = Array.from(new Set(productsData.map(p => p.categoria)));

  for (let i = 0; i < uniqueCatNames.length; i++) {
    const catName = uniqueCatNames[i];
    const catSlug = catName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const existingCat = await db.listDocuments(DB_ID, 'categories', [Query.equal('slug', catSlug)]);
    if (existingCat.documents.length > 0) {
      categoryMap[catName] = existingCat.documents[0].$id;
    } else {
      const newCat = await db.createDocument(DB_ID, 'categories', ID.unique(), {
        nombre: catName,
        slug: catSlug,
        orden: i + 10,
        parent_id: null
      });
      categoryMap[catName] = newCat.$id;
      console.log(`📁 Categoría creada: "${catName}" [${newCat.$id}]`);
    }
  }

  // 2. Insert products in chunks of 15
  const createTasks = productsData.map((p, idx) => {
    const catId = categoryMap[p.categoria] || null;
    const baseSlug = p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const uniqueSlug = `${baseSlug}-${p.sku.toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx + 1}`;

    return {
      nombre: p.nombre,
      slug: uniqueSlug,
      sku: p.sku || `ATT-${idx + 1}`,
      descripcion: p.descripcion,
      precio: p.precio,
      precio_promocional: p.precio_lista > p.precio ? p.precio : null,
      costo: p.costo,
      precio_distribuidor: p.costo,
      precio_canillita: p.costo,
      iva_pct: 2100,
      stock: p.stock || 50,
      marca: p.marca || 'Attain',
      portada_url: p.portada_url,
      galeria_urls: JSON.stringify(p.galeria_urls || []),
      categoria_id: catId,
      estado: 'borrador' // High importance: set as draft ("borrador") as requested!
    };
  });

  const chunkSize = 15;
  let createdCount = 0;
  for (let i = 0; i < createTasks.length; i += chunkSize) {
    const chunk = createTasks.slice(i, i + chunkSize);
    await Promise.all(chunk.map(payload => 
      db.createDocument(DB_ID, 'products', ID.unique(), payload).catch(err => {
        console.error(`❌ Error creando ${payload.nombre}:`, err.message);
      })
    ));
    createdCount += chunk.length;
    console.log(`✅ [${createdCount}/${createTasks.length}] Productos guardados como BORRADOR en Appwrite...`);
  }

  console.log(`\n🎉 Importación completada! Se subieron ${createdCount} productos de Attain en estado BORRADOR.`);
}

run().catch(console.error);
