import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

async function safeCreateStringAttribute(collectionId, key, size = 255, required = false) {
  try {
    await db.createStringAttribute(DB_ID, collectionId, key, size, required);
    console.log(`✅ Atributo string "${key}" creado en ${collectionId}`);
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {
    if (e.message?.includes('already exists') || e.code === 409) {
      console.log(`ℹ️ Atributo "${key}" ya existe en ${collectionId}`);
    } else {
      console.warn(`⚠️ Warning creando "${key}" en ${collectionId}:`, e.message);
    }
  }
}

async function safeCreateIntAttribute(collectionId, key, required = false) {
  try {
    await db.createIntegerAttribute(DB_ID, collectionId, key, required);
    console.log(`✅ Atributo integer "${key}" creado en ${collectionId}`);
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {
    if (e.message?.includes('already exists') || e.code === 409) {
      console.log(`ℹ️ Atributo "${key}" ya existe en ${collectionId}`);
    } else {
      console.warn(`⚠️ Warning creando "${key}" en ${collectionId}:`, e.message);
    }
  }
}

async function setup() {
  console.log('🚀 1. Configurando atributos en Appwrite para pickup_points y orders...');

  // Attributes for pickup_points
  await safeCreateStringAttribute('pickup_points', 'slug', 255, false);
  await safeCreateStringAttribute('pickup_points', 'telefono', 100, false);
  await safeCreateStringAttribute('pickup_points', 'imagen_url', 1000, false);
  await safeCreateIntAttribute('pickup_points', 'comision_pct', false);

  // Attributes for orders
  await safeCreateStringAttribute('orders', 'origin_node_id', 255, false);
  await safeCreateStringAttribute('orders', 'origin_node_name', 255, false);
  await safeCreateStringAttribute('orders', 'origin_slug', 255, false);
  await safeCreateStringAttribute('orders', 'origin_canillita_id', 255, false);
  await safeCreateStringAttribute('orders', 'pickup_node_id', 255, false);

  console.log('\n🚀 2. Generando slugs únicos para todos los puntos de retiro existentes...');

  let allNodes = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DB_ID, 'pickup_points', [
      Query.limit(100),
      Query.offset(offset)
    ]);
    allNodes = allNodes.concat(res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }

  console.log(`📦 Total de nodos encontrados: ${allNodes.length}`);

  const usedSlugs = new Set([
    'tienda', 'carrito', 'checkout', 'mi-cuenta', 'contacto', 'admin',
    'canillita', 'puntos-de-retiro', 'login', 'registro', 'api', 'productos',
    'ingresar', 'nosotros', 'ayuda', 'terminos', 'privacidad', 'comisiones'
  ]);

  let updatedCount = 0;

  for (const node of allNodes) {
    if (node.slug && !usedSlugs.has(node.slug)) {
      usedSlugs.add(node.slug);
      continue;
    }

    const baseSlug = slugify(node.nombre_comercial) || slugify(node.direccion) || `nodo-${node.$id.slice(-6)}`;
    let candidate = baseSlug;
    let counter = 2;

    while (usedSlugs.has(candidate)) {
      candidate = `${baseSlug}-${counter}`;
      counter++;
    }

    usedSlugs.add(candidate);

    try {
      await db.updateDocument(DB_ID, 'pickup_points', node.$id, {
        slug: candidate
      });
      updatedCount++;
    } catch (e) {
      console.error(`Error actualizando slug para ${node.nombre_comercial}:`, e.message);
    }
  }

  console.log(`\n🎉 PROCESO COMPLETADO! Se actualizaron ${updatedCount} nodos con su slug único.`);
}

setup().catch(console.error);
