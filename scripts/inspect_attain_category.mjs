import fs from 'fs';

async function inspectAttain() {
  const res = await fetch('https://attain.com.ar/shop');
  const html = await res.text();

  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Todos los hrefs únicos en /shop:');
  const shopHrefs = hrefs.filter(h => h.includes('/shop/'));
  console.log(Array.from(new Set(shopHrefs)));
}

inspectAttain();
