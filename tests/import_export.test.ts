import { describe, it } from 'node:test';
import assert from 'node:assert';

function generateCsvString(rows: Array<Record<string, any>>, headers?: string[]): string {
	if (rows.length === 0) return '';
	const keys = headers || Object.keys(rows[0]);
	const headerRow = keys.join(',');
	const dataRows = rows.map(row => {
		return keys.map(k => {
			const val = row[k] !== undefined && row[k] !== null ? String(row[k]) : '';
			if (val.includes(',') || val.includes('"') || val.includes('\n')) {
				return `"${val.replace(/"/g, '""')}"`;
			}
			return val;
		}).join(',');
	});
	return [headerRow, ...dataRows].join('\n');
}

describe('Herramientas de Exportación e Importación - Pruebas de Unidad', () => {
	it('debe generar un CSV bien formateado a partir de filas de datos', () => {
		const data = [
			{ Nombre: 'Gorro Avengers', SKU: 'GOR-01', Precio: '12500' },
			{ Nombre: 'Botella Térmica', SKU: 'BOT-02', Precio: '18900' }
		];
		const csv = generateCsvString(data);
		assert.ok(csv.includes('Nombre,SKU,Precio'));
		assert.ok(csv.includes('Gorro Avengers,GOR-01,12500'));
		assert.ok(csv.includes('Botella Térmica,BOT-02,18900'));
	});

	it('debe escapar comas y comillas adecuadamente en campos CSV', () => {
		const data = [
			{ Nombre: 'Gorro "Avengers", Edición Especial', SKU: 'GOR-01', Precio: '12500' }
		];
		const csv = generateCsvString(data);
		assert.ok(csv.includes('"Gorro ""Avengers"", Edición Especial"'));
	});

	it('debe mapear correctamente columnas de importación', () => {
		const headers = ['Title', 'Product Code', 'Price', 'Qty'];
		const mapping = {
			nombre: headers.find(h => /title|nombre/i.test(h)),
			sku: headers.find(h => /code|sku/i.test(h)),
			precio: headers.find(h => /price|precio/i.test(h)),
			stock: headers.find(h => /qty|stock/i.test(h))
		};

		assert.strictEqual(mapping.nombre, 'Title');
		assert.strictEqual(mapping.sku, 'Product Code');
		assert.strictEqual(mapping.precio, 'Price');
		assert.strictEqual(mapping.stock, 'Qty');
	});
});
