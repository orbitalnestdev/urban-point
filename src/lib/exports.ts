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

export function downloadTemplateSimple() {
	const rows = [
		{ 
			Nombre: 'Gorro de Invierno Tejido', 
			SKU: 'GOR-001', 
			Categoria: 'Accesorios', 
			Marca: 'UrbanStyle', 
			Precio: '12500', 
			Precio_Promocional: '10900', 
			Precio_Canillita: '8500', 
			Precio_Distribuidor: '6500', 
			Costo: '5000', 
			Stock: '15', 
			Portada_URL: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9, https://images.unsplash.com/photo-1576871337622-98d48d1cf531', 
			Descripcion: 'Gorro de lana de alta densidad ideal para invierno.' 
		},
		{ 
			Nombre: 'Botella Térmica 500ml Acero', 
			SKU: 'BOT-500', 
			Categoria: 'Bazar y Bazar', 
			Marca: 'TermoMax', 
			Precio: '18900', 
			Precio_Promocional: '', 
			Precio_Canillita: '13000', 
			Precio_Distribuidor: '10000', 
			Costo: '7500', 
			Stock: '20', 
			Portada_URL: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8', 
			Descripcion: 'Mantiene frío 24hs y calor 12hs.' 
		}
	];
	const csv = generateCsvString(rows);
	downloadCsv('plantilla_productos_completos_urbanpoint.csv', csv);
}

export function downloadTemplateVariantes() {
	const rows = [
		{ Nombre: 'Remera Algodón 100%', SKU: 'REM-S-NEGRO', Talle: 'S', Color: 'Negro', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '10' },
		{ Nombre: 'Remera Algodón 100%', SKU: 'REM-M-NEGRO', Talle: 'M', Color: 'Negro', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '12' },
		{ Nombre: 'Remera Algodón 100%', SKU: 'REM-L-AZUL', Talle: 'L', Color: 'Azul', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '8' }
	];
	const csv = generateCsvString(rows);
	downloadCsv('plantilla_productos_variantes_urbanpoint.csv', csv);
}
