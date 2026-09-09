/**
 * Agrupación temática de las categorías del catálogo. GRUPOS es la fuente de
 * verdad para dos cosas separadas:
 *
 *  1. El ícono de cada grupo en el menú lateral (Header.astro busca por
 *     nombre — los 13 grupos ya existen como categorías reales en Appwrite,
 *     creadas y asignadas una única vez por scripts/migrate_category_groups.ts).
 *  2. Ese mismo script, si hace falta volver a correrlo (por ejemplo, para
 *     clasificar en bloque categorías nuevas que todavía no tengan grupo).
 *
 * La clienta administra el árbol real desde /admin/categorías (crear/editar
 * categorías, moverlas de padre) — esto ya no controla qué se ve en el menú,
 * sólo aporta el ícono y sirve de mapa de referencia para el script.
 *
 * Es un mapa explícito por nombre (no heurística por palabras clave): con
 * nombres de colecciones tan variados, adivinar por keyword arriesgaba
 * clasificar mal ("Hola" podría matchear cualquier cosa). Una categoría que
 * no esté en el mapa cae en "Otras categorías" al correr el script — nunca
 * desaparece, sólo hay que sumarla acá cuando se detecte.
 */

export interface GrupoCategoria {
	id: string;
	nombre: string;
	/** Clave de ICONOS. */
	icono: string;
}

export const GRUPOS: GrupoCategoria[] = [
	{ id: 'vehiculos', nombre: 'Vehículos y Motores', icono: 'auto' },
	{ id: 'musica', nombre: 'Música e Ídolos', icono: 'musica' },
	{ id: 'pop', nombre: 'Pop Culture y Comics', icono: 'pop' },
	{ id: 'cocina', nombre: 'Cocina y Bazar', icono: 'cocina' },
	{ id: 'hogar', nombre: 'Hogar y Jardín', icono: 'hogar' },
	{ id: 'pasteleria', nombre: 'Pastelería y Desayuno', icono: 'pastel' },
	{ id: 'ediciones', nombre: 'Ediciones Impresas', icono: 'libro' },
	{ id: 'coleccion', nombre: 'Objetos de Colección', icono: 'coleccion' },
	{ id: 'infantil', nombre: 'Infantil', icono: 'infantil' },
	{ id: 'anteojos', nombre: 'Anteojos', icono: 'anteojos' },
	{ id: 'revistas', nombre: 'Revistas y Estilo de Vida', icono: 'revista' },
	{ id: 'cuidado', nombre: 'Cuidado y Accesorios', icono: 'cuidado' },
	{ id: 'otras', nombre: 'Otras categorías', icono: 'grid' }
];

const GRUPO_POR_ID = new Map(GRUPOS.map((g) => [g.id, g]));

