import { Client, Databases, ID, Query } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

// Cargar variables de entorno desde .env si existe
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

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const project = process.env.PUBLIC_APPWRITE_PROJECT_ID || '';
const key = process.env.APPWRITE_API_KEY || '';

console.log("Conectando a Appwrite:", { endpoint, project: project ? "OK" : "FALTA", key: key ? "OK" : "FALTA" });

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project)
  .setKey(key);

const db = new Databases(client);

async function testDatabaseFlow() {
  try {
    console.log("\n1. Probando creación de producto de prueba (con iva_pct obligatorio)...");
    const sku = 'SKU-TEST-' + Math.floor(100000 + Math.random() * 900000);
    const slug = 'producto-prueba-' + Math.floor(Math.random() * 10000);
    
    const prodDoc = await db.createDocument('urbanpoint', 'products', ID.unique(), {
      nombre: 'Producto de Prueba Verificado',
      slug: slug,
      sku: sku,
      descripcion: 'Producto de prueba creado para verificar persistencia en Appwrite',
      precio: 15990,
      stock: 25,
      estado: 'borrador',
      iva_pct: 21.0
    });
    console.log("✅ Producto creado con éxito! ID:", prodDoc.$id, "| SKU:", prodDoc.sku);

    console.log("\n2. Probando obtención/creación de perfil de cliente de prueba...");
    const profiles = await db.listDocuments('urbanpoint', 'profiles', [Query.limit(1)]);
    let profileId = '';
    if (profiles.documents.length > 0) {
      profileId = profiles.documents[0].$id;
      console.log("✅ Cliente de prueba existente encontrado! ID:", profileId, "| Nombre:", profiles.documents[0].nombre);
    } else {
      const newProf = await db.createDocument('urbanpoint', 'profiles', ID.unique(), {
        nombre: 'Cliente de Prueba',
        email: 'cliente.prueba@urbanpoint.com.ar',
        telefono: '1122334455',
        role: 'cliente'
      });
      profileId = newProf.$id;
      console.log("✅ Cliente de prueba creado con éxito! ID:", profileId);
    }

    console.log("\n3. Creando pedido de prueba en la colección 'orders'...");
    const orderNum = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
    const payload: any = {
      numero: orderNum,
      customer_id: profileId,
      subtotal: 15990,
      total: 15990,
      estado: 'pendiente_pago',
      fulfillment: 'retiro'
    };
    const orderDoc = await db.createDocument('urbanpoint', 'orders', ID.unique(), payload);
    console.log("✅ Pedido de prueba creado con éxito! ID:", orderDoc.$id, "| Número:", orderDoc.numero, "| Total: $", orderDoc.total);

    console.log("\n🎉 ¡FLUJO COMPLETO EN LA BASE DE DATOS VERIFICADO CON ÉXITO!");
  } catch (err: any) {
    console.error("❌ Error en verificación de base de datos:", err.message || err);
  }
}

testDatabaseFlow();
