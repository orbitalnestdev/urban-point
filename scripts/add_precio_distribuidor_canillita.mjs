import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
    .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
    .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
    .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLL_ID = 'products';

async function run() {
  console.log('🚀 Agregando atributos precio_distribuidor y precio_canillita en Appwrite...');

  try {
    console.log('Intentando crear atributo (Integer) [precio_distribuidor]...');
    await db.createIntegerAttribute(DB_ID, COLL_ID, 'precio_distribuidor', false, 0, 999999999, 0);
    console.log('✅ [precio_distribuidor] creado exitosamente.');
  } catch (err) {
    console.log(`⚠️ [precio_distribuidor]: ${err.message}`);
  }

  try {
    console.log('Intentando crear atributo (Integer) [precio_canillita]...');
    await db.createIntegerAttribute(DB_ID, COLL_ID, 'precio_canillita', false, 0, 999999999, 0);
    console.log('✅ [precio_canillita] creado exitosamente.');
  } catch (err) {
    console.log(`⚠️ [precio_canillita]: ${err.message}`);
  }

  console.log('Esperando propagación en Appwrite...');
  let readyDist = false;
  let readyCan = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const a1 = await db.getAttribute(DB_ID, COLL_ID, 'precio_distribuidor');
      readyDist = a1.status === 'available';
    } catch(e) {}
    try {
      const a2 = await db.getAttribute(DB_ID, COLL_ID, 'precio_canillita');
      readyCan = a2.status === 'available';
    } catch(e) {}
    console.log(`Status -> precio_distribuidor: ${readyDist ? 'available' : 'pending'}, precio_canillita: ${readyCan ? 'available' : 'pending'}`);
    if (readyDist && readyCan) break;
  }

  console.log('🎉 Migración de atributos finalizada.');
}

run();
