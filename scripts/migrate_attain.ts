import { Client, Databases, Storage, Query, ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';

// 1. Setup Env & Appwrite Client
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

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || '')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '')
  .setKey(process.env.APPWRITE_API_KEY || '');

const db = new Databases(client);
const storage = new Storage(client);
const DB_ID = 'urbanpoint';
const COLL_ID = 'products';
const BUCKET_ID = 'products';

// Helper to generate slug
const slugify = (text: string) => text.toString().toLowerCase()
  .replace(/\s+/g, '-')           
  .replace(/[^\w\-]+/g, '')       
  .replace(/\-\-+/g, '-')         
  .replace(/^-+/, '')             
  .replace(/-+$/, '');            

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Iniciando script de limpieza e importación desde Attain...');
  
  // Crear carpeta temporal para imágenes si no existe
  const tmpDir = path.resolve(process.cwd(), 'tmp_img');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  try {
    // Extraer 20 productos de Attain.com.ar
    console.log('\n--- Extrayendo 20 productos de attain.com.ar ---');
    const shopHtml = await fetch('https://attain.com.ar/shop').then(res => res.text());
    
    const productLinks: string[] = [];
    const linkRegex = /<a[^>]*class=\"text-decoration-none\"[^>]*href=\"\/shop\/([^\"]+)\"[^>]*>/g;
    let match;
    while ((match = linkRegex.exec(shopHtml)) !== null) {
      const link = 'https://attain.com.ar/shop/' + match[1];
      if (!productLinks.includes(link)) {
        productLinks.push(link);
      }
    }
    
    const targetLinks = productLinks.slice(0, 20);
    console.log(`Se encontraron ${productLinks.length} enlaces. Procesando ${targetLinks.length} productos real time...`);

    let importedCount = 0;

    for (let i = 0; i < targetLinks.length; i++) {
      const url = targetLinks[i];
      console.log(`\n[${i+1}/${targetLinks.length}] Analizando: ${url}`);
      
      const prodHtml = await fetch(url).then(res => res.text());
      
      // Extract LD-JSON
      const schemaRegex = /<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g;
      let schemaMatch;
      let productData: any = null;
      
      while ((schemaMatch = schemaRegex.exec(prodHtml)) !== null) {
        try {
          const json = JSON.parse(schemaMatch[1].trim());
          const item = Array.isArray(json) ? json[0] : json;
          if (item['@type'] === 'Product') {
            productData = item;
            break;
          }
        } catch(e) { }
      }
      
      if (!productData) {
        console.log(`⚠️ No se encontró schema de producto en ${url}`);
        continue;
      }
      
      // Extraer descripción en HTML
      let descripcionHtml = '';
      const specMatch = prodHtml.match(/<div id="product_specifications"[\s\S]*?<\/div>\s*<\/div>/);
      if (specMatch) {
        descripcionHtml = specMatch[0];
      }

      // Extraer todas las imágenes de la galería (Odoo las ubica en /web/image/product.image/...)
      const galleryImgRegex = /\/web\/image\/(?:product\.image|product\.product|product\.template)\/\d+\/image_1024\/[^"'\s\>]+/g;
      const rawGalleryMatches = prodHtml.match(galleryImgRegex) || [];
      
      const uniqueImgUrls: string[] = [];
      
      // Portada desde og:image si existe
      const ogImgMatch = prodHtml.match(/<meta property="og:image" content="([^"]+)"/);
      if (ogImgMatch && ogImgMatch[1]) {
        uniqueImgUrls.push(ogImgMatch[1]);
      }

      for (const m of rawGalleryMatches) {
        const fullUrl = m.startsWith('http') ? m : `https://attain.com.ar${m}`;
        if (!uniqueImgUrls.includes(fullUrl)) {
          uniqueImgUrls.push(fullUrl);
        }
      }

      let portadaUrl = '';
      const galeriaUrls: string[] = [];

      for (let idx = 0; idx < uniqueImgUrls.length; idx++) {
        const imgUrl = uniqueImgUrls[idx];
        try {
          console.log(`Descargando foto ${idx + 1}/${uniqueImgUrls.length}: ${imgUrl}`);
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const uploadedFile = await storage.createFile(
              BUCKET_ID,
              ID.unique(),
              InputFile.fromBuffer(buffer, 'imagen.jpg'),
              [Permission.read(Role.any())]
            );
            
            const appwriteUrl = `${process.env.PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${uploadedFile.$id}/view?project=${process.env.PUBLIC_APPWRITE_PROJECT_ID}`;
            
            if (idx === 0) {
              portadaUrl = appwriteUrl;
            } else {
              galeriaUrls.push(appwriteUrl);
            }
          }
        } catch (imgErr: any) {
          console.log(`⚠️ Error procesando foto ${idx + 1}: ${imgErr.message}`);
        }
      }

      // Mapear los campos
      const nombre = productData.name || 'Producto Desconocido';
      
      // Omitir si ya existe en la base de datos
      try {
        const existing = await db.listDocuments(DB_ID, COLL_ID, [Query.equal('nombre', nombre)]);
        if (existing.documents.length > 0) {
          console.log(`⏩ Producto "${nombre}" ya existe en el catálogo. Omitiendo...`);
          continue;
        }
      } catch(e) {}
      const gtin = productData.gtin || '';
      const sku = gtin || `SKU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const slug = slugify(nombre) + '-' + crypto.randomBytes(2).toString('hex');
      const costoRaw = productData.offers && productData.offers.price ? parseFloat(productData.offers.price) : 0;
      
      const costoEnCentavos = Math.round(costoRaw * 100); 

      const envioConfig = {
        unidad_venta: 'unidad',
        compra_minima: '',
        compra_maxima: '',
        tamano_pack: '',
        tamano_bulto: '',
        peso_kg: '',
        codigo_barras: gtin, // SE MAPEA GTIN COMO CÓDIGO DE BARRAS AQUI
        dimensiones: { largo: '', ancho: '', alto: '', unit: 'cm' }
      };

      // Detección dinámica de disponibilidad de stock desde esquema JSON-LD
      const availabilityUrl = productData.offers && productData.offers.availability ? String(productData.offers.availability) : '';
      const isAvailable = availabilityUrl.includes('InStock');
      const stockActual = isAvailable ? 50 : 0;
      const estadoProducto = isAvailable ? 'activo' : 'inactivo';

      // Extracción dinámica de Marca desde HTML de especificaciones
      const brandMatch = prodHtml.match(/Marca:\s*([^"&#\\]+)/i);
      const marcaExtraida = brandMatch ? brandMatch[1].trim() : 'Attain';

      const docPayload = {
        sku: sku,
        slug: slug,
        nombre: nombre,
        descripcion: descripcionHtml,
        estado: estadoProducto,
        precio: costoEnCentavos,
        costo: costoEnCentavos,
        iva_pct: 21.0,
        stock: stockActual,
        marca: marcaExtraida,
        permite_envio: true,
        permite_retiro: true,
        envio_config: JSON.stringify(envioConfig),
        portada_url: portadaUrl,
        galeria_urls: JSON.stringify(galeriaUrls)
      };

      try {
        const prodId = crypto.randomBytes(16).toString('hex');
        await db.createDocument(DB_ID, COLL_ID, prodId.substring(0, 20), docPayload);
        console.log(`✅ Producto "${nombre}" importado exitosamente. (Costo: $${costoRaw})`);
        importedCount++;
      } catch (err: any) {
        console.log(`❌ Error importando "${nombre}":`, err.message);
      }
      
      await delay(1000);
    }
    
    console.log(`\n🎉 Importación finalizada. Se insertaron ${importedCount} productos.`);
  } catch (err: any) {
    console.error('Error crítico en el script:', err.message);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

run();
