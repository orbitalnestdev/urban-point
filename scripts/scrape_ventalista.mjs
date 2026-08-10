import fs from 'fs';

const html = fs.readFileSync('scripts/ventalista_raw.html', 'utf8');

// Match product cards HTML block by splitting on product card wrappers
const cards = html.split('<div class="group relative bg-[rgb(var(--portal-surface))]');

console.log(`Bloques de tarjeta encontrados: ${cards.length - 1}`);

const extractedProducts = [];

for (let i = 1; i < cards.length; i++) {
  const cardHtml = cards[i];

  // 1. Title
  const titleMatch = cardHtml.match(/title="([^"]+)"/);
  const nombre = titleMatch ? titleMatch[1].trim() : '';

  // 2. SKU & Variante
  const skuMatch = cardHtml.match(/SKU\s+([^·<\n]+)(?:·\s*([^<\n]+))?/);
  const sku = skuMatch ? skuMatch[1].trim() : '';
  const variante = skuMatch && skuMatch[2] ? skuMatch[2].trim() : '';

  // 3. Stock
  const stockMatch = cardHtml.match(/(\d+)\s+disponibles/);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : 0;

  // 4. Precio Minorista / Distribuidor / Canillita
  // Look for "$<!-- -->2.000,00" or similar
  const priceMatch = cardHtml.match(/\$<!-- -->([\d\.,]+)/);
  const precioStr = priceMatch ? priceMatch[1].replace(/\./g, '').replace(',', '.') : '0';
  const precioNum = Math.round(parseFloat(precioStr) * 100); // in ARS centavos

  // 5. PVP Sugerido (PVP sugerido: $ 3.500,00)
  const pvpMatch = cardHtml.match(/PVP sugerido:\s*\$\s*([\d\.,]+)/);
  const pvpStr = pvpMatch ? pvpMatch[1].replace(/\./g, '').replace(',', '.') : null;
  const pvpNum = pvpStr ? Math.round(parseFloat(pvpStr) * 100) : precioNum;

  // 6. Image URL
  // srcSet or src contains https://api.ventalista.com/assets/proxy...
  const imgMatch = cardHtml.match(/url=([^&"]+)/) || cardHtml.match(/src="([^"]+)"/);
  let portadaUrl = '';
  if (imgMatch) {
    portadaUrl = decodeURIComponent(imgMatch[1]);
  }

  if (nombre) {
    extractedProducts.push({
      nombre,
      sku,
      variante,
      stock,
      precio: pvpNum, // Public retail price
      precio_promocional: pvpNum,
      precio_distribuidor: precioNum, // Mayorista/Distribuidor cost
      precio_canillita: precioNum,
      costo: precioNum,
      portada_url: portadaUrl,
      categoria: 'Desayuno'
    });
  }
}

console.log(`\n🎉 Productos extraídos con imágenes y PVP (${extractedProducts.length}):`);
console.log(JSON.stringify(extractedProducts, null, 2));

fs.writeFileSync('scripts/ventalista_products.json', JSON.stringify(extractedProducts, null, 2), 'utf8');
