export function generateCsvString(rows: Array<Record<string, any>>, headers?: string[]): string {
	if (rows.length === 0) return '';
	
	const keys = headers || Object.keys(rows[0]);
	const headerRow = keys.join(',');
	
	const dataRows = rows.map(row => {
		return keys.map(k => {
			let val = row[k] !== undefined && row[k] !== null ? String(row[k]) : '';
			// Neutralizar inyección de fórmulas: un valor que empieza con = + - @
			// se ejecuta al abrir el CSV en Excel/Sheets (p. ej. =HYPERLINK(...)).
			if (/^[=+\-@\t\r]/.test(val) && isNaN(Number(val))) {
				val = `'${val}`;
			}
			// Escape quotes and commas
			if (val.includes(',') || val.includes('"') || val.includes('\n')) {
				return `"${val.replace(/"/g, '""')}"`;
			}
			return val;
		}).join(',');
	});
	
	return [headerRow, ...dataRows].join('\n');
}

export function downloadCsv(filename: string, csvContent: string) {
	const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.setAttribute('download', filename);
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	setTimeout(() => {
		if (document.body.contains(link)) {
			document.body.removeChild(link);
		}
		URL.revokeObjectURL(url);
	}, 250);
}

export function exportProductsCsv(products: any[], categoryMap: Record<string, string> = {}) {
	const rows = products.map(p => {
		const catId = typeof p.categoria_id === 'string' ? p.categoria_id : p.categoria_id?.$id || '';
		const catName = categoryMap[catId] || (p.categoria_id?.nombre || '');

		return {
			ID: p.$id,
			SKU: p.sku || '',
			Nombre: p.nombre || '',
			Categoria: catName,
			Categoria_ID: catId,
			Estado: p.estado || 'activo',
			Precio: (p.precio || 0) / 100,
			Precio_Promocional: p.precio_promocional ? p.precio_promocional / 100 : '',
			Precio_Canillita: p.precio_canillita ? p.precio_canillita / 100 : '',
			Precio_Distribuidor: p.precio_distribuidor ? p.precio_distribuidor / 100 : '',
			Costo: p.costo ? p.costo / 100 : '',
			Stock: p.stock || 0,
			Marca: p.marca || '',
			Portada_URL: p.portada_url || '',
			Descripcion: p.descripcion || ''
		};
	});
	const csv = generateCsvString(rows);
	downloadCsv(`productos_urbanpoint_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportErpCsv(products: any[]) {
	const rows = products.map(p => ({
		CODIGO_ERP: p.sku || p.$id,
		DESCRIPCION: p.nombre || '',
		PRECIO_VENTA_NETO: ((p.precio || 0) / 100).toFixed(2),
		STOCK_DISPONIBLE: p.stock || 0,
		ALICUOTA_IVA: '21.00',
		ESTADO: p.estado === 'activo' ? 'H' : 'I'
	}));
	const csv = generateCsvString(rows);
	downloadCsv(`export_erp_urbanpoint_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

/*
 * Las plantillas CSV vivían acá y también en /api/admin/template-csv, con
 * contenido distinto. El botón de descarga disparaba las dos a la vez —el href
 * al endpoint y el onClick a esta versión—, así que el admin se bajaba dos
 * archivos que no coincidían. Queda sólo el endpoint como fuente.
 */
