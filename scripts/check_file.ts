import { Client, Storage } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

const client = new Client()
  .setEndpoint('https://aw.orbitalnest.net/v1')
  .setProject('6a6a5321001439f06817')
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

async function run() {
  try {
    const file = await storage.getFile('products', '6a6bc56500180ceb94cc');
    console.log('File found:', file.name, file.sizeOriginal);
    console.log('File permissions:', file.$permissions);
  } catch(e: any) {
    console.error('Error:', e.message);
  }
}
run();
