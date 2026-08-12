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
  console.log('🚀 Iniciando importación de catálogo Ventalista (Desayuno)...');

  // 1. Ensure "Desayuno" category exists in categories collection
  let categoryId = null;
  try {
    const catRes = await db.listDocuments(DB_ID, 'categories', [
      Query.equal('nombre', 'Desayuno')
    ]);

    if (catRes.documents.length > 0) {
      categoryId = catRes.documents[0].$id;
      console.log(`📁 Categoría existente encontrada: "Desayuno" [${categoryId}]`);
    } else {
      const newCat = await db.createDocument(DB_ID, 'categories', ID.unique(), {
        nombre: 'Desayuno',
        slug: 'desayuno',
        orden: 1
      });
      categoryId = newCat.$id;
      console.log(`📁 Nueva categoría creada: "Desayuno" [${categoryId}]`);
    }
  } catch (err) {
    console.warn('⚠️ Error al gestionar categoría:', err.message);
  }

  // 2. Read products from JSON
  const jsonPath = path.resolve(process.cwd(), 'scripts/ventalista_products.json');
  const products = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`📦 Productos a importar: ${products.length}`);

  let insertedCount = 0;
  for (const p of products) {
    // Generate clean unique slug
    const slug = p.nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + (p.sku ? p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') : Math.floor(Math.random() * 1000));

    const docPayload = {
      nombre: p.nombre,
      slug: slug,
      sku: p.sku || 'SKU-GEN',
      descripcion: p.variante ? `Presentación: ${p.variante}` : p.nombre,
      precio: p.precio, // PVP public retail in ARS centavos
      precio_promocional: p.precio_promocional,
      precio_distribuidor: p.precio_distribuidor, // Wholesale/distributor in ARS centavos
      precio_canillita: p.precio_canillita,
      costo: p.costo,
      iva_pct: 2100, // 21% IVA
      stock: p.stock,
      portada_url: p.portada_url,
      categoria_id: categoryId,
      estado: 'activo'
    };

    try {
      const doc = await db.createDocument(DB_ID, 'products', ID.unique(), docPayload);
      insertedCount++;
      console.log(`✅ [${insertedCount}/${products.length}] Creado: ${p.nombre} (PVP: $${p.precio/100} ARS, Mayorista: $${p.precio_distribuidor/100} ARS)`);
    } catch (err) {
      console.error(`❌ Error creando [${p.nombre}]:`, err.message);
    }
  }

  console.log(`\n🎉 Importación finalizada! Se crearon ${insertedCount} productos en Appwrite.`);
}

run().catch(console.error);
