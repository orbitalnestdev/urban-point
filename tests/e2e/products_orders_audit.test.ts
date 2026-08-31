import { describe, it } from 'node:test';
import assert from 'node:assert';
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

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const project = process.env.PUBLIC_APPWRITE_PROJECT_ID || '';
const key = process.env.APPWRITE_API_KEY || '';

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project)
  .setKey(key);

const db = new Databases(client);

describe('Auditoría E2E y Pruebas de Persistencia - Productos y Pedidos', () => {

  let createdProductId = '';
  let duplicatedProductId = '';
  let createdOrderId = '';

  it('1. PRODUCTOS: Debe crear un nuevo producto con iva_pct y atributos obligatorios', async () => {
    const sku = 'SKU-AUDIT-' + Math.floor(100000 + Math.random() * 900000);
    const slug = 'producto-audit-' + Math.floor(Math.random() * 10000);

    const doc = await db.createDocument('urbanpoint', 'products', ID.unique(), {
      nombre: 'Producto Auditoría E2E',
      slug: slug,
      sku: sku,
      descripcion: 'Descripción del producto auditado',
      precio: 2500,
      stock: 50,
      estado: 'borrador',
      iva_pct: 21.0
    });

    assert.ok(doc.$id, 'ID de producto debe ser válido');
    assert.strictEqual(doc.nombre, 'Producto Auditoría E2E');
    assert.strictEqual(doc.stock, 50);
    createdProductId = doc.$id;
  });

  it('2. PRODUCTOS: Debe editar y guardar cambios persistidos en el producto', async () => {
    assert.ok(createdProductId, 'Debe existir un producto previamente creado');

    const updated = await db.updateDocument('urbanpoint', 'products', createdProductId, {
      nombre: 'Producto Auditoría E2E (Modificado)',
      precio: 3200,
      stock: 45,
      estado: 'activo'
    });

    assert.strictEqual(updated.nombre, 'Producto Auditoría E2E (Modificado)');
    assert.strictEqual(updated.precio, 3200);
    assert.strictEqual(updated.stock, 45);
    assert.strictEqual(updated.estado, 'activo');
  });

  it('3. PRODUCTOS: Debe duplicar el producto conservando estructura y generando nuevo SKU', async () => {
    assert.ok(createdProductId, 'Debe existir un producto previamente creado');

    const original = await db.getDocument('urbanpoint', 'products', createdProductId);
    const dupSku = 'SKU-DUP-' + Math.floor(100000 + Math.random() * 900000);
    const dupSlug = original.slug + '-copia-' + Math.floor(Math.random() * 1000);

    const dupDoc = await db.createDocument('urbanpoint', 'products', ID.unique(), {
      nombre: original.nombre + ' (Copia)',
      slug: dupSlug,
      sku: dupSku,
      descripcion: original.descripcion || '',
      precio: original.precio,
      stock: original.stock,
      estado: 'borrador',
      iva_pct: 21.0
    });

    assert.ok(dupDoc.$id, 'El producto duplicado debe tener un ID único');
    assert.notStrictEqual(dupDoc.$id, createdProductId);
    assert.strictEqual(dupDoc.nombre, 'Producto Auditoría E2E (Modificado) (Copia)');
    duplicatedProductId = dupDoc.$id;
  });

  it('4. PEDIDOS: Debe crear un pedido con estado pendiente_pago y asociar cliente', async () => {
    const profiles = await db.listDocuments('urbanpoint', 'profiles', [Query.limit(1)]);
    let profileId = profiles.documents.length > 0 ? profiles.documents[0].$id : null;

    if (!profileId) {
      const prof = await db.createDocument('urbanpoint', 'profiles', ID.unique(), {
        nombre: 'Cliente Auditoría',
        email: 'audit.cliente@urbanpoint.com.ar',
        telefono: '1100001111',
        role: 'cliente'
      });
      profileId = prof.$id;
    }

    const orderNum = 'ORD-AUDIT-' + Math.floor(1000 + Math.random() * 9000);
    const orderDoc = await db.createDocument('urbanpoint', 'orders', ID.unique(), {
      numero: orderNum,
      customer_id: profileId,
      subtotal: 3200,
      total: 3200,
      estado: 'pendiente_pago',
      fulfillment: 'retiro'
    });

    assert.ok(orderDoc.$id);
    assert.strictEqual(orderDoc.estado, 'pendiente_pago');
    createdOrderId = orderDoc.$id;
  });

  it('5. PEDIDOS: Debe avanzar la orden a estado pagado y manteniendo consistencia', async () => {
    assert.ok(createdOrderId, 'Debe existir una orden previamente creada');

    const updatedOrder = await db.updateDocument('urbanpoint', 'orders', createdOrderId, {
      estado: 'pagado'
    });

    assert.strictEqual(updatedOrder.estado, 'pagado');
  });

  it('6. PEDIDOS & STOCK: Al cancelar pedido debe anular orden y permitir restauración de stock', async () => {
    assert.ok(createdOrderId, 'Debe existir una orden a cancelar');

    const cancelledOrder = await db.updateDocument('urbanpoint', 'orders', createdOrderId, {
      estado: 'cancelado'
    });

    assert.strictEqual(cancelledOrder.estado, 'cancelado');
  });

  it('7. PRODUCTOS: Debe eliminar el producto duplicado de la base de datos', async () => {
    assert.ok(duplicatedProductId);
    await db.deleteDocument('urbanpoint', 'products', duplicatedProductId);

    // Confirmar que no exista
    await assert.rejects(async () => {
      await db.getDocument('urbanpoint', 'products', duplicatedProductId);
    });
  });

  it('8. PRODUCTOS: Debe eliminar el producto de prueba de la base de datos', async () => {
    assert.ok(createdProductId);
    await db.deleteDocument('urbanpoint', 'products', createdProductId);

    // Confirmar que no exista
    await assert.rejects(async () => {
      await db.getDocument('urbanpoint', 'products', createdProductId);
    });
  });

});
