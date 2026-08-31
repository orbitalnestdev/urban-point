import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  security: {
    // Valida el header Origin en las peticiones que mutan estado con
    // content-type de formulario. Estaba apagado; no apagarlo de nuevo para
    // destrabar un POST que falla: si falla es porque viene de otro origen.
    //
    // No afecta al webhook de Mercado Pago, que llega como application/json
    // (Astro sólo bloquea los content-type de formulario cross-origin).
    checkOrigin: true
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