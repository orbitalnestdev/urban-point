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

function getSubcategoryName(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes('alfajor')) return 'Alfajores';
  if (n.includes('brownie')) return 'Brownies';
  if (n.includes('cookie')) return 'Cookies';
  if (n.includes('cuadrado') || n.includes('pastafrola')) return 'Cuadrados y Pastelería';
  if (n.includes('macaron')) return 'Macarons';
  return 'General';
}

async function run() {
  console.log('🚀 Reestructurando Jerarquía de Categorías (Padre: Desayuno)...');

  // 1. Delete old categories with "Desayuno - " in name
  const existingCats = await db.listDocuments(DB_ID, 'categories', [Query.limit(100)]);
  for (const doc of existingCats.documents) {
    try {
      await db.deleteDocument(DB_ID, 'categories', doc.$id);
    } catch (e) {}
  }
  console.log(`🗑️ Se eliminaron ${existingCats.documents.length} categorías anteriores.`);

  // 2. Create Parent Category: Desayuno
  const parentCat = await db.createDocument(DB_ID, 'categories', ID.unique(), {
    nombre: 'Desayuno',
    slug: 'desayuno',
    orden: 1,
    parent_id: null
  });
  console.log(`📁 Categoría Padre Creada: "Desayuno" [${parentCat.$id}]`);

  // 3. Create Subcategories linked to Parent Desayuno
  const subcategoriesDef = [
    'Alfajores',
    'Brownies',
    'Cookies',
    'Cuadrados y Pastelería',
    'Macarons'
  ];

  const subCatMap = {};
  for (let i = 0; i < subcategoriesDef.length; i++) {
    const subName = subcategoriesDef[i];
    const subSlug = subName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const createdSub = await db.createDocument(DB_ID, 'categories', ID.unique(), {
      nombre: subName,
      slug: subSlug,
      orden: i + 1,
      parent_id: parentCat.$id
    });

    subCatMap[subName] = createdSub.$id;
    console.log(`  └ Subcategoría: "${subName}" [${createdSub.$id}] (Padre: Desayuno)`);
  }

  // 4. Update products with their subcategory ID
  const existingProds = await db.listDocuments(DB_ID, 'products', [Query.limit(100)]);
  let updatedCount = 0;

  for (const prod of existingProds.documents) {
    const subName = getSubcategoryName(prod.nombre);
    const subId = subCatMap[subName] || parentCat.$id;

    try {
      await db.updateDocument(DB_ID, 'products', prod.$id, {
        categoria_id: subId
      });
      updatedCount++;
      console.log(`✅ [${updatedCount}/${existingProds.documents.length}] ${prod.nombre} -> Subcategoría: ${subName}`);
    } catch (err) {
      console.error(`❌ Error actualizando producto [${prod.nombre}]:`, err.message);
    }
  }

  console.log(`\n🎉 Categorías reorganizadas exitosamente! ${updatedCount} productos asignados.`);
}

run().catch(console.error);
