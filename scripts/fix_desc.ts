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

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  try {
    console.log('Eliminando atributo descripcion...');
    await db.deleteAttribute(DB_ID, COLL_ID, 'descripcion');
    console.log('Atributo eliminado. Esperando propagación...');
  } catch (err: any) {
    console.log('Error eliminando (o no existía):', err.message);
  }

  await delay(5000); // wait for appwrite to process deletion

  try {
    console.log('Creando atributo descripcion (65000)...');
    await db.createStringAttribute(DB_ID, COLL_ID, 'descripcion', 65000, false, undefined, false);
    console.log('✅ Atributo creado con tamaño 65000.');
  } catch(e: any) {
    console.log('Error creando:', e.message);
  }
}

run();
