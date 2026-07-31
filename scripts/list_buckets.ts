import { Client, Storage } from 'node-appwrite';
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

const storage = new Storage(client);

async function run() {
  try {
    const buckets = await storage.listBuckets();
    console.log(JSON.stringify(buckets.buckets.map(b => b.$id), null, 2));
  } catch (err: any) {
    console.error(err.message);
  }
}

run();
