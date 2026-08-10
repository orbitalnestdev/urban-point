import fs from 'fs';

async function testSample() {
  const sampleUrl = 'https://attain.com.ar/shop/2137-afeitadora-electrica-hombre-westinghouse-6-funciones-usb-color-negro-726';
  console.log(`🔍 Probando parseo en ${sampleUrl}...`);

  const res = await fetch(sampleUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });
  const html = await res.text();
  fs.writeFileSync('scripts/sample_product.html', html);

  console.log(`📄 Guardado sample_product.html (${html.length} bytes)`);

  // Search for og:image or any img tag
  const ogImg = html.match(/meta property="og:image" content="([^"]+)"/i);
  console.log('og:image:', ogImg ? ogImg[1] : 'No encontrado');

  // Search for prices
  const prices = [...html.matchAll(/\$\s*[\d\.\,]+/g)].map(m => m[0]);
  console.log('Precios encontrados en HTML:', prices);

  // Search for breadcrumbs / categories
  const categories = [...html.matchAll(/\/shop\/category\/([^"'\?]+)/g)].map(m => m[1]);
  console.log('Categorías encontradas en hrefs:', Array.from(new Set(categories)));
}

testSample();
