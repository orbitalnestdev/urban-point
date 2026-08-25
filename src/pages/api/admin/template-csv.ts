import type { APIRoute } from 'astro';
import { generateCsvString } from '../../../lib/exports';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const tipo = url.searchParams.get('tipo') || 'completa';

	let rows: Array<Record<string, any>> = [];
	let filename = 'plantilla_productos_completos_urbanpoint.csv';

	if (tipo === 'variantes') {
		filename = 'plantilla_productos_variantes_urbanpoint.csv';
		rows = [
			{ Nombre: 'Remera Algodón 100%', SKU: 'REM-S-NEGRO', Talle: 'S', Color: 'Negro', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '10' },
			{ Nombre: 'Remera Algodón 100%', SKU: 'REM-M-NEGRO', Talle: 'M', Color: 'Negro', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '12' },
			{ Nombre: 'Remera Algodón 100%', SKU: 'REM-L-AZUL', Talle: 'L', Color: 'Azul', Categoria: 'Indumentaria', Precio: '8500', Precio_Canillita: '6000', Stock: '8' }
		];
	} else {
		rows = [
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
				Categoria: 'Bazar y Hogar', 
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
	}

	const csv = generateCsvString(rows);

	return new Response('\uFEFF' + csv, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
