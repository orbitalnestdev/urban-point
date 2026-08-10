import fs from 'fs';

const html = fs.readFileSync('scripts/ventalista_raw.html', 'utf8');

console.log('=== Buscando subcategorías / rubros en Ventalista ===');

// Search for any buttons, links or JSON payloads containing category names
const matches = [...html.matchAll(/category|rubro|subcategoria/gi)];
console.log(`Coincidencias de 'category/rubro': ${matches.length}`);

// Let's search for all buttons or links inside the category navigation
const navBlock = html.split('aria-label="Rubros"')[1] || html.split('Rubros')[1] || '';

console.log('--- Fragmento alrededor de Rubros ---');
console.log(navBlock.substring(0, 2000));
