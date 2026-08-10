import fs from 'fs';

const xml = fs.readFileSync('scripts/sitemap.xml', 'utf8');

const locs = [...xml.matchAll(/<loc>(https:\/\/attain\.com\.ar\/shop\/[^<]+)<\/loc>/g)].map(m => m[1]);

console.log(`📊 URLs de productos encontradas en sitemap.xml: ${locs.length}`);

// Filter out categories and wishlist
const productUrls = locs.filter(url => !url.includes('/category/') && !url.includes('/wishlist') && !url.includes('/cart'));

console.log(`📦 URLs de productos unicos reales en sitemap.xml: ${productUrls.length}`);
console.log('Muestra de 10 URLs:');
console.log(productUrls.slice(0, 10));

fs.writeFileSync('scripts/attain_sitemap_urls.json', JSON.stringify(productUrls, null, 2));
