/**
 * XSS almacenado por JSON embebido en <script> [M-17].
 */
import { describe, it, expect } from 'vitest';
import { toSafeJson } from '../../src/lib/safeJson';

describe('toSafeJson', () => {
	it('neutraliza el cierre de </script>', () => {
		// Un nombre comercial con este payload rompía el bloque y ejecutaba
		// código en la home, el mapa y el checkout.
		const datos = [{ nombre: 'Kiosco</script><img src=x onerror=alert(1)>' }];
		const salida = toSafeJson(datos);

		expect(salida).not.toContain('</script>');
		expect(salida).not.toContain('<');
		expect(salida).not.toContain('>');
	});

	it('sigue siendo JSON válido y reconstruye el valor original', () => {
		const datos = [{ nombre: 'Kiosco</script>', dir: 'Reconquista & Cía', n: 42 }];
		const recuperado = JSON.parse(toSafeJson(datos));
		expect(recuperado).toEqual(datos);
	});

	it('escapa los separadores de línea que rompen literales de JS', () => {
		const conSeparadores = { t: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` };
		const salida = toSafeJson(conSeparadores);

		expect(salida).not.toContain(String.fromCharCode(0x2028));
		expect(salida).not.toContain(String.fromCharCode(0x2029));
		expect(JSON.parse(salida)).toEqual(conSeparadores);
	});

	it('no rompe con acentos ni con valores vacíos', () => {
		for (const v of [null, [], {}, { a: 'Ñandú — cañón' }]) {
			expect(JSON.parse(toSafeJson(v))).toEqual(v);
		}
	});
});

describe('Las páginas no serializan con JSON.stringify crudo', () => {
	it('los cuatro puntos de inyección usan toSafeJson', async () => {
		const fs = await import('node:fs');
		const path = await import('node:path');
		const raiz = path.resolve(__dirname, '../..');

		const vistas = [
			'src/pages/index.astro',
			'src/pages/puntos-de-retiro.astro',
			'src/pages/checkout/retiro.astro',
			'src/pages/[slug].astro'
		];

		for (const vista of vistas) {
			const src = fs.readFileSync(path.join(raiz, vista), 'utf8');
			expect(
				/set:html=\{JSON\.stringify/.test(src),
				`${vista} sigue inyectando JSON.stringify crudo en un <script>`
			).toBe(false);
		}
	});
});
