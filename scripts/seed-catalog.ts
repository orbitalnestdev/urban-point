import { Client, Databases, ID } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY!;

if (!apiKey) {
  console.error("Falta APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function seed() {
  console.log("Creando categoría...");
  const categoria = await db.createDocument(DB_ID, 'categories', ID.unique(), {
    slug: 'yerbas-y-infusiones',
    nombre: 'Yerbas e Infusiones',
    orden: 1
  });

  console.log("Categoría creada:", categoria.$id);

  const productos = [
    {
      sku: 'YRB-PLY-500',
      slug: 'yerba-playadito-500g',
      nombre: 'Yerba Mate Playadito 500g',
      descripcion: 'Yerba mate elaborada con palo, suave y rendidora.',
      marca: 'Playadito',
      estado: 'activo',
      precio: 215000, // $2150.00
      precio_comparativo: 250000,
      costo: 150000,
      iva_pct: 2100, // 21.00%
      peso_gr: 500,
      stock: 100,
      permite_retiro: true,
      permite_envio: true,
      categoria_id: categoria.$id
    },
    {
      sku: 'YRB-CBA-1000',
      slug: 'yerba-canarias-1kg',
      nombre: 'Yerba Mate Canarias 1kg',
      descripcion: 'Yerba mate uruguaya sin palo, intenso sabor.',
      marca: 'Canarias',
      estado: 'activo',
      precio: 520000, // $5200.00
      precio_comparativo: 550000,
      costo: 380000,
      iva_pct: 2100,
      peso_gr: 1000,
      stock: 50,
      permite_retiro: true,
      permite_envio: true,
      categoria_id: categoria.$id
    },
    {
      sku: 'CAF-NES-170',
      slug: 'cafe-nescafe-gold-170g',
      nombre: 'Café Instantáneo Nescafé Gold 170g',
      descripcion: 'Café instantáneo premium liofilizado.',
      marca: 'Nescafé',
      estado: 'activo',
      precio: 850000, // $8500.00
      precio_comparativo: 920000,
      costo: 600000,
      iva_pct: 2100,
      peso_gr: 170,
      stock: 20,
      permite_retiro: true,
      permite_envio: false,
      categoria_id: categoria.$id
    }
  ];

  for (const prod of productos) {
    console.log(`Creando producto: ${prod.nombre}`);
    const p = await db.createDocument(DB_ID, 'products', ID.unique(), prod);
    
    // Asignar una imagen dummy
    await db.createDocument(DB_ID, 'product_images', ID.unique(), {
      product_id: p.$id,
      url: `https://ui-avatars.com/api/?name=${encodeURIComponent(prod.nombre)}&background=random&size=512`,
      alt: prod.nombre,
      orden: 1
    });
  }

  console.log("Catálogo de prueba inyectado exitosamente.");
}

seed().catch(console.error);
