import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function checkAttributes() {
  console.log('--- Atributos de pickup_points ---');
  const pkAttrs = await db.listAttributes(DB_ID, 'pickup_points');
  pkAttrs.attributes.forEach(a => console.log(` - ${a.key}: ${a.type} (required: ${a.required})`));

  console.log('\n--- Atributos de orders ---');
  const ordAttrs = await db.listAttributes(DB_ID, 'orders');
  ordAttrs.attributes.forEach(a => console.log(` - ${a.key}: ${a.type} (required: ${a.required})`));
}

checkAttributes().catch(console.error);
