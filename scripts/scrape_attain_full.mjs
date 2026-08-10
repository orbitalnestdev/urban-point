import fs from 'fs';

async function testAttainScrape() {
  console.log('🔍 Inspeccionando https://attain.com.ar/shop ...');
  try {
    const res = await fetch('https://attain.com.ar/shop', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await res.text();
    fs.writeFileSync('scripts/attain_shop_raw.html', html);
    console.log(`📄 Guardado attain_shop_raw.html (${html.length} bytes)`);

    // Extract links using regex
    const matches = [...html.matchAll(/href=["'](\/shop\/[^"']+)["']/g)].map(m => m[1]);
    const uniqueLinks = Array.from(new Set(matches));

    console.log(`📦 Links de productos encontrados en shop: ${uniqueLinks.length}`);
    console.log(uniqueLinks.slice(0, 15));
  } catch (err) {
    console.error('❌ Error al acceder a Attain:', err.message);
  }
}

testAttainScrape();
