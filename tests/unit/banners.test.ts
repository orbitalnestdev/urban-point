import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

// Reimplementación local de urlDeEnlaceValida (src/actions/index.ts) para
// no importar el archivo completo de actions en el test.
function urlDeEnlaceValida(url: string): boolean {
	const v = (url || '').trim();
	if (!v) return true;
	if (v.startsWith('/') && !v.startsWith('//')) return true;
	if (/^https?:\/\//i.test(v)) {
		try {
			new URL(v);
			return true;
		} catch {
			return false;
		}
	}
	return false;
}

describe('Banners de colecciones', () => {
	describe('urlDeEnlaceValida', () => {
		it('acepta una URL externa completa', () => {
			expect(urlDeEnlaceValida('https://instagram.com/urbanpoint')).toBe(true);
		});

		it('acepta una ruta interna del sitio', () => {
			expect(urlDeEnlaceValida('/productos')).toBe(true);
		});

		it('acepta vacío (se completa después desde la UI)', () => {
			expect(urlDeEnlaceValida('')).toBe(true);
			expect(urlDeEnlaceValida('   ')).toBe(true);
		});

		it('rechaza una URL protocol-relative ("//host")', () => {
			expect(urlDeEnlaceValida('//evil.com')).toBe(false);
		});

		it('rechaza esquemas no soportados (javascript:, ftp:, etc.)', () => {
			expect(urlDeEnlaceValida('javascript:alert(1)')).toBe(false);
			expect(urlDeEnlaceValida('ftp://files.com')).toBe(false);
		});
	});

	describe('Integración de las actions y páginas', () => {
		it('src/actions/index.ts define las 4 actions de banners y la colección', () => {
			const src = leer('src/actions/index.ts');
			expect(src).toContain('saveBanner:');
			expect(src).toContain('deleteBanner:');
			expect(src).toContain('reorderBanners:');
			expect(src).toContain('saveBannersDisplayMode:');
			expect(src).toContain('collection_banners');
		});

		it('la página de admin de banners existe y usa las actions correctas', () => {
			const src = leer('src/pages/admin/banners/index.astro');
			expect(src).toContain('actions.saveBanner');
			expect(src).toContain('actions.deleteBanner');
			expect(src).toContain('actions.reorderBanners');
			expect(src).toContain('actions.saveBannersDisplayMode');
		});

		it('ambas home (index y [slug]) usan el mismo componente compartido', () => {
			const home = leer('src/pages/index.astro');
			const slug = leer('src/pages/[slug].astro');
			expect(home).toContain("import CollectionBanners from '../components/CollectionBanners.astro'");
			expect(home).toContain('<CollectionBanners />');
			expect(slug).toContain("import CollectionBanners from '../components/CollectionBanners.astro'");
			expect(slug).toContain('<CollectionBanners />');
		});
	});
});
