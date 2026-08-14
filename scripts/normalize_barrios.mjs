import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY;

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';
const COLLECTION_ID = 'pickup_points';

const BARRIO_RULES = [
  // GBA - Provincia de Buenos Aires
  {
    barrio: 'Vicente López',
    provincia: 'Buenos Aires',
    keywords: ['MAIPU', 'SAN MARTIN', 'GUTIERREZ', 'ZAPATA', 'ARISTOBULO'],
    match: (dir, lat, lng) => lat > -34.540 || (dir.includes('MAIPU') && parseInt(dir.replace(/\D/g, '') || '0') < 2000)
  },
  {
    barrio: 'Olivos',
    provincia: 'Buenos Aires',
    keywords: ['UGARTE', 'VILLATE', 'PELLIZA', 'CORRIENTES (OLIVOS)'],
    match: (dir, lat, lng) => dir.includes('MAIPU') && parseInt(dir.replace(/\D/g, '') || '0') >= 2000
  },

  // CABA Barrios
  {
    barrio: 'Nuñez',
    provincia: 'CABA',
    keywords: ['ARIAS', 'DEHEZA', 'RAMALLO', 'CORREA', 'PICO', 'CRISOLOGO', 'MANZANARES', 'JARAMILLO', 'IBERA', 'QUESADA', 'GUAYRA', 'CAMPOS SALLES', 'PEDRAZA', '11 DE SEPTIEMBRE', 'ARRIBEÑOS', 'CUBA', 'ARCOS', 'MONTAÑESES'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('CABILDO') && num >= 3000) return true;
      if (dir.includes('LIBERTADOR') && num >= 3500) return true;
      if (dir.includes('CONGRESO') && num < 2000) return true;
      if (lat < -34.538 && lat > -34.560 && lng < -58.440) return true;
      return false;
    }
  },
  {
    barrio: 'Saavedra',
    provincia: 'CABA',
    keywords: ['PINTO', 'BALBIN', 'R BALBIN', 'GARCIA DEL RIO', 'DONADO', 'HOLMBERG', 'LEBRETON', 'SAAVEDRA', 'ACHARAVAL', 'POSTA', 'PAROISSIEN'],
    match: (dir, lat, lng) => {
      if (dir.includes('BALBIN')) return true;
      if (dir.includes('PINTO') && !dir.includes('PINZON')) return true;
      if (lat < -34.542 && lat > -34.565 && lng <= -58.470) return true;
      return false;
    }
  },
  {
    barrio: 'Villa Urquiza',
    provincia: 'CABA',
    keywords: ['TRIUNVIRATO', 'BUCARELLI', 'BAUNESS', 'NAHUEL HUAPI', 'CULLEN', 'TAMBORINI', 'MILLER', 'DIAZ COLODRERO', 'PACHECO', 'CAPDEVILA'],
    match: (dir, lat, lng) => {
      if (dir.includes('TRIUNVIRATO')) return true;
      if (dir.includes('MONROE') && parseInt(dir.replace(/\D/g, '') || '0') >= 4500) return true;
      if (dir.includes('OLAZABAL') && parseInt(dir.replace(/\D/g, '') || '0') >= 4500) return true;
      if (dir.includes('MENDOZA') && parseInt(dir.replace(/\D/g, '') || '0') >= 4500) return true;
      if (lat >= -34.582 && lat <= -34.560 && lng <= -58.480 && lng >= -58.505) return true;
      return false;
    }
  },
  {
    barrio: 'Villa Pueyrredón',
    provincia: 'CABA',
    keywords: ['CONSTITUYENTES', 'MOSCONI', 'COCHRANE', 'CURUPAYTI', 'GRIJALVA'],
    match: (dir, lat, lng) => {
      if (dir.includes('CONSTITUYENTES')) return true;
      if (dir.includes('MOSCONI')) return true;
      return false;
    }
  },
  {
    barrio: 'Belgrano',
    provincia: 'CABA',
    keywords: ['JURAMENTO', 'MENDOZA', 'OLAZABAL', 'LA PAMPA', 'ECHEVERRIA', 'SUCRE', 'ROOSEVELT', 'BLANCO ENCALADA', 'AMENABAR', 'CRAMER', 'MOLDES', 'VUELTA DE OBLIGADO', 'VIRREY DEL PINO', 'VIRREY LORETO', 'VIRREY ARREDONDO', 'ZABALA', 'AGUILAR', 'TEODORO GARCIA', 'ARCE'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('CABILDO') && num >= 700 && num < 3000) return true;
      if (dir.includes('CONGRESO') && num >= 1500 && num < 3500) return true;
      if (dir.includes('MONROE') && num >= 1500 && num < 4500) return true;
      if (dir.includes('LIBERTADOR') && num >= 1500 && num < 3500) return true;
      if (lat >= -34.575 && lat <= -34.550 && lng >= -58.472 && lng <= -58.435) return true;
      return false;
    }
  },
  {
    barrio: 'Colegiales',
    provincia: 'CABA',
    keywords: ['LACROZE', 'F LACROZE', 'ALVAREZ THOMAS', 'ELCANO', 'CESPEDES', 'VIRREY OLAGUER', 'CONDE', 'FREIRE', 'SUPERI', 'ENRIQUE MARTINEZ', 'DELGADO', 'ZAPIOLA'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('LACROZE') || dir.includes('F LACROZE')) return true;
      if (dir.includes('ALVAREZ THOMAS') && num < 1500) return true;
      if (lat >= -34.580 && lat <= -34.568 && lng >= -58.460 && lng <= -58.440) return true;
      return false;
    }
  },
  {
    barrio: 'Chacarita',
    provincia: 'CABA',
    keywords: ['WARNES', 'NEWBERY', 'JORGE NEWBERY', 'SANTOS DUMONT', 'CONCEPCION ARENAL', 'FOREST', 'GUZMAN', 'LEIVA', 'RODNEY', 'CHARLONE', 'GIRIBONE'],
    match: (dir, lat, lng) => {
      if (dir.includes('WARNES')) return true;
      if (dir.includes('NEWBERY') || dir.includes('JORGE NEWBERY')) return true;
      if (dir.includes('CORRIENTES') && parseInt(dir.replace(/\D/g, '') || '0') >= 6000) return true;
      if (lat >= -34.595 && lat <= -34.578 && lng >= -58.460 && lng <= -58.442) return true;
      return false;
    }
  },
  {
    barrio: 'Palermo',
    provincia: 'CABA',
    keywords: ['SANTA FE', 'DORREGO', 'BORGES', 'GURRUCHAGA', 'THAMES', 'ARMENIA', 'HUMBOLDT', 'FITZ ROY', 'BONPLAND', 'RAVIGNANI', 'AREVALO', 'ARGUIBEL', 'MATIENZO', 'BAEZ', 'COSTA RICA', 'HONDURAS', 'GORRITI', 'NICARAGUA', 'CABRERA', 'SOLER', 'GUATEMALA', 'CHARCAS', 'GUISE', 'ARAOZ', 'JULIAN ALVAREZ', 'MALABIA', 'SCALABRINI ORTIZ', 'CORONEL DIAZ', 'LAS HERAS'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('SANTA FE') && num >= 2200 && num <= 5300) return true;
      if (dir.includes('CORDOBA') && num >= 3600 && num <= 5800) return true;
      if (dir.includes('LIBERTADOR') && num >= 500 && num < 1800) return true;
      if (dir.includes('SCALABRINI ORTIZ') && num >= 500 && num <= 2600) return true;
      if (lat >= -34.598 && lat <= -34.565 && lng >= -58.445 && lng <= -58.395) return true;
      return false;
    }
  },
  {
    barrio: 'Recoleta',
    provincia: 'CABA',
    keywords: ['JUNCAL', 'FRENCH', 'PEÑA', 'PACHECO DE MELO', 'VICENTE LOPEZ', 'GUIDO', 'QUINTANA', 'JUNIN', 'AYACUCHO', 'RIOBAMBA', 'AZCUENAGA', 'LARREA', 'URIBURU', 'LAPRIDA', 'ANCHORENA', 'AUSTRIA', 'TAGLE'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('SANTA FE') && num >= 1000 && num < 2200) return true;
      if (dir.includes('LAS HERAS') && num >= 1000 && num < 2600) return true;
      if (dir.includes('PUEYRREDON') && num >= 1000 && num <= 2200) return true;
      if (dir.includes('CALLAO') && num >= 900 && num <= 2100) return true;
      if (lat >= -34.599 && lat <= -34.580 && lng >= -58.405 && lng <= -58.380) return true;
      return false;
    }
  },
  {
    barrio: 'Villa Crespo',
    provincia: 'CABA',
    keywords: ['ESTADO DE ISRAEL', 'ANGEL GALLARDO', 'JUANA DE ARCO', 'MURILLO', 'PADILLA', 'CAMARGO', 'LOYOLA', 'RAMIREZ DE VELASCO', 'VERA', 'VILLARROEL', 'MUÑECAS', 'AGUIRRE'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('CORRIENTES') && num >= 4500 && num < 6000) return true;
      if (dir.includes('SCALABRINI ORTIZ') && num >= 1 && num < 1000) return true;
      if (lat >= -34.608 && lat <= -34.590 && lng >= -58.452 && lng <= -58.428) return true;
      return false;
    }
  },
  {
    barrio: 'Almagro',
    provincia: 'CABA',
    keywords: ['MEDRANO', 'CASTRO BARROS', 'BOEDO', 'YATAY', 'GASCON', 'ACUÑA DE FIGUEROA', 'RAWSON', 'PRINGLES', 'LERMA'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('CORRIENTES') && num >= 3200 && num < 4500) return true;
      if (dir.includes('DIAZ VELEZ') && num >= 3500 && num < 4800) return true;
      if (lat >= -34.618 && lat <= -34.600 && lng >= -58.435 && lng <= -58.410) return true;
      return false;
    }
  },
  {
    barrio: 'Caballito',
    provincia: 'CABA',
    keywords: ['GAONA', 'ACOYTE', 'JOSE MARIA MORENO', 'LA PLATA', 'FORMOSA', 'GUAYAQUIL', 'ROSARIO', 'ALBERDI', 'PEDRO GOYENA', 'DIRECTORIO', 'VALLE', 'DOBLAS', 'BEAUCHEF', 'VIEL', 'SENILLOSA', 'HIDALGO', 'CAMPICHUELO'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('RIVADAVIA') && num >= 4000 && num < 6500) return true;
      if (dir.includes('GAONA') && num < 2000) return true;
      if (dir.includes('AVELLANEDA') && num < 2000) return true;
      if (dir.includes('DIAZ VELEZ') && num >= 4800) return true;
      if (lat >= -34.628 && lat <= -34.605 && lng >= -58.455 && lng <= -58.425) return true;
      return false;
    }
  },
  {
    barrio: 'Flores',
    provincia: 'CABA',
    keywords: ['SAN PEDRITO', 'CARABOBO', 'VARELA', 'BOYACA', 'ARGERICH', 'HELGUERA', 'CUENCA'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('RIVADAVIA') && num >= 6500) return true;
      if (dir.includes('GAONA') && num >= 2000) return true;
      if (dir.includes('AVELLANEDA') && num >= 2000) return true;
      if (lat >= -34.638 && lat <= -34.615 && lng >= -58.485 && lng <= -58.455) return true;
      return false;
    }
  },
  {
    barrio: 'Retiro / Centro',
    provincia: 'CABA',
    keywords: ['FLORIDA', 'LAVALLE', 'MAIPU', 'SUIPACHA', 'ESMERALDA', 'PELLEGRINI', 'SAN MARTIN', 'RECONQUISTA', '25 DE MAYO', 'ALEM', 'PASEO COLON'],
    match: (dir, lat, lng) => {
      const num = parseInt(dir.replace(/\D/g, '') || '0');
      if (dir.includes('CORRIENTES') && num < 1500) return true;
      if (dir.includes('CORDOBA') && num < 1500) return true;
      if (dir.includes('SANTA FE') && num < 1000) return true;
      if (lat >= -34.608 && lat <= -34.588 && lng >= -58.385 && lng <= -58.365) return true;
      return false;
    }
  },
  {
    barrio: 'San Telmo',
    provincia: 'CABA',
    keywords: ['DEFENSA', 'BOLIVAR', 'PERU', 'CHACABUCO', 'PIEDRAS', 'TACUARI', 'CASEROS', 'MONTES DE OCA'],
    match: (dir, lat, lng) => {
      if (lat >= -34.625 && lat <= -34.610 && lng >= -58.380 && lng <= -58.360) return true;
      return false;
    }
  }
];

