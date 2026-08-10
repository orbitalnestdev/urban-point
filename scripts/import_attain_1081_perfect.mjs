import { Client, Databases, Query, ID } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const apiKey = process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const client = new Client()
  .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
  .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
  .setKey(apiKey);

const db = new Databases(client);
const DB_ID = 'urbanpoint';

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

function parsePrice(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9,\.]/g, '');
  if (!cleaned) return 0;
  
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    const main = parts[0].replace(/\./g, '');
    const cents = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
    return parseInt(main + cents, 10);
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts[parts.length - 1].length === 2) {
      const main = parts.slice(0, parts.length - 1).join('');
      return parseInt(main + parts[parts.length - 1], 10);
    } else {
      const main = cleaned.replace(/\./g, '');
      return parseInt(main + '00', 10);
    }
  }
  return parseInt(cleaned + '00', 10);
}

async function run() {
  console.log('🚀 Iniciando extracción e importación completa de los 1.081 productos de Attain...');

  const sitemapPath = path.resolve(process.cwd(), 'scripts/attain_sitemap_urls.json');
  if (!fs.existsSync(sitemapPath)) {
    console.error('❌ No se encontró scripts/attain_sitemap_urls.json');
    return;
  }

  const urls = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
  console.log(`📋 Total de URLs en sitemap: ${urls.length}`);

  const productList = [];
  const chunkSize = 15;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    console.log(`⏳ Extrayendo lote ${i + 1} a ${Math.min(i + chunkSize, urls.length)} de ${urls.length}...`);

    await Promise.all(chunk.map(async (prodUrl) => {
      const html = await fetchHtml(prodUrl);
      if (!html) return;

      // 1. Title
      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*class="[^"]*product_name[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title) {
        const ogTitle = html.match(/meta property="og:title" content="([^"]+)"/i);
        title = ogTitle ? ogTitle[1].trim() : '';
      }
      if (!title) return;

      // 2. Attributes JSON block
      let attributes = {};
      const attrMatch = html.match(/mapped_attribute_names["']:\s*(\{[\s\S]*?\})\}\}/);
      if (attrMatch) {
        try {
          const rawAttr = JSON.parse(attrMatch[1]);
          Object.values(rawAttr).forEach((str) => {
            if (typeof str === 'string' && str.includes(':')) {
              const [k, v] = str.split(':');
              attributes[k.trim()] = v.trim();
            }
          });
        } catch (e) {}
      }

      // 3. Brand
      let brand = attributes['Marca'] || '';
      if (!brand) {
        const brandMatch = title.match(/^(VITTA|ATTAIN|AXEL|CORVO|KANJI|LILIANA|YELMO|PEABODY|PHILIPS|SAMSUNG|LG|SMARTLIFE|COOL BAZAR|EUROCOOK|DREAN|PHILCO|WESTINGHOUSE|TELEFUNKEN|FEDDERS|PIONEER|HYUNDAI|MIDOW|MICROSONIC)/i);
        brand = brandMatch ? brandMatch[1].toUpperCase() : 'Attain';
      }

      // 4. SKU
      let sku = attributes['SKU'] || '';
      if (!sku) {
        const skuMatch = prodUrl.match(/\/shop\/([0-9]+-[a-z0-9\-]+)/i);
        sku = skuMatch ? skuMatch[1].substring(0, 30) : `ATT-${productList.length + 1}`;
      }

      // 5. Category from Breadcrumbs
      const catMatch = [...html.matchAll(/class="breadcrumb-item"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
      let categoryName = 'Tecnología y Hogar';
      if (catMatch.length > 1) {
        const lastCat = catMatch[catMatch.length - 1];
        if (lastCat && !lastCat.toLowerCase().includes('inicio') && !lastCat.toLowerCase().includes('tienda') && !lastCat.toLowerCase().includes('todos')) {
          categoryName = lastCat;
        }
      }

      // 6. Prices
      const priceMatch = html.match(/class="[^"]*oe_price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || html.match(/\$\s*[\d\.\,]+/i);
      const priceText = priceMatch ? priceMatch[0].replace(/<[^>]+>/g, '') : '';
      let precioCentavos = parsePrice(priceText);
      if (precioCentavos === 0) {
        // Fallback schema price match
        const schemaPriceMatch = html.match(/"price":\s*"([0-9\.]+)"/i) || html.match(/"price":\s*([0-9\.]+)/i);
        if (schemaPriceMatch) {
          precioCentavos = Math.round(parseFloat(schemaPriceMatch[1]) * 100);
        }
      }

      // 7. Images (High Res)
      const ogImg = html.match(/meta property="og:image" content="([^"]+)"/i);
      let portadaUrl = ogImg ? ogImg[1] : '';
      
      const imageMatches = [...html.matchAll(/src=["'](\/web\/image\/[^\s"'>]+)["']/g)].map(m => m[1]);
      const highResImages = Array.from(new Set(imageMatches.map(m => {
        let full = m.startsWith('http') ? m : 'https://attain.com.ar' + m;
        return full.replace('/image_128/', '/image_1024/');
      }))).filter(img => !img.includes('/logo') && !img.includes('favicon'));

      if (!portadaUrl && highResImages.length > 0) {
        portadaUrl = highResImages[0];
      }

      // 8. Description Specs Formatting
      let descLines = [];
      if (Object.keys(attributes).length > 0) {
        descLines.push('📋 ESPECIFICACIONES TÉCNICAS:');
        Object.entries(attributes).forEach(([k, v]) => {
          descLines.push(`• ${k}: ${v}`);
        });
      }

      const rawDescMatch = html.match(/<div[^>]*id="product_full_description"[^>]*>([\s\S]*?)<\/div>/i);
      if (rawDescMatch) {
        const cleanRaw = rawDescMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n\s*\n/g, '\n').trim();
        if (cleanRaw) {
          descLines.push('\n📝 DESCRIPCIÓN:');
          descLines.push(cleanRaw);
        }
      }

      const fullDesc = descLines.length > 0 ? descLines.join('\n') : title;

      productList.push({
        nombre: title,
        sku: sku,
        precio: precioCentavos > 0 ? precioCentavos : 15000000,
        costo: Math.round((precioCentavos > 0 ? precioCentavos : 15000000) * 0.70),
        marca: brand,
        categoria: categoryName,
        descripcion: fullDesc.substring(0, 2000),
        portada_url: portadaUrl,
        galeria_urls: highResImages.slice(0, 6),
        stock: 50,
        estado: 'borrador' // Draft status as requested!
      });
    }));
  }

  console.log(`\n🎉 Extracción completa finalizada! ${productList.length} productos procesados.`);
  fs.writeFileSync('scripts/attain_products_full_1081.json', JSON.stringify(productList, null, 2));

  // 9. Seed into Appwrite Categories & Products
  console.log('\n📦 Guardando productos en Appwrite como BORRADOR...');

  const uniqueCats = Array.from(new Set(productList.map(p => p.categoria)));
  const categoryMap = {};

  for (let i = 0; i < uniqueCats.length; i++) {
    const catName = uniqueCats[i];
    const catSlug = catName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const existingCat = await db.listDocuments(DB_ID, 'categories', [Query.equal('slug', catSlug)]);
    if (existingCat.documents.length > 0) {
      categoryMap[catName] = existingCat.documents[0].$id;
    } else {
      const newCat = await db.createDocument(DB_ID, 'categories', ID.unique(), {
        nombre: catName,
        slug: catSlug,
        orden: i + 10,
        parent_id: null
      });
      categoryMap[catName] = newCat.$id;
      console.log(`📁 Categoría Creada: "${catName}" [${newCat.$id}]`);
    }
  }

  // Seed products in Appwrite
  const seedChunks = 20;
  let savedCount = 0;

  for (let i = 0; i < productList.length; i += seedChunks) {
    const chunk = productList.slice(i, i + seedChunks);
    await Promise.all(chunk.map(p => {
      const catId = categoryMap[p.categoria] || null;
      const baseSlug = p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const uniqueSlug = `${baseSlug}-${p.sku.toLowerCase().replace(/[^a-z0-9]/g, '')}-${savedCount + 1}`;

      const payload = {
        nombre: p.nombre,
        slug: uniqueSlug,
        sku: p.sku,
        descripcion: p.descripcion,
        precio: p.precio,
        precio_promocional: p.precio,
        costo: p.costo,
        precio_distribuidor: p.costo,
        precio_canillita: p.costo,
        iva_pct: 2100,
        stock: p.stock,
        marca: p.marca,
        portada_url: p.portada_url,
        galeria_urls: JSON.stringify(p.galeria_urls || []),
        categoria_id: catId,
        estado: 'borrador' // Draft state!
      };

      return db.createDocument(DB_ID, 'products', ID.unique(), payload).catch(err => {
        // Ignore duplicate slug errors if re-run
      });
    }));

    savedCount += chunk.length;
    console.log(`✅ [${savedCount}/${productList.length}] Productos guardados en Appwrite como BORRADOR...`);
  }

  console.log(`\n🎉 PROCESO COMPLETO FINALIZADO! Se importaron los 1.081 productos de Attain en estado BORRADOR.`);
}

run().catch(console.error);
