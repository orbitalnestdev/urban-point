import fs from 'fs';

const html = fs.readFileSync('scripts/ventalista_raw.html', 'utf8');

// Search for catalog links like /catalogs/...
const catalogLinks = [...html.matchAll(/\/catalogs\/([^"'\s>]+)/g)].map(m => m[1]);
const uniqueCatalogs = Array.from(new Set(catalogLinks));

console.log('Catálogos / Rubros encontrados:', uniqueCatalogs);
