import { Client, Storage, Permission, Role } from 'node-appwrite';
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
    const bucket = await storage.createBucket('products', 'Productos', [
      Permission.read(Role.any())
    ], false, true, undefined, ['jpg', 'png', 'jpeg', 'webp', 'gif'], undefined, undefined, false);
    console.log('Bucket creado:', bucket.$id);
  } catch(e: any) {
    console.error(e.message);
  }
}
run();
