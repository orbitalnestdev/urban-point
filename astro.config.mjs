import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  security: {
    checkOrigin: false
  },

  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  },

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: node({
    mode: 'standalone'
  }),

  env: {
    schema: {
      PUBLIC_APPWRITE_ENDPOINT: envField.string({ context: 'client', access: 'public', default: 'https://aw.orbitalnest.net/v1' }),
      PUBLIC_APPWRITE_PROJECT_ID: envField.string({ context: 'client', access: 'public', default: '6a6a5321001439f06817' }),
      NEXT_PUBLIC_APPWRITE_ENDPOINT: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      NEXT_PUBLIC_APPWRITE_PROJECT_ID: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      APPWRITE_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true, default: '' }),
      MP_ACCESS_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true, default: '' }),
    }
  },

  integrations: [react()]
});