import https from 'https';

function get(url, headers = {}) {
  const parsed = new URL(url);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    headers: {
      'Host': 'urbanpoint.ventalista.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ...headers
    }
  };

  return new Promise((resolve) => {
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', err => resolve({ status: 500, data: err.message }));
  });
}

async function test() {
  const tenantId = '762edafb-aca8-4988-a699-24d42e140da8';
  const endpoints = [
    `https://api.ventalista.com/portal/catalogs`,
    `https://api.ventalista.com/portal/categories`,
    `https://api.ventalista.com/portal/products`,
    `https://api.ventalista.com/catalogs/Desayuno`,
    `https://api.ventalista.com/products`
  ];

  for (const ep of endpoints) {
    const res = await get(ep, { 'Host': 'urbanpoint.ventalista.com' });
    console.log(`[${res.status}] ${ep} -> ${res.data.substring(0, 200)}`);
  }
}

test();
