import fs from 'fs';

const html = fs.readFileSync('scripts/sample_product.html', 'utf8');

const jsonMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
if (jsonMatch) {
  console.log('JSON-LD Schema.org Data:');
  console.log(jsonMatch[1]);
} else {
  console.log('No ld+json found.');
}
