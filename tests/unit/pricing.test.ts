/**
 * Regresión — AUDITORÍA C-03 y A-04.
 *
 * C-03: el storefront muestra y carga `precio_promocional` al carrito
 *       (src/pages/productos/[slug].astro:97), pero createCheckout cobra
 *       siempre `precio` (src/actions/index.ts:617,626-630).
 *
 * A-04: la validación de email de RegistrationForm.tsx:63 usa `\\S` (backslash
 *       literal) en vez de `\S`, por lo que rechaza todo email válido.
 *
 * Estos tests fallan HOY a propósito: documentan el bug. En Fase 2 deben pasar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

/** Precio que el servidor debe cobrar por una unidad. */
function precioDeVenta(p: { precio: number; precio_promocional?: number }): number {
	// Regla de negocio esperada: si hay promo vigente (>0 y < precio), se cobra la promo.
	if (p.precio_promocional && p.precio_promocional > 0 && p.precio_promocional < p.precio) {
		return p.precio_promocional;
	}
	return p.precio;
}

describe('C-03 — el checkout debe cobrar el precio promocional que se muestra', () => {
	it('precioDeVenta prefiere la promo cuando es menor al precio de lista', () => {
		expect(precioDeVenta({ precio: 1000000, precio_promocional: 800000 })).toBe(800000);
	});

	it('precioDeVenta ignora promos vacías o mayores al precio', () => {
		expect(precioDeVenta({ precio: 1000000, precio_promocional: 0 })).toBe(1000000);
		expect(precioDeVenta({ precio: 1000000, precio_promocional: 1200000 })).toBe(1000000);
	});

	it('createCheckout debe derivar el precio de la misma función que la vitrina', () => {
		const src = leer('src/actions/index.ts');
		const handler = src.slice(src.indexOf('createCheckout:'), src.indexOf('auth_login:'));
		expect(
			handler.includes('precioDeVentaCentavos') || handler.includes('resolveProductPriceForUser'),
			'createCheckout no usa resolveProductPriceForUser o precioDeVentaCentavos: puede cobrar algo distinto a lo publicado'
		).toBe(true);
		expect(
			/unit_price:\s*p\.precio\b/.test(handler),
			'createCheckout todavía manda p.precio crudo a Mercado Pago'
		).toBe(false);
	});

	it('ninguna página de vitrina debe calcular el precio a mano', () => {
		const vistas = [
			'src/pages/index.astro',
			'src/pages/[slug].astro',
			'src/pages/productos/index.astro',
			'src/pages/productos/[slug].astro'
		];
		for (const vista of vistas) {
			const src = leer(vista);
			// precioParaTier envuelve a precioDeVentaCentavos y a
			// resolveProductPriceForUser para servir el precio del nivel de
			// quien mira. Cualquiera de las dos vías vale: lo que no vale es
			// que la página calcule el precio por su cuenta.
			expect(
				src.includes('precioDeVentaCentavos') || src.includes('precioParaTier'),
				`${vista} no usa el módulo de precios compartido`
			).toBe(true);
			// El precio de lista tachado era precio * 1.25, inventado en el front.
			expect(/\*\s*1\.25/.test(src), `${vista} sigue inventando el precio de lista`).toBe(false);
		}
	});
});

describe('C-06 — el dinero no puede vivir en punto flotante', () => {
	it('ningún script del repo crea precio_promocional como float', () => {
		// El atributo se migró a integer en la base (ver
		// scripts/migrate_precio_promocional.ts). Este test evita que vuelva a
		// aparecer un script que lo recree como double y revierta la migración.
		const dirs = ['scripts', '.'];
		const culpables: string[] = [];

		for (const dir of dirs) {
			for (const archivo of fs.readdirSync(path.join(raiz, dir))) {
				if (!/\.(ts|js|mjs)$/.test(archivo)) continue;
				const ruta = path.join(raiz, dir, archivo);
				if (!fs.statSync(ruta).isFile()) continue;
				const src = fs.readFileSync(ruta, 'utf8');
				if (src.includes('createFloatAttribute') && src.includes('precio_promocional')) {
					culpables.push(path.join(dir, archivo));
				}
			}
		}

		expect(culpables, `crean precio_promocional como float: ${culpables.join(', ')}`).toEqual([]);
	});

	it('la migración deja el atributo como entero', () => {
		const src = leer('scripts/migrate_precio_promocional.ts');
		expect(src.includes('createIntegerAttribute')).toBe(true);
	});
});

describe('A-04 — validación de email del alta de canillitas', () => {
	/** Extrae el regex tal cual está escrito en el componente. */
	function regexDelFormulario(): RegExp {
		const src = leer('src/components/canillitas/RegistrationForm.tsx');
		const m = src.match(/if \(!(\/.+?\/)\.test\(formData\.email\)\)/);
		if (!m) throw new Error('No se encontró la validación de email en RegistrationForm.tsx');
		// eslint-disable-next-line no-eval
		return eval(m[1]) as RegExp;
	}

	it('acepta emails válidos', () => {
		const re = regexDelFormulario();
		for (const email of ['juan@gmail.com', 'a.b@dominio.com.ar', 'canillita@urbanpoint.ar']) {
			expect(re.test(email), `el formulario rechaza el email válido ${email}`).toBe(true);
		}
	});

	it('rechaza emails inválidos', () => {
		const re = regexDelFormulario();
		for (const email of ['sinarroba', 'a@b', '@nada.com']) {
			expect(re.test(email)).toBe(false);
		}
	});
});

describe('A-01 — el alta de canillitas es administrada', () => {
	it('el alta de canillitas se gestiona desde el panel de admin', () => {
		const adminPage = leer('src/pages/admin/canillitas/index.astro');
		expect(adminPage.includes('savePickupPoint')).toBe(true);
	});
});
