import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// tests/e2e queda afuera a propósito: necesita una instancia de Appwrite
		// con credenciales y escribe documentos reales. Se corre con
		// `npm run test:e2e`, no en la suite de siempre.
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
