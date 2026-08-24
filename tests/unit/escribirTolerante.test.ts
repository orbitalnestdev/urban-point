import { describe, it, expect, vi } from 'vitest';
import { extractUnknownAttribute, escribirDocumentoTolerante } from '../../src/lib/server/appwrite';

vi.mock('../../src/lib/server/env', () => ({
	appwriteEndpoint: () => 'https://cloud.appwrite.io/v1',
	appwriteProjectId: () => 'test-project',
	env: (key: string) => key === 'APPWRITE_API_KEY' ? 'test-api-key' : ''
}));

vi.mock('node-appwrite', async (importOriginal) => {
	const mod: any = await importOriginal();
	return {
		...mod,
		Databases: vi.fn().mockImplementation(() => ({
			createDocument: vi.fn(),
			updateDocument: vi.fn()
		}))
	};
});

describe('escribirDocumentoTolerante & extractUnknownAttribute', () => {
	describe('extractUnknownAttribute', () => {
		it('debe extraer attribute name con comillas y formato estándar', () => {
			const payload = { price_tier: 'publico', nombre: 'Test' };
			const msg = 'Invalid document structure: Unknown attribute: "price_tier"';
			expect(extractUnknownAttribute(msg, payload)).toBe('price_tier');
		});

		it('debe extraer attribute name con punto final', () => {
			const payload = { price_tier: 'publico', nombre: 'Test' };
			const msg = 'Invalid document structure: Unknown attribute: "price_tier".';
			expect(extractUnknownAttribute(msg, payload)).toBe('price_tier');
		});

		it('debe extraer attribute name sin comillas', () => {
			const payload = { price_tier: 'publico', nombre: 'Test' };
			const msg = 'Invalid document structure: Unknown attribute: price_tier.';
			expect(extractUnknownAttribute(msg, payload)).toBe('price_tier');
		});

		it('debe extraer attribute name con formato "Attribute X is not defined"', () => {
			const payload = { markup_distribuidor: 20, nombre: 'Categoria' };
			const msg = 'Attribute "markup_distribuidor" is not defined.';
			expect(extractUnknownAttribute(msg, payload)).toBe('markup_distribuidor');
		});

		it('debe encontrar la clave en el payload aunque el mensaje sea inusual', () => {
			const payload = { custom_field: 123, nombre: 'Producto' };
			const msg = 'El esquema no acepta custom_field.';
			expect(extractUnknownAttribute(msg, payload)).toBe('custom_field');
		});

		it('debe retornar null si la propiedad no existe en el payload', () => {
			const payload = { nombre: 'Test' };
			const msg = 'Invalid document structure: Unknown attribute: "desconocido"';
			expect(extractUnknownAttribute(msg, payload)).toBeNull();
		});
	});

	describe('escribirDocumentoTolerante', () => {
		it('debe remover el atributo desconocido y reintentar la creación', async () => {
			const { createAdminClient } = await import('../../src/lib/server/appwrite');
			const dbs = createAdminClient().databases;

			let attempts = 0;
			vi.spyOn(dbs, 'createDocument').mockImplementation(async (_dbId, _coll, _id, payload) => {
				attempts++;
				if (Object.prototype.hasOwnProperty.call(payload, 'price_tier')) {
					throw new Error('Invalid document structure: Unknown attribute: "price_tier".');
				}
				return { $id: 'doc123', ...payload };
			});

			const result = await escribirDocumentoTolerante('orders', {
				numero: '1001',
				price_tier: 'publico'
			});

			expect(attempts).toBe(2);
			expect(result).toEqual({ $id: 'doc123', numero: '1001' });
		});

		it('debe remover múltiples atributos desconocidos de forma iterativa', async () => {
			const { createAdminClient } = await import('../../src/lib/server/appwrite');
			const dbs = createAdminClient().databases;

			vi.spyOn(dbs, 'updateDocument').mockImplementation(async (_dbId, _coll, docId, payload) => {
				if (Object.prototype.hasOwnProperty.call(payload, 'attr1')) {
					throw new Error('Invalid document structure: Unknown attribute: "attr1"');
				}
				if (Object.prototype.hasOwnProperty.call(payload, 'attr2')) {
					throw new Error('Invalid document structure: Unknown attribute: "attr2"');
				}
				return { $id: docId, ...payload };
			});

			const result = await escribirDocumentoTolerante('products', {
				nombre: 'Producto 1',
				attr1: 'val1',
				attr2: 'val2'
			}, 'prod1');

			expect(result).toEqual({ $id: 'prod1', nombre: 'Producto 1' });
		});
	});
});
