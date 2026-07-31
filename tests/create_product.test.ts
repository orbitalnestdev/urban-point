import { describe, it } from 'node:test';
import assert from 'node:assert';

// Función pura de creación de payload de producto
function buildProductPayload(input: { nombre: string; tipo?: string }) {
	if (!input.nombre || input.nombre.trim().length < 2) {
		throw new Error('El nombre del producto debe tener al menos 2 caracteres.');
	}

	const slug = input.nombre
		.toLowerCase()
		.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random()*1000);

	const sku = 'SKU-' + Math.floor(100000 + Math.random() * 900000);

	return {
		nombre: input.nombre,
		slug,
		sku,
		descripcion: '',
		precio: 0,
		stock: 0,
		estado: 'borrador',
		tipo: input.tipo || 'simple'
	};
}

describe('Creación y Guardado de Productos - Pruebas de Unidad', () => {
	it('debe generar el borrador del producto con slug y SKU válidos', () => {
		const payload = buildProductPayload({ nombre: 'Gorro de Invierno Marvel', tipo: 'simple' });
		
		assert.strictEqual(payload.nombre, 'Gorro de Invierno Marvel');
		assert.ok(payload.slug.startsWith('gorro-de-invierno-marvel-'));
		assert.ok(payload.sku.startsWith('SKU-'));
		assert.strictEqual(payload.estado, 'borrador');
		assert.strictEqual(payload.precio, 0);
		assert.strictEqual(payload.stock, 0);
	});

	it('debe rechazar nombres de producto menores a 2 caracteres', () => {
		assert.throws(() => {
			buildProductPayload({ nombre: 'A' });
		}, /al menos 2 caracteres/);
	});

	it('debe permitir la especificación de tipos de producto (simple, variantes, combo)', () => {
		const comboPayload = buildProductPayload({ nombre: 'Combo Invierno 2x1', tipo: 'combo' });
		assert.strictEqual(comboPayload.tipo, 'combo');

		const variantPayload = buildProductPayload({ nombre: 'Remera Talles M/L', tipo: 'variantes' });
		assert.strictEqual(variantPayload.tipo, 'variantes');
	});
});
