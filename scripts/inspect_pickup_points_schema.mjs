import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function inspect() {
  console.log('🔍 Inspeccionando colección pickup_points...');
  const res = await db.listDocuments(DB_ID, 'pickup_points', [Query.limit(5)]);
  console.log(`Total de pickup_points encontrados en primera página: ${res.total}`);
  if (res.documents.length > 0) {
    console.log('\n📄 Ejemplo de documento pickup_points:');
    console.log(JSON.stringify(res.documents[0], null, 2));
  }

  console.log('\n🔍 Inspeccionando colección orders (pedidos)...');
  const ordersRes = await db.listDocuments(DB_ID, 'orders', [Query.limit(1)]);
  if (ordersRes.documents.length > 0) {
    console.log('\n📄 Ejemplo de documento orders:');
    console.log(JSON.stringify(ordersRes.documents[0], null, 2));
  }
}

inspect().catch(console.error);
