import fs from 'fs';

async function checkSitemap() {
  console.log('🔍 Buscando sitemap.xml en https://attain.com.ar ...');
  const sitemaps = [
    'https://attain.com.ar/sitemap.xml',
    'https://attain.com.ar/sitemap_index.xml',
    'https://attain.com.ar/sitemap/products.xml',
    'https://attain.com.ar/robots.txt'
  ];

  for (const url of sitemaps) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(`[${res.status}] ${url}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`   └ Fragmento: ${text.substring(0, 300)}`);
        fs.writeFileSync(`scripts/${url.split('/').pop()}`, text);
      }
    } catch (e) {
      console.error(`Error en ${url}:`, e.message);
    }
  }
}

checkSitemap();
