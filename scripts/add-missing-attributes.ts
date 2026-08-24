import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error('❌ Falta APPWRITE_API_KEY en las variables de entorno.');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function safeCreateStringAttribute(collectionId: string, key: string, size: number = 255, required: boolean = false, defaultValue?: string) {
  try {
    await db.getAttribute(DB_ID, collectionId, key);
    console.log(`✓ Atributo "${key}" en "${collectionId}" ya existe.`);
  } catch (e: any) {
    if (e.code === 404) {
      console.log(`➕ Creando atributo string "${key}" en "${collectionId}"...`);
      await db.createStringAttribute(DB_ID, collectionId, key, size, required, defaultValue);
    } else {
      console.warn(`⚠️ Error al verificar "${key}" en "${collectionId}":`, e.message);
    }
  }
}

async function safeCreateBooleanAttribute(collectionId: string, key: string, required: boolean = false, defaultValue?: boolean) {
  try {
    await db.getAttribute(DB_ID, collectionId, key);
    console.log(`✓ Atributo "${key}" en "${collectionId}" ya existe.`);
  } catch (e: any) {
    if (e.code === 404) {
      console.log(`➕ Creando atributo boolean "${key}" en "${collectionId}"...`);
      await db.createBooleanAttribute(DB_ID, collectionId, key, required, defaultValue);
    } else {
      console.warn(`⚠️ Error al verificar "${key}" en "${collectionId}":`, e.message);
    }
  }
}

async function safeCreateIntegerAttribute(collectionId: string, key: string, required: boolean = false, min?: number, max?: number, defaultValue?: number) {
  try {
    await db.getAttribute(DB_ID, collectionId, key);
    console.log(`✓ Atributo "${key}" en "${collectionId}" ya existe.`);
  } catch (e: any) {
    if (e.code === 404) {
      console.log(`➕ Creando atributo integer "${key}" en "${collectionId}"...`);
      await db.createIntegerAttribute(DB_ID, collectionId, key, required, min, max, defaultValue);
    } else {
      console.warn(`⚠️ Error al verificar "${key}" en "${collectionId}":`, e.message);
    }
  }
}

async function safeCreateEnumAttribute(collectionId: string, key: string, elements: string[], required: boolean = false, defaultValue?: string) {
  try {
    await db.getAttribute(DB_ID, collectionId, key);
    console.log(`✓ Atributo "${key}" en "${collectionId}" ya existe.`);
  } catch (e: any) {
    if (e.code === 404) {
      console.log(`➕ Creando atributo enum "${key}" en "${collectionId}"...`);
      await db.createEnumAttribute(DB_ID, collectionId, key, elements, required, defaultValue);
    } else {
      console.warn(`⚠️ Error al verificar "${key}" en "${collectionId}":`, e.message);
    }
  }
}

async function run() {
  console.log('🚀 Iniciando sincronización de atributos faltantes en Appwrite...');

  // 1. Colección ORDERS
  console.log('\n--- Actualizando colección ORDERS ---');
  await safeCreateStringAttribute('orders', 'price_tier', 50, false, 'publico');
  await safeCreateBooleanAttribute('orders', 'stock_descontado', false, false);
  await safeCreateIntegerAttribute('orders', 'comision_total_centavos', false, 0, 999999999, 0);

  // 2. Colección CATEGORIES
  console.log('\n--- Actualizando colección CATEGORIES ---');
  await safeCreateIntegerAttribute('categories', 'markup_distribuidor', false, 0, 10000, 0);
  await safeCreateIntegerAttribute('categories', 'markup_canillita', false, 0, 10000, 0);
  await safeCreateIntegerAttribute('categories', 'markup_publico', false, 0, 10000, 0);
  await safeCreateStringAttribute('categories', 'imagen_url', 1000, false);
  await safeCreateStringAttribute('categories', 'parent_id', 36, false);
  await safeCreateStringAttribute('categories', 'descripcion', 1000, false);
  await safeCreateEnumAttribute('categories', 'estado', ['activo', 'inactivo'], false, 'activo');

  // 3. Colección PRODUCTS
  console.log('\n--- Actualizando colección PRODUCTS ---');
  await safeCreateIntegerAttribute('products', 'price_distribuidor', false, 0, 999999999);
  await safeCreateIntegerAttribute('products', 'precio_distribuidor', false, 0, 999999999);
  await safeCreateIntegerAttribute('products', 'price_canillita', false, 0, 999999999);
  await safeCreateIntegerAttribute('products', 'precio_canillita', false, 0, 999999999);
  await safeCreateIntegerAttribute('products', 'price_publico', false, 0, 999999999);
  await safeCreateEnumAttribute('products', 'distribuidor_mode', ['percent', 'fixed'], false);
  await safeCreateIntegerAttribute('products', 'distribuidor_percent', false, 0, 10000);
  await safeCreateIntegerAttribute('products', 'distribuidor_fixed_price', false, 0, 999999999);
  await safeCreateEnumAttribute('products', 'canillita_mode', ['percent', 'fixed'], false);
  await safeCreateIntegerAttribute('products', 'canillita_percent', false, 0, 10000);
  await safeCreateIntegerAttribute('products', 'canillita_fixed_price', false, 0, 999999999);
  await safeCreateEnumAttribute('products', 'publico_mode', ['percent', 'fixed'], false);
  await safeCreateIntegerAttribute('products', 'publico_percent', false, 0, 10000);
  await safeCreateIntegerAttribute('products', 'publico_fixed_price', false, 0, 999999999);

  // 4. Colección PAYOUTS
  console.log('\n--- Actualizando colección PAYOUTS ---');
  await safeCreateStringAttribute('payouts', 'idempotency_key', 255, false);
  await safeCreateStringAttribute('payouts', 'actor_id', 36, false);
  await safeCreateStringAttribute('payouts', 'notas', 1000, false);

  console.log('\n✅ Sincronización finalizada exitosamente.');
}

run().catch(console.error);
