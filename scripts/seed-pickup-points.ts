import { Client, Databases, ID } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY!;

if (!apiKey) {
  console.error("Falta APPWRITE_API_KEY en .env.local");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'pickup_points';

const samplePoints = [
  {
    nombre_comercial: 'Punto Canillita Palermo Soho - Av. Santa Fe',
    direccion: 'Av. Santa Fe 3250',
    localidad: 'Palermo',
    provincia: 'CABA',
    lat: -34.5878,
    lng: -58.4116,
    horarios: 'Lunes a Sábado 07:00 a 20:00 hs. Domingos 08:00 a 14:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678901',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Canillita Plaza Italia',
    direccion: 'Av. Italia 4120',
    localidad: 'Palermo',
    provincia: 'CABA',
    lat: -34.5807,
    lng: -58.4208,
    horarios: 'Lunes a Domingo 06:30 a 21:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678902',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Recoleta - Las Heras & Junín',
    direccion: 'Av. Las Heras 2140',
    localidad: 'Recoleta',
    provincia: 'CABA',
    lat: -34.5892,
    lng: -58.3934,
    horarios: 'Lunes a Viernes 07:00 a 19:30 hs. Sábados 08:00 a 14:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678903',
    condicion_fiscal: 'Responsable Inscripto'
  },
  {
    nombre_comercial: 'Punto Canillita Belgrano - Juramento',
    direccion: 'Av. Juramento 2550',
    localidad: 'Belgrano',
    provincia: 'CABA',
    lat: -34.5615,
    lng: -58.4568,
    horarios: 'Lunes a Sábado 07:00 a 20:30 hs.',
    estado: 'activo',
    cbu: '0000003100012345678904',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto UrbanPoint Caballito - Parque Rivadavia',
    direccion: 'Av. Rivadavia 4900',
    localidad: 'Caballito',
    provincia: 'CABA',
    lat: -34.6186,
    lng: -58.4352,
    horarios: 'Lunes a Domingo 07:00 a 20:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678905',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Canillita Almagro - Corrientes & Medrano',
    direccion: 'Av. Corrientes 3920',
    localidad: 'Almagro',
    provincia: 'CABA',
    lat: -34.6033,
    lng: -58.4194,
    horarios: 'Lunes a Sábado 07:30 a 20:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678906',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto UrbanPoint San Telmo - Defensa',
    direccion: 'Defensa 1080',
    localidad: 'San Telmo',
    provincia: 'CABA',
    lat: -34.6190,
    lng: -58.3725,
    horarios: 'Lunes a Sábado 08:00 a 19:30 hs.',
    estado: 'activo',
    cbu: '0000003100012345678907',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Canillita Microcentro - Florida',
    direccion: 'Peatonal Florida 520',
    localidad: 'San Nicolás',
    provincia: 'CABA',
    lat: -34.6037,
    lng: -58.3758,
    horarios: 'Lunes a Viernes 07:00 a 19:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678908',
    condicion_fiscal: 'Responsable Inscripto'
  },
  {
    nombre_comercial: 'Punto Canillita Colegiales - Federico Lacroze',
    direccion: 'Av. Federico Lacroze 2410',
    localidad: 'Colegiales',
    provincia: 'CABA',
    lat: -34.5724,
    lng: -58.4462,
    horarios: 'Lunes a Sábado 07:00 a 20:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678909',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Canillita Villa Urquiza - Triunvirato',
    direccion: 'Av. Triunvirato 4750',
    localidad: 'Villa Urquiza',
    provincia: 'CABA',
    lat: -34.5721,
    lng: -58.4871,
    horarios: 'Lunes a Sábado 07:00 a 20:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678910',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto UrbanPoint Olivos - Av. Maipú',
    direccion: 'Av. Maipú 2890',
    localidad: 'Olivos',
    provincia: 'Buenos Aires',
    lat: -34.5108,
    lng: -58.4905,
    horarios: 'Lunes a Sábado 07:30 a 19:30 hs.',
    estado: 'activo',
    cbu: '0000003100012345678911',
    condicion_fiscal: 'Monotributo'
  },
  {
    nombre_comercial: 'Punto Canillita San Isidro Centro',
    direccion: 'Belgrano 340',
    localidad: 'San Isidro',
    provincia: 'Buenos Aires',
    lat: -34.4725,
    lng: -58.5283,
    horarios: 'Lunes a Sábado 08:00 a 20:00 hs.',
    estado: 'activo',
    cbu: '0000003100012345678912',
    condicion_fiscal: 'Monotributo'
  }
];

async function seed() {
  console.log("🌱 Iniciando carga de Puntos UrbanPoint (pickup_points)...");

  // Opcional: listar existentes para evitar duplicados exactos por nombre
  const existingRes = await db.listDocuments(DB_ID, COLLECTION_ID);
  const existingNames = new Set(existingRes.documents.map(d => d.nombre_comercial));

  let insertedCount = 0;
  for (const item of samplePoints) {
    if (existingNames.has(item.nombre_comercial)) {
      console.log(`ℹ️ El punto "${item.nombre_comercial}" ya existe, omitiendo.`);
      continue;
    }

    const doc = await db.createDocument(DB_ID, COLLECTION_ID, ID.unique(), item);
    console.log(`✅ Creado punto UrbanPoint: [${doc.$id}] ${item.nombre_comercial} (${item.localidad})`);
    insertedCount++;
  }

  console.log(`\n🎉 Carga finalizada con éxito. Se agregaron ${insertedCount} puntos de retiro a la base de datos.`);
}

seed().catch(err => {
  console.error("❌ Error ejecutando el seed de pickup points:", err);
  process.exit(1);
});
