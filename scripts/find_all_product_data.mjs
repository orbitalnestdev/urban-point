import fs from 'fs';

const html = fs.readFileSync('scripts/sample_product.html', 'utf8');

const detailBlockMatch = html.match(/<section[^>]*id="product_detail"[^>]*>([\s\S]*?)<\/section>/i);
if (detailBlockMatch) {
  const detailHtml = detailBlockMatch[1];
  console.log('\n--- Section product_detail (chars 20000 a 26000) ---');
  console.log(detailHtml.substring(20000, 26000));
}
