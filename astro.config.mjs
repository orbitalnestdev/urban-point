import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  security: {
    // Valida el header Origin en las peticiones que mutan estado con
    // content-type de formulario. No afecta al webhook de Mercado Pago, que
    // llega como application/json.
    checkOrigin: true,

    // Sin esto, checkOrigin rechaza TODOS los formularios en producción.
    //
    // Traefik termina el TLS y habla HTTP con el contenedor, así que Astro ve
    // `req.socket.encrypted === false`. Y con allowedDomains vacío descarta
    // los headers `x-forwarded-*` que Traefik sí manda, por lo que arma la URL
    // como `http://localhost:3000`. El navegador manda
    // `Origin: https://urbanpoints.com.ar`: no coinciden ni el protocolo ni el
    // host, y el login devolvía "Cross-site POST form submissions are
    // forbidden".
    //
    // Declarar el dominio hace que Astro confíe en esos headers y reconstruya
    // el origen real. Sigue rechazando cualquier otro host, que es el punto.
    //
    // Si el sitio se sirve además en otro dominio, hay que agregarlo acá.
    allowedDomains: [
      { hostname: 'urbanpoints.com.ar', protocol: 'https' }
    ]
  },

  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      cssCodeSplit: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('lucide-react')) {
                return 'vendor';
              }
            }
          }
        }
      }
    }
  },



  adapter: node({
    mode: 'standalone'
  }),

  integrations: [react()]
});