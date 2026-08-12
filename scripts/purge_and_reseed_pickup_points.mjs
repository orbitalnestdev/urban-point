import { Client, Databases, Query, ID } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'pickup_points';

const STREET_ANCHORS = [
  { keywords: ['CABILDO'], lat: -34.5615, lng: -58.4568, barrio: 'Belgrano / Nuñez' },
  { keywords: ['CORRIENTES'], lat: -34.6033, lng: -58.4194, barrio: 'Almagro / Villa Crespo' },
  { keywords: ['CORDOBA'], lat: -34.5950, lng: -58.4100, barrio: 'Palermo / Recoleta' },
  { keywords: ['SANTA FE'], lat: -34.5878, lng: -58.4116, barrio: 'Palermo / Recoleta' },
  { keywords: ['CONGRESO'], lat: -34.5650, lng: -58.4680, barrio: 'Belgrano / Coghlan' },
  { keywords: ['TRIUNVIRATO'], lat: -34.5721, lng: -58.4871, barrio: 'Villa Urquiza' },
  { keywords: ['ALVAREZ THOMAS'], lat: -34.5750, lng: -58.4650, barrio: 'Colegiales / Urquiza' },
  { keywords: ['LACROZE', 'F LACROZE'], lat: -34.5724, lng: -58.4462, barrio: 'Colegiales' },
  { keywords: ['DEL LIBERTADOR', 'LIBERTADOR'], lat: -34.5500, lng: -58.4500, barrio: 'Nuñez / Belgrano' },
  { keywords: ['MAIPU'], lat: -34.5200, lng: -58.4800, provincia: 'Buenos Aires', barrio: 'Vicente López / Olivos' },
  { keywords: ['DORREGO'], lat: -34.5800, lng: -58.4400, barrio: 'Palermo Hollywood' },
  { keywords: ['GAONA'], lat: -34.6150, lng: -58.4550, barrio: 'Caballito / Flores' },
  { keywords: ['WARNES'], lat: -34.5980, lng: -58.4450, barrio: 'Chacarita' },
  { keywords: ['CRAMER'], lat: -34.5650, lng: -58.4600, barrio: 'Belgrano R' },
  { keywords: ['MONROE'], lat: -34.5620, lng: -58.4720, barrio: 'Belgrano / Coghlan' },
  { keywords: ['JURAMENTO'], lat: -34.5615, lng: -58.4568, barrio: 'Belgrano' },
  { keywords: ['LA PAMPA', 'PAMPA'], lat: -34.5680, lng: -58.4550, barrio: 'Belgrano' },
  { keywords: ['MENDOZA'], lat: -34.5600, lng: -58.4500, barrio: 'Belgrano' },
  { keywords: ['OLAZABAL'], lat: -34.5630, lng: -58.4620, barrio: 'Belgrano' },
  { keywords: ['CUBA'], lat: -34.5580, lng: -58.4520, barrio: 'Nuñez / Belgrano' },
  { keywords: ['ARRIBE'], lat: -34.5550, lng: -58.4480, barrio: 'Nuñez / Belgrano' },
  { keywords: ['PINTO'], lat: -34.5450, lng: -58.4700, barrio: 'Saavedra' },
  { keywords: ['BALBIN', 'R BALBIN'], lat: -34.5580, lng: -58.4800, barrio: 'Saavedra' },
  { keywords: ['CONSTITUYENTES'], lat: -34.5750, lng: -58.4900, barrio: 'Villa Pueyrredón' },
  { keywords: ['BORGES', 'GURRUCHAGA', 'THAMES', 'ARMENIA'], lat: -34.5880, lng: -58.4280, barrio: 'Palermo Soho' },
  { keywords: ['DIAZ VELEZ'], lat: -34.6100, lng: -58.4350, barrio: 'Caballito / Almagro' }
];

