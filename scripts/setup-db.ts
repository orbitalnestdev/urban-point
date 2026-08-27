import { Client, Databases, Storage, Users, ID, Permission, Role } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

// 1. Setup client
const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY!;

if (!apiKey) {
  console.error("Falta APPWRITE_API_KEY en las variables de entorno.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function createDatabase() {
  try {
    await db.get(DB_ID);
    console.log(`Database ${DB_ID} ya existe.`);
  } catch (error: any) {
    if (error.code === 404) {
      await db.create(DB_ID, 'UrbanPoint Database');
      console.log(`Database ${DB_ID} creada exitosamente.`);
    } else {
      throw error;
    }
  }
}

async function createCollection(name: string, id: string, createAttributes: () => Promise<void>) {
  try {
    await db.getCollection(DB_ID, id);
    console.log(`Colección ${name} (${id}) ya existe.`);
  } catch (e: any) {
    if (e.code === 404) {
      await db.createCollection(DB_ID, id, name);
      console.log(`Colección ${name} creada.`);
      await createAttributes();
    } else {
      throw e;
    }
  }
}

async function setup() {
  console.log("Iniciando setup de la base de datos...");
  await createDatabase();
  
  // ==========================================
  // 1. perfiles e identidades
  // ==========================================
  await createCollection('Profiles', 'profiles', async () => {
    await db.createStringAttribute(DB_ID, 'profiles', 'user_id', 36, true);
    await db.createEnumAttribute(DB_ID, 'profiles', 'role', ['cliente', 'canillita', 'admin'], true);
    await db.createStringAttribute(DB_ID, 'profiles', 'nombre', 255, true);
    await db.createStringAttribute(DB_ID, 'profiles', 'telefono', 50, false);
    await db.createEmailAttribute(DB_ID, 'profiles', 'email', true);
    await db.createIntegerAttribute(DB_ID, 'profiles', 'saldo_disponible_centavos', false, 0, 999999999, 0);
  });

  await createCollection('Pickup Points', 'pickup_points', async () => {
    await db.createRelationshipAttribute(DB_ID, 'pickup_points', 'profiles', 'manyToOne', false, 'profile_id', 'pickup_points', 'setNull');
    await db.createStringAttribute(DB_ID, 'pickup_points', 'nombre_comercial', 255, true);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'direccion', 255, true);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'localidad', 255, true);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'provincia', 255, true);
    await db.createFloatAttribute(DB_ID, 'pickup_points', 'lat', true);
    await db.createFloatAttribute(DB_ID, 'pickup_points', 'lng', true);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'horarios', 1000, true);
    await db.createEnumAttribute(DB_ID, 'pickup_points', 'estado', ['pendiente', 'activo', 'suspendido', 'baja'], true);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'cbu', 50, false);
    await db.createStringAttribute(DB_ID, 'pickup_points', 'condicion_fiscal', 50, false);
    // Atributo espacial
    console.log("NOTA: Crear atributo espacial 'ubicacion' de forma manual o via script si SDK lo soporta (Appwrite 1.8).");
  });

  await createCollection('Canillita Applications', 'canillita_applications', async () => {
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'nombre', 255, true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'apellido', 255, true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'dni', 50, true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'telefono', 50, true);
    await db.createEmailAttribute(DB_ID, 'canillita_applications', 'email', true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'nombre_comercial', 255, true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'direccion', 255, true);
    await db.createFloatAttribute(DB_ID, 'canillita_applications', 'lat', true);
    await db.createFloatAttribute(DB_ID, 'canillita_applications', 'lng', true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'horarios', 1000, true);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'foto_url', 1000, false);
    await db.createEnumAttribute(DB_ID, 'canillita_applications', 'estado', ['solicitado', 'en_revision', 'aprobado', 'rechazado'], false, 'solicitado');
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'motivo_rechazo', 1000, false);
    await db.createStringAttribute(DB_ID, 'canillita_applications', 'ip_address', 50, false);
  });

  // ==========================================
  // 2. Referidos
  // ==========================================
  await createCollection('Referral Codes', 'referral_codes', async () => {
    await db.createStringAttribute(DB_ID, 'referral_codes', 'code', 50, true);
    await db.createRelationshipAttribute(DB_ID, 'referral_codes', 'profiles', 'manyToOne', false, 'owner_id', 'referral_codes', 'setNull');
    await db.createBooleanAttribute(DB_ID, 'referral_codes', 'activo', false, true);
  });

  await createCollection('Referral Attributions', 'referral_attributions', async () => {
    await db.createRelationshipAttribute(DB_ID, 'referral_attributions', 'referral_codes', 'manyToOne', false, 'code_id', 'referral_attributions', 'setNull');
    await db.createRelationshipAttribute(DB_ID, 'referral_attributions', 'profiles', 'manyToOne', false, 'customer_id', 'referral_attributions', 'setNull');
    await db.createDatetimeAttribute(DB_ID, 'referral_attributions', 'first_seen_at', true);
    await db.createDatetimeAttribute(DB_ID, 'referral_attributions', 'expires_at', true);
    await db.createStringAttribute(DB_ID, 'referral_attributions', 'origen', 255, false);
  });

  // ==========================================
  // 3. Catálogo
  // ==========================================
  await createCollection('Categories', 'categories', async () => {
    await db.createStringAttribute(DB_ID, 'categories', 'slug', 255, true);
    await db.createStringAttribute(DB_ID, 'categories', 'nombre', 255, true);
    await db.createIntegerAttribute(DB_ID, 'categories', 'orden', false, 0, 9999, 0);
  });

  await createCollection('Products', 'products', async () => {
    await db.createStringAttribute(DB_ID, 'products', 'sku', 100, true);
    await db.createStringAttribute(DB_ID, 'products', 'slug', 255, true);
    await db.createStringAttribute(DB_ID, 'products', 'nombre', 255, true);
    await db.createStringAttribute(DB_ID, 'products', 'descripcion', 5000, false);
    await db.createRelationshipAttribute(DB_ID, 'products', 'categories', 'manyToOne', false, 'categoria_id', 'products', 'setNull');
    await db.createStringAttribute(DB_ID, 'products', 'marca', 255, false);
    await db.createEnumAttribute(DB_ID, 'products', 'estado', ['borrador', 'activo', 'pausado'], false, 'borrador');
    await db.createIntegerAttribute(DB_ID, 'products', 'precio', true, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'products', 'precio_comparativo', false, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'products', 'costo', false, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'products', 'iva_pct', true, 0, 10000);
    await db.createIntegerAttribute(DB_ID, 'products', 'peso_gr', false, 0, 999999);
    await db.createIntegerAttribute(DB_ID, 'products', 'stock', false, 0, 999999, 0);
    await db.createIntegerAttribute(DB_ID, 'products', 'stock_reservado', false, 0, 999999, 0);
    await db.createBooleanAttribute(DB_ID, 'products', 'permite_retiro', false, true);
    await db.createBooleanAttribute(DB_ID, 'products', 'permite_envio', false, true);

    // Fijado en la vitrina. El panel de admin ya tenía el checkbox y la action
    // lo enviaba, pero el atributo no existía: se escribía al vacío y el
    // producto "destacado" duraba hasta que se cargaba otro más nuevo.
    await db.createBooleanAttribute(DB_ID, 'products', 'destacado', false, false);

    // Modos de precio por nivel. Los lee el formulario de edición para los
    // selectores "Heredar / Override Porcentaje / Precio Fijo Manual", y sin
    // ellos updateProduct mandaba nueve campos inexistentes: pasaba los diez
    // reintentos de escribirDocumentoTolerante y guardar un producto fallaba
    // con "demasiados atributos desconocidos".
    for (const nivel of ['distribuidor', 'canillita', 'publico']) {
      await db.createEnumAttribute(DB_ID, 'products', `${nivel}_mode`, ['inherit', 'percent', 'fixed'], false, 'inherit');
      await db.createFloatAttribute(DB_ID, 'products', `${nivel}_percent`, false);
      await db.createIntegerAttribute(DB_ID, 'products', `${nivel}_fixed_price`, false, 0, 999999999);
    }
  });

  await createCollection('Product Images', 'product_images', async () => {
    await db.createRelationshipAttribute(DB_ID, 'product_images', 'products', 'manyToOne', false, 'product_id', 'product_images', 'setNull');
    await db.createStringAttribute(DB_ID, 'product_images', 'url', 1000, true);
    await db.createStringAttribute(DB_ID, 'product_images', 'alt', 255, false);
    await db.createIntegerAttribute(DB_ID, 'product_images', 'orden', false, 0, 999, 0);
  });

  // ==========================================
  // 4. Pedidos
  // ==========================================
  await createCollection('Orders', 'orders', async () => {
    await db.createStringAttribute(DB_ID, 'orders', 'numero', 50, true);
    await db.createRelationshipAttribute(DB_ID, 'orders', 'profiles', 'manyToOne', false, 'customer_id', 'orders', 'setNull');
    await db.createEnumAttribute(DB_ID, 'orders', 'estado', ['pendiente_pago', 'pagado', 'preparando', 'despachado', 'entregado', 'en_punto', 'retirado', 'cancelado', 'reembolsado'], true);
    await db.createEnumAttribute(DB_ID, 'orders', 'fulfillment', ['envio', 'retiro'], true);
    await db.createRelationshipAttribute(DB_ID, 'orders', 'pickup_points', 'manyToOne', false, 'pickup_point_id', 'orders', 'setNull');
    await db.createStringAttribute(DB_ID, 'orders', 'direccion_envio', 1000, false);
    await db.createIntegerAttribute(DB_ID, 'orders', 'subtotal', true, 0, 999999999);

    // Nivel de precio con el que se cerró la compra. Es lo que hace cumplir la
    // regla de que comisión y margen son excluyentes: sin este atributo,
    // resolverComisiones leía `order.price_tier || 'publico'` y devengaba
    // comisión en TODOS los pedidos, así que un canillita se llevaba el
    // descuento y además la comisión.
    await db.createEnumAttribute(DB_ID, 'orders', 'price_tier', ['publico', 'canillita', 'distribuidor'], false, 'publico');

    // Marca de idempotencia del descuento de stock. La necesita el camino de
    // comisión cero, que no crea asientos y por lo tanto no puede apoyarse en
    // el libro para saber si ya se procesó.
    await db.createBooleanAttribute(DB_ID, 'orders', 'stock_descontado', false, false);
    await db.createIntegerAttribute(DB_ID, 'orders', 'descuento', false, 0, 999999999, 0);
    await db.createIntegerAttribute(DB_ID, 'orders', 'costo_envio', false, 0, 999999999, 0);
    await db.createIntegerAttribute(DB_ID, 'orders', 'total', true, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'orders', 'comision_total_centavos', false, 0, 999999999, 0);
    await db.createRelationshipAttribute(DB_ID, 'orders', 'referral_codes', 'manyToOne', false, 'referral_code_id', 'orders', 'setNull');
    await db.createStringAttribute(DB_ID, 'orders', 'pickup_code_hash', 255, false);
    await db.createStringAttribute(DB_ID, 'orders', 'mp_preference_id', 255, false);
    await db.createStringAttribute(DB_ID, 'orders', 'mp_payment_id', 255, false);
    await db.createStringAttribute(DB_ID, 'orders', 'mp_status', 100, false);
    await db.createDatetimeAttribute(DB_ID, 'orders', 'paid_at', false);
    await db.createDatetimeAttribute(DB_ID, 'orders', 'entregado_at', false);
  });

  await createCollection('Order Items', 'order_items', async () => {
    await db.createRelationshipAttribute(DB_ID, 'order_items', 'orders', 'manyToOne', false, 'order_id', 'order_items', 'setNull');
    await db.createRelationshipAttribute(DB_ID, 'order_items', 'products', 'manyToOne', false, 'product_id', 'order_items', 'setNull');
    await db.createStringAttribute(DB_ID, 'order_items', 'sku_snapshot', 100, true);
    await db.createStringAttribute(DB_ID, 'order_items', 'nombre_snapshot', 255, true);
    await db.createIntegerAttribute(DB_ID, 'order_items', 'precio_unitario', true, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'order_items', 'cantidad', true, 1, 9999);
    await db.createIntegerAttribute(DB_ID, 'order_items', 'subtotal', true, 0, 999999999);
    await db.createIntegerAttribute(DB_ID, 'order_items', 'comision_tasa_bp', false, 0, 10000);
    await db.createIntegerAttribute(DB_ID, 'order_items', 'comision_monto_centavos', false, 0, 999999999);
  });

  await createCollection('Order Events', 'order_events', async () => {
    await db.createRelationshipAttribute(DB_ID, 'order_events', 'orders', 'manyToOne', false, 'order_id', 'order_events', 'setNull');
    await db.createStringAttribute(DB_ID, 'order_events', 'de_estado', 100, false);
    await db.createStringAttribute(DB_ID, 'order_events', 'a_estado', 100, true);
    await db.createRelationshipAttribute(DB_ID, 'order_events', 'profiles', 'manyToOne', false, 'actor_id', 'order_events', 'setNull');
    await db.createStringAttribute(DB_ID, 'order_events', 'motivo', 255, false);
    await db.createStringAttribute(DB_ID, 'order_events', 'metadata', 2000, false);
  });

  // ==========================================
  // 5. Comisiones y Ledger
  // ==========================================
  await createCollection('Commission Rules', 'commission_rules', async () => {
    await db.createEnumAttribute(DB_ID, 'commission_rules', 'alcance', ['default', 'canillita', 'categoria', 'canillita_categoria'], true);
    await db.createRelationshipAttribute(DB_ID, 'commission_rules', 'profiles', 'manyToOne', false, 'canillita_id', 'commission_rules', 'setNull');
    await db.createRelationshipAttribute(DB_ID, 'commission_rules', 'categories', 'manyToOne', false, 'categoria_id', 'commission_rules', 'setNull');
    await db.createEnumAttribute(DB_ID, 'commission_rules', 'tipo', ['porcentaje', 'monto_fijo'], true);
    await db.createIntegerAttribute(DB_ID, 'commission_rules', 'valor', true, 0, 999999999);
    await db.createDatetimeAttribute(DB_ID, 'commission_rules', 'vigente_desde', true);
    await db.createDatetimeAttribute(DB_ID, 'commission_rules', 'vigente_hasta', false);
    await db.createBooleanAttribute(DB_ID, 'commission_rules', 'activo', false, true);
    await db.createRelationshipAttribute(DB_ID, 'commission_rules', 'profiles', 'manyToOne', false, 'creado_por', 'commission_rules_creador', 'setNull');
  });

  await createCollection('Commission Ledger', 'commission_ledger', async () => {
    await db.createRelationshipAttribute(DB_ID, 'commission_ledger', 'profiles', 'manyToOne', false, 'profile_id', 'commission_ledger', 'setNull');
    await db.createRelationshipAttribute(DB_ID, 'commission_ledger', 'orders', 'manyToOne', false, 'order_id', 'commission_ledger', 'setNull');
    await db.createEnumAttribute(DB_ID, 'commission_ledger', 'tipo', ['comision_referido', 'fee_logistica', 'reversa', 'liquidacion', 'ajuste'], true);
    await db.createEnumAttribute(DB_ID, 'commission_ledger', 'estado', ['pendiente', 'disponible', 'liquidado', 'revertido'], true);
    await db.createIntegerAttribute(DB_ID, 'commission_ledger', 'monto_centavos', true, -999999999, 999999999);
    await db.createIntegerAttribute(DB_ID, 'commission_ledger', 'tasa_bp_snapshot', false, 0, 10000);
    await db.createDatetimeAttribute(DB_ID, 'commission_ledger', 'disponible_desde', false);
    await db.createStringAttribute(DB_ID, 'commission_ledger', 'motivo', 255, false);
    await db.createRelationshipAttribute(DB_ID, 'commission_ledger', 'profiles', 'manyToOne', false, 'actor_id', 'commission_ledger_actor', 'setNull');
  });

  await createCollection('Payouts', 'payouts', async () => {
    await db.createRelationshipAttribute(DB_ID, 'payouts', 'profiles', 'manyToOne', false, 'profile_id', 'payouts', 'setNull');
    await db.createDatetimeAttribute(DB_ID, 'payouts', 'periodo_desde', true);
    await db.createDatetimeAttribute(DB_ID, 'payouts', 'periodo_hasta', true);
    await db.createIntegerAttribute(DB_ID, 'payouts', 'monto_centavos', true, 0, 999999999);
    await db.createEnumAttribute(DB_ID, 'payouts', 'estado', ['pendiente', 'aprobado', 'pagado', 'rechazado'], true);
    await db.createStringAttribute(DB_ID, 'payouts', 'medio_pago', 100, false);
    await db.createStringAttribute(DB_ID, 'payouts', 'referencia_pago', 255, false);
    await db.createStringAttribute(DB_ID, 'payouts', 'comprobante_url', 1000, false);
    await db.createDatetimeAttribute(DB_ID, 'payouts', 'pagado_at', false);
  });

  // ==========================================
  // 6. Configuración
  // ==========================================
  await createCollection('Settings', 'settings', async () => {
    await db.createStringAttribute(DB_ID, 'settings', 'key', 100, true);
    await db.createStringAttribute(DB_ID, 'settings', 'value', 5000, true);
  });

  console.log("Creación de esquema de colecciones y atributos completada (no se definieron los índices únicos, solo atributos).");
}

setup().catch(console.error);
