import { Client, Databases, Query, ID } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

// Subcategory mapping rule for Desayuno products
function getSubcategoryName(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes('alfajor')) return 'Desayuno - Alfajores';
  if (n.includes('brownie')) return 'Desayuno - Brownies';
  if (n.includes('cookie')) return 'Desayuno - Cookies';
  if (n.includes('cuadrado') || n.includes('pastafrola')) return 'Desayuno - Cuadrados y Pastelería';
  if (n.includes('macaron')) return 'Desayuno - Macarons';
  return 'Desayuno - General';
}

async function run() {
  console.log('🚀 Iniciando re-importación del catálogo Desayuno con subcategorías y costo PVP...');

  // 1. Delete all current products in products collection
  const existingProds = await db.listDocuments(DB_ID, 'products', [Query.limit(100)]);
  for (const doc of existingProds.documents) {
    await db.deleteDocument(DB_ID, 'products', doc.$id);
  }
  console.log(`🗑️ Se eliminaron ${existingProds.documents.length} productos anteriores.`);

  // 2. Ensure subcategories exist in Appwrite categories
  const subcatNames = [
    'Desayuno - Alfajores',
    'Desayuno - Brownies',
    'Desayuno - Cookies',
    'Desayuno - Cuadrados y Pastelería',
    'Desayuno - Macarons'
  ];

  const catMap = {};
  for (let i = 0; i < subcatNames.length; i++) {
    const subName = subcatNames[i];
    const subSlug = subName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const existingCat = await db.listDocuments(DB_ID, 'categories', [Query.equal('slug', subSlug)]);
    if (existingCat.documents.length > 0) {
      catMap[subName] = existingCat.documents[0].$id;
    } else {
      const createdCat = await db.createDocument(DB_ID, 'categories', ID.unique(), {
        nombre: subName,
        slug: subSlug,
        orden: i + 1
      });
      catMap[subName] = createdCat.$id;
    }
  }

  console.log('📁 Subcategorías de Desayuno listas:', catMap);

  // 3. Read raw scraped HTML/JSON products
  const rawProducts = JSON.parse(fs.readFileSync('scripts/ventalista_products.json', 'utf8'));

  let insertedCount = 0;

  for (const p of rawProducts) {
    const subName = getSubcategoryName(p.nombre);
    const catId = catMap[subName] || Object.values(catMap)[0];

    // User rule: "El pvp es el precio de costo, si no tiene pvp poner el precio unico"
    // p.precio in raw JSON had pvpNum if present, else precioNum.
    // Let's accurately set:
    // costo: PVP sugerido if present (in centavos), else main price (in centavos).
    // precio: main price displayed on card (in centavos)
    const precioPublico = p.precio; 
    const precioCosto = p.precio_distribuidor > 0 ? p.precio_distribuidor : p.precio;

    const slug = p.nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + (p.sku ? p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') : Math.floor(Math.random() * 1000));

    const docPayload = {
      nombre: p.nombre,
      slug: slug,
      sku: p.sku || 'SKU-GEN',
      descripcion: p.variante ? `Presentación: ${p.variante}` : p.nombre,
      precio: precioPublico, // Retail ARS centavos
      precio_promocional: precioPublico,
      costo: precioCosto, // PVP / Cost ARS centavos
      precio_distribuidor: precioCosto,
      precio_canillita: precioCosto,
      iva_pct: 2100, // 21% IVA
      stock: p.stock,
      portada_url: p.portada_url,
      categoria_id: catId,
      estado: 'activo'
    };

    try {
      await db.createDocument(DB_ID, 'products', ID.unique(), docPayload);
      insertedCount++;
      console.log(`✅ [${insertedCount}/${rawProducts.length}] ${p.nombre}`);
      console.log(`   └ Subcategoría: ${subName} | Stock: ${p.stock} | Precio: $${precioPublico/100} ARS | Costo/PVP: $${precioCosto/100} ARS`);
    } catch (err) {
      console.error(`❌ Error al crear [${p.nombre}]:`, err.message);
    }
  }

  console.log(`\n🎉 Re-importación finalizada! ${insertedCount} productos actualizados con subcategorías y costo PVP.`);
}

run().catch(console.error);
