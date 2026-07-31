import { Client, Storage } from 'node-appwrite';
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

const storage = new Storage(client);

async function run() {
  try {
    const bucket = await storage.getBucket('products');
    console.log('Bucket permissions:', bucket.$permissions);
    console.log('Bucket fileSecurity:', bucket.fileSecurity);
  } catch(e: any) {
    console.error('Error:', e.message);
  }
}
run();