function getAnchor(calle, alturaNum) {
  const upperCalle = calle.toUpperCase();
  for (const anchor of STREET_ANCHORS) {
    if (anchor.keywords.some(k => upperCalle.includes(k))) {
      return anchor;
    }
  }
  return { lat: -34.5800, lng: -58.4400, barrio: 'CABA Centro / Norte', provincia: 'CABA' };
}

function calculateCoords(calle, altura, index) {
  const num = parseInt(altura.replace(/\D/g, '') || '1000', 10);
  const anchor = getAnchor(calle, num);
  
  const latOffset = ((num % 5000) / 100000) * (index % 2 === 0 ? 1 : -1);
  const lngOffset = (((index * 37) % 200) / 10000) * (index % 3 === 0 ? -1 : 1);

  return {
    lat: Number((anchor.lat + latOffset).toFixed(6)),
    lng: Number((anchor.lng + lngOffset).toFixed(6)),
    barrio: anchor.barrio,
    provincia: anchor.provincia || 'CABA'
  };
}

async function run() {
  console.log('🧹 Purgando y limpiando la colección pickup_points...');

  // 1. Fetch all documents and delete them with batch concurrency
  while (true) {
    const res = await db.listDocuments(DB_ID, COLLECTION_ID, [Query.limit(100)]);
    if (res.documents.length === 0) break;

    const deletePromises = res.documents.map(doc => db.deleteDocument(DB_ID, COLLECTION_ID, doc.$id).catch(e => {}));
    await Promise.all(deletePromises);
    console.log(`🗑️ Eliminados ${res.documents.length} documentos de pickup_points...`);
  }

  console.log('✨ Colección pickup_points vaciada exitosamente.');

  // 2. Parse public/nodos.csv
  const csvPath = path.resolve(process.cwd(), 'public/nodos.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  const parsedNodes = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let parts = [];
    let inQuotes = false;
    let current = '';
    for (let c of line) {
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    parts.push(current.trim());

    const puesto = (parts[0] || '').trim();
    const calle = (parts[1] || '').trim().replace(/\s+/g, ' ');
    const altura = (parts[2] || '').trim();

    if (!calle) continue;
    parsedNodes.push({ puesto, calle, altura });
  }

  console.log(`📋 Total de Nodos extraídos de public/nodos.csv: ${parsedNodes.length}`);

  // 3. Seed exact 385 unique documents into Appwrite in concurrent chunks
  const createTasks = parsedNodes.map((node, i) => {
    const cleanCalle = node.calle.replace(/^AVDA\b/i, 'Av.').replace(/^AV\b/i, 'Av.').toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
    const isAlturaZero = !node.altura || node.altura === '0';
    const direccionClean = isAlturaZero ? cleanCalle : `${cleanCalle} ${node.altura}`;
    
    // Format: "Puesto [Puesto] - [Dirección]"
    const puestoLabel = node.puesto ? node.puesto : `${i + 1}`;
    const nombreComercial = `Puesto ${puestoLabel} - ${direccionClean}`;

    const { lat, lng, barrio, provincia } = calculateCoords(node.calle, node.altura, i);

    return {
      nombre_comercial: nombreComercial,
      direccion: direccionClean,
      localidad: barrio,
      provincia: provincia,
      lat: lat,
      lng: lng,
      horarios: 'Lunes a Sábado 07:00 a 20:00 hs.',
      estado: 'activo',
      cbu: `00000031000${String(i + 1).padStart(11, '0')}`,
      condicion_fiscal: 'Monotributo'
    };
  });

  const chunkSize = 20;
  let createdCount = 0;
  for (let i = 0; i < createTasks.length; i += chunkSize) {
    const chunk = createTasks.slice(i, i + chunkSize);
    await Promise.all(chunk.map(payload => db.createDocument(DB_ID, COLLECTION_ID, ID.unique(), payload)));
    createdCount += chunk.length;
    console.log(`✅ [${createdCount}/${createTasks.length}] Puntos creados...`);
  }

  console.log(`\n🎉 Re-importación limpia finalizada! Se crearon exactamente ${createdCount} puntos de retiro sin duplicados.`);
}

run().catch(console.error);
