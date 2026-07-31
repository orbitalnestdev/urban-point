import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  adapter: node({
    mode: 'standalone'
  }),

  env: {
    schema: {
      PUBLIC_APPWRITE_ENDPOINT: envField.string({ context: 'client', access: 'public', default: 'https://aw.orbitalnest.net/v1' }),
      PUBLIC_APPWRITE_PROJECT_ID: envField.string({ context: 'client', access: 'public' }),
      APPWRITE_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      MP_ACCESS_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    }
  },

  integrations: [react()]
});