export function determineBarrio(direccion, lat, lng, provinciaActual) {
  const upperDir = (direccion || '').toUpperCase();

  for (const rule of BARRIO_RULES) {
    for (const kw of rule.keywords) {
      if (upperDir.includes(kw)) {
        return { barrio: rule.barrio, provincia: rule.provincia };
      }
    }
  }

  for (const rule of BARRIO_RULES) {
    if (rule.match && rule.match(upperDir, lat, lng)) {
      return { barrio: rule.barrio, provincia: rule.provincia };
    }
  }

  if (provinciaActual === 'Buenos Aires' || lat > -34.545) {
    return { barrio: 'Vicente López', provincia: 'Buenos Aires' };
  }
  
  if (lat < -34.565 && lng < -58.455) {
    return { barrio: 'Belgrano', provincia: 'CABA' };
  }

  return { barrio: 'Belgrano', provincia: 'CABA' };
}

async function run() {
  console.log('🔄 Iniciando normalización rápida por lotes en Appwrite...');

  let rawDocs = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DB_ID, COLLECTION_ID, [
      Query.limit(100),
      Query.offset(offset)
    ]);
    rawDocs.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }

  console.log(`📋 Se encontraron ${rawDocs.length} Puntos de Retiro en total.`);

  const updateTasks = [];
  const barrioCounts = {};

  for (const doc of rawDocs) {
    const { barrio, provincia } = determineBarrio(
      doc.direccion || '',
      Number(doc.lat) || -34.580,
      Number(doc.lng) || -58.440,
      doc.provincia
    );

    barrioCounts[barrio] = (barrioCounts[barrio] || 0) + 1;

    if (doc.localidad !== barrio || doc.provincia !== provincia) {
      updateTasks.push({
        id: doc.$id,
        payload: { localidad: barrio, provincia: provincia }
      });
    }
  }

  const chunkSize = 20;
  let updatedCount = 0;
  for (let i = 0; i < updateTasks.length; i += chunkSize) {
    const chunk = updateTasks.slice(i, i + chunkSize);
    await Promise.all(chunk.map(t => db.updateDocument(DB_ID, COLLECTION_ID, t.id, t.payload)));
    updatedCount += chunk.length;
    console.log(`✅ [${updatedCount}/${updateTasks.length}] Documentos actualizados...`);
  }

  console.log(`\n🎉 Normalización finalizada! Se actualizaron ${updatedCount} documentos.`);
  console.log('\n📊 Distribución final por Barrio / Localidad:');
  console.log(barrioCounts);
}

run().catch(console.error);
