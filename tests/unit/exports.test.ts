import { describe, it, expect } from 'vitest';
import { generateCsvString } from '../../src/lib/exports';

/**
 * Este archivo reemplaza a tests/import_export.test.ts, que definía su propia
 * copia de generateCsvString y la testeaba a ella: quedaba en verde aunque la
 * implementación real de src/lib/exports.ts se rompiera. Además corría con
 * node:test y vitest.config.ts sólo incluye tests/unit, así que `npm test`
 * nunca lo ejecutaba.
 */
describe('generateCsvString', () => {
	it('arma encabezado y filas a partir de las claves del primer objeto', () => {
		const csv = generateCsvString([
			{ Nombre: 'Gorro Avengers', SKU: 'GOR-01', Precio: '12500' },
			{ Nombre: 'Botella Térmica', SKU: 'BOT-02', Precio: '18900' }
		]);

		expect(csv).toContain('Nombre,SKU,Precio');
		expect(csv).toContain('Gorro Avengers,GOR-01,12500');
		expect(csv).toContain('Botella Térmica,BOT-02,18900');
	});

	it('entrecomilla y duplica las comillas de los campos con comas', () => {
		const csv = generateCsvString([
			{ Nombre: 'Gorro "Avengers", Edición Especial', SKU: 'GOR-01' }
		]);

		expect(csv).toContain('"Gorro ""Avengers"", Edición Especial"');
	});

	it('entrecomilla los campos con saltos de línea', () => {
		const csv = generateCsvString([{ Descripcion: 'Línea uno\nLínea dos' }]);
		expect(csv).toContain('"Línea uno\nLínea dos"');
	});

	it('respeta el orden de columnas indicado y omite las que no se piden', () => {
		const csv = generateCsvString(
			[{ Nombre: 'Gorro', SKU: 'GOR-01', Precio: '12500' }],
			['SKU', 'Nombre']
		);

		expect(csv.split('\n')[0]).toBe('SKU,Nombre');
		expect(csv.split('\n')[1]).toBe('GOR-01,Gorro');
	});

	it('devuelve cadena vacía sin filas', () => {
		expect(generateCsvString([])).toBe('');
	});

	it('escribe vacío donde el valor es null o undefined', () => {
		const csv = generateCsvString([{ Nombre: 'Gorro', SKU: null, Precio: undefined }]);
		expect(csv.split('\n')[1]).toBe('Gorro,,');
	});
});
