import fs from 'fs';

const html = fs.readFileSync('scripts/ventalista_raw.html', 'utf8');

// Find all URLs matching api.ventalista.com or tenant identifiers
const apiUrls = [...html.matchAll(/https:\/\/api\.ventalista\.com\/[^\s"'>]+/g)].map(m => m[0]);

console.log('URLs de API Ventalista encontradas:');
console.log(Array.from(new Set(apiUrls)));