/** nombre de categoría (tal cual está en Appwrite) -> id de grupo. */
const ASIGNACION: Record<string, string> = {
	// Vehículos y Motores
	'Autos Alemanes': 'vehiculos',
	'Autos americanos': 'vehiculos',
	'Autos Clásicos Descapotables': 'vehiculos',
	'Autos Clasicos y Descapotables': 'vehiculos',
	'Autos deportivos de lujo': 'vehiculos',
	'Batimóviles': 'vehiculos',
	'Construye tu F1': 'vehiculos',
	'Monster Truck': 'vehiculos',
	'Motos Clásicas': 'vehiculos',
	'Pick Ups Americanas': 'vehiculos',
	'Objetos de Coleccion - Vehiculos de Coleccion - Autos': 'vehiculos',
	'Objetos de Coleccion - Vehiculos de Coleccion - Barcos': 'vehiculos',

	// Música e Ídolos
	'Blue Note': 'musica',
	'Iron Maiden': 'musica',
	'Madonna': 'musica',
	'NTVG 30 Años': 'musica',
	'Ramones 50 Años': 'musica',
	'Rock de Acá': 'musica',
	'Rock de Aca Vol 2': 'musica',
	'Rolling Stone': 'musica',

	// Pop Culture y Comics
	'Deadpool & Wolverine': 'pop',
	'Deadpool y Wolverine': 'pop',
	'Manga Disney': 'pop',
	'Marvel: héroes y villanos': 'pop',
	'Moana': 'pop',
	'Pop Culture Warner': 'pop',
	'Rey León': 'pop',
	'Stitch': 'pop',
	'Bluey': 'pop',
	'Topa con los animales': 'pop',

	// Cocina y Bazar
	'BAZAR': 'cocina',
	'Bazar y Bazar': 'cocina',
	'Coctelería Nero': 'cocina',
	'Cuchillos Foodit': 'cocina',
	'Fábrica de chocolate': 'cocina',
	'Green pan Chef Collection': 'cocina',
	'Herméticos Nero': 'cocina',
	'Indispensable del chef': 'cocina',
	'Nero Essenza': 'cocina',
	'Ollas y Sartenes Foodit': 'cocina',
	'Todo sobre la cerveza': 'cocina',

	// Hogar y Jardín
	'Hogar': 'hogar',
	'HOGAR MUEBLES Y JARDIN': 'hogar',
	'Living': 'hogar',
	'Jardín': 'hogar',
	'PEQUENOS ELECTRODOMESTICOS': 'hogar',
	'Tecnología y Hogar': 'hogar',

	// Pastelería y Desayuno
	'Alfajores': 'pasteleria',
	'Brownies': 'pasteleria',
	'Cookie deco': 'pasteleria',
	'Cookies': 'pasteleria',
	'Cuadrados y Pastelería': 'pasteleria',
	'Desayuno': 'pasteleria',
	'Pastelería Boutique': 'pasteleria',

	// Ediciones Impresas
	'Ediciones Impresas - Colecciones de Libros': 'ediciones',
	'Ediciones Impresas - Comics': 'ediciones',
	'Ediciones Impresas - Enciclopedia': 'ediciones',
	'Ediciones Impresas - Infantiles': 'ediciones',
	'Ediciones Impresas - Revistas': 'ediciones',
	'Novedades de librerías': 'ediciones',
	'Editorial La Nación': 'ediciones',
	'Descubrir la filosofía': 'ediciones',
	'Grandes clásicos argentinos 2': 'ediciones',

	// Objetos de Colección
	'Objetos de Coleccion - Armables': 'coleccion',
	'Objetos de Coleccion - Munecos Coleccionables': 'coleccion',
	'Monedas y Billetes Autenticas del Mundo': 'coleccion',
	'Animales de la granja': 'coleccion',
	'Animales del bosque': 'coleccion',
	'Dinosaurios': 'coleccion',
	'Soldados de la Segunda Guerra Mundial': 'coleccion',
	'Auschwitz nunca olvidar': 'coleccion',
	'Lugares': 'coleccion',
	'Clásicos del futuro': 'coleccion',
	'Orgullo Argentino': 'coleccion',

	// Infantil
	'Cuentos infantiles': 'infantil',
	'Libros actividades': 'infantil',
	'Mi tren de madera': 'infantil',
	'Pocket Pets': 'infantil',
	'Ninos': 'infantil',

	// Anteojos
	'Armazones': 'anteojos',
	'Clip-on': 'anteojos',
	'Lentes de Lectura': 'anteojos',
	'Lentes de Sol': 'anteojos',

	// Revistas y Estilo de Vida
	'Hola': 'revistas',
	'Ohlalá!': 'revistas',

	// Cuidado y Accesorios
	'Cuidado y bienestar': 'cuidado',
	'Accesorios': 'cuidado',
	'Indumentaria': 'cuidado'
};

/** categoría -> id de grupo, usado por scripts/migrate_category_groups.ts. */
export function idDeGrupo(nombreCategoria: string): string {
	return ASIGNACION[(nombreCategoria || '').trim()] || 'otras';
}
