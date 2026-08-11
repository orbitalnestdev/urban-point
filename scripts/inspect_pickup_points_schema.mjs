import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

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
