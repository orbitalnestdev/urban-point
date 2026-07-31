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
    const files = await storage.listFiles('products');
    console.log(`Actualizando ${files.total} archivos...`);
    
    let count = 0;
    for (const file of files.files) {
      await storage.updateFile('products', file.$id, file.name, [Permission.read(Role.any())]);
      count++;
    }
    console.log(`✅ ${count} archivos actualizados con permisos públicos.`);
  } catch(e: any) {
    console.error('Error:', e.message);
  }
}
run();
