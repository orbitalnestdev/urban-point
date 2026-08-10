import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'pickup_points';

async function fetchAllDocs() {
  let allDocs = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DB_ID, COLLECTION_ID, [
      Query.limit(100),
      Query.offset(offset)
    ]);
    allDocs = allDocs.concat(res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return allDocs;
}

async function checkDuplicates() {
  console.log('🔍 Analizando puntos de retiro en Appwrite...');
  const docs = await fetchAllDocs();
  console.log(`📊 Total de documentos en pickup_points: ${docs.length}`);

  const nameCounts = {};
  const duplicateGroup = {};

  docs.forEach(doc => {
    const key = `${doc.nombre_comercial || doc.nombre}___${doc.direccion}`;
    if (!nameCounts[key]) {
      nameCounts[key] = [];
    }
    nameCounts[key].push(doc.$id);
  });

  let duplicateCount = 0;
  Object.keys(nameCounts).forEach(key => {
    if (nameCounts[key].length > 1) {
      duplicateCount++;
      duplicateGroup[key] = nameCounts[key];
    }
  });

  console.log(`⚠️ Puntos de retiro con duplicados exactos (Nombre + Dirección): ${duplicateCount}`);
  if (duplicateCount > 0) {
    console.log('Ejemplos de duplicados:');
    Object.keys(duplicateGroup).slice(0, 5).forEach(k => {
      console.log(`- ${k}: ${duplicateGroup[k].length} copias IDs:`, duplicateGroup[k]);
    });
  }
}

checkDuplicates().catch(console.error);
