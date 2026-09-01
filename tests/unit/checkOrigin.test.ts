import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regresión — `checkOrigin: true` rompió TODOS los formularios en producción.
 *
 * Traefik termina el TLS y habla HTTP con el contenedor, así que Astro ve
 * `req.socket.encrypted === false`. Con `allowedDomains` vacío descarta además
 * los headers `x-forwarded-*` que Traefik sí manda, y termina armando la URL
 * como `http://localhost:3000`. El navegador manda
 * `Origin: https://urbanpoints.com.ar`: no coinciden ni el protocolo ni el
 * host, y el login devolvía "Cross-site POST form submissions are forbidden".
 *
 * Verificado reproduciendo el cálculo de Astro (core/app/node.js +
 * validate-headers.js) con los headers reales de Traefik:
 *
 *   allowedDomains: []        -> http://localhost:3000      (no coincide, 403)
 *   allowedDomains: [dominio] -> https://urbanpoints.com.ar (coincide)
 *   x-forwarded-host falso    -> https://urbanpoints.com.ar (se ignora)
 *
 * Este test no reproduce ese cálculo: depende de módulos internos de Astro que
 * no están exportados y que pueden moverse entre versiones. Guarda las dos
 * decisiones que sí son nuestras y que, si se revierten, vuelven a romper todo.
 *
 * La salida fácil ante un 403 es apagar checkOrigin. No: eso deja todos los
 * formularios sin protección CSRF, que es de donde venimos.
 */

const raiz = path.resolve(__dirname, '../..');
const config = fs.readFileSync(path.join(raiz, 'astro.config.mjs'), 'utf8');

describe('configuración de origen', () => {
	it('checkOrigin sigue encendido', () => {
		expect(/checkOrigin:\s*true/.test(config), 'checkOrigin no está en true').toBe(true);
	});

	it('el dominio de producción está declarado con su protocolo', () => {
		expect(/allowedDomains:\s*\[/.test(config), 'falta allowedDomains').toBe(true);
		expect(config.includes('urbanpoints.com.ar'), 'falta el dominio').toBe(true);
		expect(/protocol:\s*'https'/.test(config), 'falta el protocolo').toBe(true);
	});

	it('el bloque explica por qué, para que nadie lo saque al ver un 403', () => {
		expect(/Cross-site POST/.test(config)).toBe(true);
	});
});
