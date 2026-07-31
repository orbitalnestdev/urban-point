import { Client, Databases, Storage } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

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
const storage = new Storage(client);

async function run() {
  const docs = await db.listDocuments('urbanpoint', 'products');
  console.log(`Encontrados ${docs.documents.length} productos.`);

  for (const doc of docs.documents) {
    console.log(`\nProducto: ${doc.nombre}`);
    console.log(`Portada URL: ${doc.portada_url}`);

    if (doc.portada_url) {
      try {
        const res = await fetch(doc.portada_url);
        console.log(`HTTP Status: ${res.status} (${res.statusText})`);
        if (!res.ok) {
          const body = await res.text();
          console.log(`Error Body: ${body}`);
        }
      } catch (err: any) {
        console.log(`Fetch error: ${err.message}`);
      }
    }
  }
}

run();
