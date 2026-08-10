import fs from 'fs';

async function testGallery() {
  const sampleUrl = 'https://attain.com.ar/shop/2137-afeitadora-electrica-hombre-westinghouse-6-funciones-usb-color-negro-726';
  console.log(`🔍 Probando extracción de galería en ${sampleUrl}...`);

  const res = await fetch(sampleUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });
  const html = await res.text();

  const carouselMatch = html.match(/<div[^>]*id="o-carousel-product"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i) || html.match(/<div[^>]*class="[^"]*o_wsale_product_images[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

  const carouselHtml = carouselMatch ? carouselMatch[1] : html;

  const gallery = [];

  // Extract all zoom images (1920px max size)
  const zoomMatches = [...carouselHtml.matchAll(/data-zoom-image=["']([^"']+)["']/g)].map(m => m[1]);
  zoomMatches.forEach(img => {
    let full = img.startsWith('http') ? img : 'https://attain.com.ar' + img;
    gallery.push(full);
  });

  // Extract all img src
  const imgMatches = [...carouselHtml.matchAll(/src=["'](\/web\/image\/[^\s"'>]+)["']/g)].map(m => m[1]);
  imgMatches.forEach(img => {
    let full = img.startsWith('http') ? img : 'https://attain.com.ar' + img;
    full = full.replace('/image_128/', '/image_1920/').replace('/image_1024/', '/image_1920/').replace('/image_512/', '/image_1920/');
    gallery.push(full);
  });

  // Deduplicate and filter valid product images
  const uniqueGallery = Array.from(new Set(gallery)).filter(img => 
    !img.includes('/logo') && 
    !img.includes('favicon') && 
    !img.includes('company=')
  );

  console.log(`📸 Total de imágenes de galería del producto: ${uniqueGallery.length}`);
  uniqueGallery.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
}

testGallery();
