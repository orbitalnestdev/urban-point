import fs from 'fs';
import path from 'path';

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
  console.log('🚀 Iniciando scraping completo de Attain (attain.com.ar)...');

  const productUrlMap = new Map(); // url -> categoryName

  // Crawl main shop pagination pages (1 to 25 to get a wide range of catalog products)
  console.log('🔎 Crawleando páginas del catálogo /shop/page/1 ...');
  for (let page = 1; page <= 25; page++) {
    const pageUrl = page === 1 ? 'https://attain.com.ar/shop' : `https://attain.com.ar/shop/page/${page}`;
    const html = await fetchHtml(pageUrl);
    if (!html) break;

    // Match links like /shop/6611-lavarropas-semiautomatico...
    const matches = [...html.matchAll(/href=["'](\/shop\/[0-9]+-[^"']+)["']/g)].map(m => m[1]);
    let newInPage = 0;
    for (const link of matches) {
      // Ignore wishlist or category links
      if (link.includes('/category/') || link.includes('/wishlist')) continue;
      const fullLink = 'https://attain.com.ar' + link;
      if (!productUrlMap.has(fullLink)) {
        productUrlMap.set(fullLink, 'Tecnología y Hogar');
        newInPage++;
      }
    }

    console.log(`   └ Página ${page}: ${newInPage} productos nuevos encontrados. (Total acumulado: ${productUrlMap.size})`);
    if (newInPage === 0 && page > 5) break;
  }

  console.log(`\n📦 Total de URLs de productos unicos a extraer: ${productUrlMap.size}`);

  const productList = [];
  const entries = Array.from(productUrlMap.entries());
  const chunkSize = 10;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    console.log(`⏳ Extrayendo batch ${i + 1} - ${Math.min(i + chunkSize, entries.length)} / ${entries.length}...`);

    await Promise.all(chunk.map(async ([prodUrl, defaultCategory]) => {
      const html = await fetchHtml(prodUrl);
      if (!html) return;

      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*class="[^"]*product_name[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      if (!title) {
        const ogTitle = html.match(/meta property="og:title" content="([^"]+)"/i);
        title = ogTitle ? ogTitle[1].trim() : '';
      }
      if (!title) return;

      const priceMatch = html.match(/class="[^"]*oe_price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || html.match(/\$\s*[\d\.\,]+/i);
      const priceText = priceMatch ? priceMatch[0].replace(/<[^>]+>/g, '') : '';
      const precioCentavos = parsePrice(priceText);

      const strikeMatch = html.match(/class="[^"]*text-danger[^"]*line-through[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const strikeText = strikeMatch ? strikeMatch[1].replace(/<[^>]+>/g, '') : '';
      const precioListaCentavos = parsePrice(strikeText);

      const catMatch = html.match(/class="breadcrumb-item"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi);
      let categoryName = defaultCategory;
      if (catMatch && catMatch.length > 1) {
        const lastCat = catMatch[catMatch.length - 1].replace(/<[^>]+>/g, '').trim();
        if (lastCat && !lastCat.toLowerCase().includes('inicio') && !lastCat.toLowerCase().includes('tienda')) {
          categoryName = lastCat;
        }
      }

      const skuMatch = prodUrl.match(/\/shop\/([0-9]+-[a-z0-9\-]+)/i);
      const sku = skuMatch ? skuMatch[1].substring(0, 30) : `ATT-${productList.length + 1}`;

      const imageMatches = [...html.matchAll(/src=["'](\/web\/image\/[0-9]+[^"']+)["']/g)].map(m => m[1]);
      const ogImg = html.match(/meta property="og:image" content="([^"]+)"/i);
      
      let mainImg = ogImg ? ogImg[1] : '';
      if (!mainImg && imageMatches.length > 0) {
        mainImg = 'https://attain.com.ar' + imageMatches[0];
      }

      const gallery = imageMatches.map(m => m.startsWith('http') ? m : 'https://attain.com.ar' + m);
      const brandMatch = title.match(/^(VITTA|ATTAIN|AXEL|CORVO|KANJI|LILIANA|YELMO|PEABODY|PHILIPS|SAMSUNG|LG|SMARTLIFE|COOL BAZAR|EUROCOOK)/i);
      const brand = brandMatch ? brandMatch[1].toUpperCase() : 'Attain';

      const descMatch = html.match(/<div[^>]*id="product_full_description"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<section[^>]*id="product_detail"[^>]*>([\s\S]*?)<\/section>/i);
      let desc = descMatch ? descMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim() : title;
      desc = desc.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n\s*\n/g, '\n').trim();

      productList.push({
        nombre: title,
        sku: sku,
        precio: precioCentavos > 0 ? precioCentavos : 12000000,
        precio_lista: precioListaCentavos > 0 ? precioListaCentavos : Math.round(precioCentavos * 1.25),
        costo: Math.round((precioCentavos > 0 ? precioCentavos : 12000000) * 0.70),
        marca: brand,
        categoria: categoryName,
        descripcion: desc.substring(0, 1000) || title,
        portada_url: mainImg,
        galeria_urls: gallery.slice(0, 5),
        stock: 50,
        estado: 'borrador' // Set as draft!
      });
    }));
  }

  console.log(`\n🎉 Extracción finalizada! ${productList.length} productos procesados.`);
  fs.writeFileSync('scripts/attain_products.json', JSON.stringify(productList, null, 2));
  console.log('💾 Guardado scripts/attain_products.json');
}

run().catch(console.error);
