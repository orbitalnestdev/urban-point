/**
 * Política de atribución [A-06].
 *
 * Regla del negocio: LAST-TOUCH con ventana de 30 días, resuelta en el
 * servidor. El último canillita que trajo al comprador se queda la venta,
 * llegue por ?ref= o por la página de su punto.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REF_COOKIE_NAME, REF_COOKIE_MAX_AGE } from '../../src/lib/nodeSession';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

describe('Una sola fuente de atribución', () => {
	it('el código de referido no vive en localStorage', () => {
		// Era la vía por la que un comprador podía atribuirse la venta a
		// cualquier canillita: bastaba con editar localStorage.
		expect(leer('src/store/cart.ts').includes('urbanpoint_ref')).toBe(false);
	});

	it('no queda la cookie muerta up_ref_code', () => {
		// El middleware la escribía y nadie la leía nunca.
		const fuentes = ['src/middleware.ts', 'src/layouts/Layout.astro', 'src/actions/index.ts'];
		for (const f of fuentes) {
			expect(leer(f).includes('up_ref_code'), `${f} todavía usa up_ref_code`).toBe(false);
		}
	});

	it('createCheckout no acepta el código desde el cliente', () => {
		const src = leer('src/actions/index.ts');
		const handler = src.slice(src.indexOf('createCheckout:'), src.indexOf('auth_login:'));
		expect(
			/referralCode:\s*z\.string\(\)/.test(handler),
			'createCheckout sigue aceptando referralCode como input'
		).toBe(false);
		expect(
			handler.includes('REF_COOKIE_NAME'),
			'createCheckout no lee el referido de la cookie del servidor'
		).toBe(true);
	});

	it('el checkout del cliente ya no manda el código', () => {
		expect(leer('src/pages/checkout/pago.astro').includes('referralCode')).toBe(false);
	});
});

describe('Last-touch consistente', () => {
	it('el Layout ya no impone first-touch', () => {
		// `if (!referralCode.get().code)` hacía que el primer código ganara para
		// siempre, mientras la cookie de nodo se sobrescribía en cada visita.
		const layout = leer('src/layouts/Layout.astro');
		expect(/if \(!referralCode\.get\(\)\.code\)/.test(layout)).toBe(false);
	});

	it('la página del punto reatribuye sin condición', () => {
		const slug = leer('src/pages/[slug].astro');
		const bloque = slug.slice(slug.indexOf('refCodeRes.documents.length > 0'));
		expect(bloque.includes(`Astro.cookies.set(REF_COOKIE_NAME`)).toBe(true);
	});

	it('el middleware sobrescribe el código ante un ?ref= nuevo', () => {
		const mw = leer('src/middleware.ts');
		const bloque = mw.slice(mw.indexOf("searchParams.get('ref')"), mw.indexOf('const sessionSecret'));
		expect(bloque.includes('cookies.set')).toBe(true);
		// Sin guarda de "sólo si no había uno previo": eso sería first-touch.
		expect(/if \(!.*cookies\.get/.test(bloque)).toBe(false);
	});
});

describe('La cookie de atribución es a prueba de manipulación', () => {
	it('es httpOnly en las tres escrituras', () => {
		for (const f of ['src/middleware.ts', 'src/pages/[slug].astro']) {
			const src = leer(f);
			const i = src.indexOf(`cookies.set(REF_COOKIE_NAME`);
			expect(i, `${f} no escribe la cookie de referido`).toBeGreaterThan(-1);
			expect(src.slice(i, i + 320).includes('httpOnly: true'), `${f} no la marca httpOnly`).toBe(true);
		}
	});

	it('la ventana de atribución es de 30 días', () => {
		expect(REF_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60);
		expect(REF_COOKIE_NAME).toBe('up_ref');
	});
});
