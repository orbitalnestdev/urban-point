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

	it('createCheckout debe considerar precio_promocional al armar el total', () => {
		const src = leer('src/actions/index.ts');
		const handler = src.slice(src.indexOf('createCheckout:'), src.indexOf('auth_login:'));
		expect(
			handler.includes('precio_promocional'),
			'createCheckout ignora precio_promocional: cobra p.precio aunque la ficha muestre la promo'
		).toBe(true);
	});
});

describe('C-06 — el dinero no puede vivir en punto flotante', () => {
	it('precio_promocional debe declararse como atributo entero, no float', () => {
		const src = leer('add_precio_promocional.js');
		expect(
			src.includes('createIntegerAttribute'),
			'precio_promocional se declara con createFloatAttribute (double en la base real)'
		).toBe(true);
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

describe('A-01 — el formulario de alta debe ser alcanzable', () => {
	it('alguna página debe montar RegistrationForm', () => {
		const paginas = fs
			.readdirSync(path.join(raiz, 'src/pages/sumate-como-canillita'))
			.map((f) => leer(`src/pages/sumate-como-canillita/${f}`))
			.join('\n');
		expect(
			paginas.includes('RegistrationForm'),
			'ninguna página monta RegistrationForm: las dos rutas de alta hacen Astro.redirect("/")'
		).toBe(true);
	});
});
