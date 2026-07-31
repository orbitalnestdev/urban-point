import { Client, Databases } from 'node-appwrite';
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

async function checkSchema() {
  try {
    const attributes = await db.listAttributes('urbanpoint', 'products');
    console.log(JSON.stringify(attributes.attributes.map((a: any) => ({ key: a.key, type: a.type, required: a.required })), null, 2));
  } catch(e) {
    console.error(e);
  }
}
checkSchema();
