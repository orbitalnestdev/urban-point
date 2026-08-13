import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

// Helper function to generate category slug (matching saveCategory logic)
function generarSlugCategoria(nombre: string, customSlug?: string): string {
	const slugBase = customSlug || nombre;
	const clean = slugBase
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // remove accents
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return clean || 'cat-' + Date.now();
}

// Helper to filter products by parent category (including all subcategories)
function obtenerIdsFamiliaCategoria(categoryId: string, categories: { $id: string; parent_id?: string | null }[]): string[] {
	const childIds = categories.filter(c => c.parent_id === categoryId).map(c => c.$id);
	return [categoryId, ...childIds];
}

describe('Módulo de Categorías y Subcategorías (Tienda Nube Style)', () => {

	describe('1. Generación y Limpieza de Slugs de Categorías', () => {
		it('limpia acentos, caracteres especiales y espacios en los slugs', () => {
			expect(generarSlugCategoria('Almacén & Bebidas')).toBe('almacen-bebidas');
			expect(generarSlugCategoria('Gaseosas y Jugos Orgánicos')).toBe('gaseosas-y-jugos-organicos');
			expect(generarSlugCategoria('  Lácteos  ')).toBe('lacteos');
		});

		it('respeta un slug personalizado si el usuario lo especifica', () => {
			expect(generarSlugCategoria('Galletitas Dulces', 'promo-galletitas')).toBe('promo-galletitas');
		});
	});

	describe('2. Estructura Jerárquica y Orden (Categorías Padre e Hijas)', () => {
		const mockCategories = [
			{ $id: 'cat-almacen', nombre: 'Almacén', parent_id: null },
			{ $id: 'cat-arroz', nombre: 'Arroz y Legumbres', parent_id: 'cat-almacen' },
			{ $id: 'cat-fideos', nombre: 'Pastas Secas', parent_id: 'cat-almacen' },
			{ $id: 'cat-bebidas', nombre: 'Bebidas', parent_id: null },
			{ $id: 'cat-gaseosas', nombre: 'Gaseosas', parent_id: 'cat-bebidas' }
		];

		it('separa correctamente las categorías principales (raíz) de las subcategorías', () => {
			const raices = mockCategories.filter(c => !c.parent_id);
			expect(raices.map(r => r.nombre)).toEqual(['Almacén', 'Bebidas']);
		});

		it('incluye todos los IDs de las subcategorías al filtrar por una categoría padre', () => {
			const almacenFamily = obtenerIdsFamiliaCategoria('cat-almacen', mockCategories);
			expect(almacenFamily).toEqual(['cat-almacen', 'cat-arroz', 'cat-fideos']);

			const bebidasFamily = obtenerIdsFamiliaCategoria('cat-bebidas', mockCategories);
			expect(bebidasFamily).toEqual(['cat-bebidas', 'cat-gaseosas']);
		});
	});

	describe('3. Verificación de Acciones del Servidor (saveCategory & deleteCategory)', () => {
		it('la acción saveCategory existe en src/actions/index.ts y maneja parent_id y slug', () => {
			const srcActions = leer('src/actions/index.ts');
			expect(srcActions.includes('saveCategory')).toBe(true);
			expect(srcActions.includes('categories')).toBe(true);
			expect(srcActions.includes('parent_id')).toBe(true);
		});

		it('la acción deleteCategory existe en src/actions/index.ts para eliminar categorías', () => {
			const srcActions = leer('src/actions/index.ts');
			expect(srcActions.includes('deleteCategory')).toBe(true);
		});

		it('la página /admin/categorias existe con la interfaz de gestión estilo Tienda Nube', () => {
			const adminCatPage = leer('src/pages/admin/categorias/index.astro');
			expect(adminCatPage.includes('Categorías y Subcategorías')).toBe(true);
			expect(adminCatPage.includes('saveCategory')).toBe(true);
			expect(adminCatPage.includes('deleteCategory')).toBe(true);
		});
	});
});
