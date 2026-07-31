import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

// Setup Env & Appwrite Client
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const [key, val] = line.split('=');
    if (key && val) {
      process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, '');
    }
  }
}

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || '')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '')
  .setKey(process.env.APPWRITE_API_KEY || '');

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLL_ID = 'products';

async function run() {
  console.log('🚀 Iniciando actualización de esquema de Appwrite...');

  const stringAttrs = [
    'envio_config',
    'seo_config',
    'variantes',
    'tramos_cantidad',
    'galeria_urls'
  ];

  for (const attr of stringAttrs) {
    try {
      console.log(`Intentando crear atributo (String) [${attr}]...`);
      await db.createStringAttribute(DB_ID, COLL_ID, attr, 65000, false, undefined, false);
      console.log(`✅ [${attr}] creado.`);
    } catch (err: any) {
      console.log(`⚠️ [${attr}]: ${err.message}`);
    }
  }

  try {
    console.log(`Intentando crear atributo URL [portada_url]...`);
    await db.createUrlAttribute(DB_ID, COLL_ID, 'portada_url', false, undefined, false);
    console.log(`✅ [portada_url] creado.`);
  } catch (err: any) {
    console.log(`⚠️ [portada_url]: ${err.message}`);
  }

  const intAttrs = [
    'stock_maximo',
    'nivel_reorden',
    'tiempo_reposicion'
  ];

  for (const attr of intAttrs) {
    try {
      console.log(`Intentando crear atributo (Integer) [${attr}]...`);
      await db.createIntegerAttribute(DB_ID, COLL_ID, attr, false, -2147483648, 2147483647, undefined, false);
      console.log(`✅ [${attr}] creado.`);
    } catch (err: any) {
      console.log(`⚠️ [${attr}]: ${err.message}`);
    }
  }

  console.log('\n🎉 Proceso de actualización de esquema finalizado. Espera unos segundos para que Appwrite propague los índices.');
}

run();
