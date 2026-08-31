import { Client, Databases, Query } from 'node-appwrite';
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

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const project = process.env.PUBLIC_APPWRITE_PROJECT_ID || '';
const key = process.env.APPWRITE_API_KEY || '';

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project)
  .setKey(key);

const db = new Databases(client);

async function testUpdateProductFlow() {
  try {
    console.log("1. Obteniendo un producto para probar edición...");
    const res = await db.listDocuments('urbanpoint', 'products', [Query.limit(1)]);
    if (res.documents.length === 0) {
      console.log("No hay productos para actualizar");
      return;
    }

    const prod = res.documents[0];
    console.log("Producto seleccionado:", prod.nombre, "| ID:", prod.$id);
    console.log("Atributos existentes en 'products':", Object.keys(prod));

    console.log("2. Actualizando datos del producto en Appwrite...");
    const updatedDoc = await db.updateDocument('urbanpoint', 'products', prod.$id, {
      nombre: prod.nombre,
      descripcion: prod.descripcion || 'Producto actualizado con éxito',
      precio: prod.precio,
      stock: prod.stock,
      estado: prod.estado
    });

    console.log("✅ ¡PRODUCTO ACTUALIZADO Y GUARDADO CON ÉXITO EN APPWRITE!");
    console.log("   ID:", updatedDoc.$id);
    console.log("   Nombre:", updatedDoc.nombre);
    console.log("   Precio:", updatedDoc.precio / 100);
    console.log("   Stock:", updatedDoc.stock);
  } catch (err: any) {
    console.error("❌ Error al actualizar producto:", err.message || err);
  }
}

testUpdateProductFlow();
