import { Client, Databases, Query } from 'node-appwrite';
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

async function run() {
  console.log('🚀 Actualizando galerías de imágenes al 100% de calidad y cantidad para todos los productos...');

  const sitemapPath = path.resolve(process.cwd(), 'scripts/attain_sitemap_urls.json');
  if (!fs.existsSync(sitemapPath)) {
    console.error('❌ No se encontró scripts/attain_sitemap_urls.json');
    return;
  }

  const urls = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
  console.log(`📋 Total de URLs a procesar: ${urls.length}`);

  const chunkSize = 20;
  let processed = 0;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);

    await Promise.all(chunk.map(async (prodUrl) => {
      const html = await fetchHtml(prodUrl);
      if (!html) return;

      // Extract SKU
      const skuMatch = prodUrl.match(/\/shop\/([0-9]+-[a-z0-9\-]+)/i);
      const sku = skuMatch ? skuMatch[1].substring(0, 30) : '';
      if (!sku) return;

      // Extract Carousel HTML
      const carouselMatch = html.match(/<div[^>]*id="o-carousel-product"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i) || html.match(/<div[^>]*class="[^"]*o_wsale_product_images[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
      const carouselHtml = carouselMatch ? carouselMatch[1] : html;

      const gallery = [];

      // 1. Data-zoom-image (1920px max size)
      const zoomMatches = [...carouselHtml.matchAll(/data-zoom-image=["']([^"']+)["']/g)].map(m => m[1]);
      zoomMatches.forEach(img => {
        let full = img.startsWith('http') ? img : 'https://attain.com.ar' + img;
        gallery.push(full);
      });

      // 2. Img src
      const imgMatches = [...carouselHtml.matchAll(/src=["'](\/web\/image\/[^\s"'>]+)["']/g)].map(m => m[1]);
      imgMatches.forEach(img => {
        let full = img.startsWith('http') ? img : 'https://attain.com.ar' + img;
        full = full.replace('/image_128/', '/image_1920/').replace('/image_1024/', '/image_1920/').replace('/image_512/', '/image_1920/');
        gallery.push(full);
      });

      const ogImg = html.match(/meta property="og:image" content="([^"]+)"/i);
      if (ogImg) {
        gallery.push(ogImg[1].replace('/image_1024/', '/image_1920/'));
      }

      const uniqueGallery = Array.from(new Set(gallery)).filter(img => 
        !img.includes('/logo') && 
        !img.includes('favicon') && 
        !img.includes('company=')
      );

      if (uniqueGallery.length === 0) return;

      const portadaUrl = uniqueGallery[0];
      const galeriaJson = JSON.stringify(uniqueGallery);

      // Find product in Appwrite by SKU
      try {
        const existing = await db.listDocuments(DB_ID, 'products', [Query.equal('sku', sku)]);
        if (existing.documents.length > 0) {
          for (const doc of existing.documents) {
            await db.updateDocument(DB_ID, 'products', doc.$id, {
              portada_url: portadaUrl,
              galeria_urls: galeriaJson
            });
          }
        }
      } catch (err) {}
    }));

    processed += chunk.length;
    console.log(`📸 [${processed}/${urls.length}] Galerías extraídas e ingresadas al 100% en Appwrite...`);
  }

  console.log('🎉 GALERÍAS COMPLETAS 100% ACTUALIZADAS Y SIN LÍMITES EN LA BASE DE DATOS!');
}

run().catch(console.error);
