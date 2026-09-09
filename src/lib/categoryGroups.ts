/**
 * Agrupación temática de las categorías del catálogo, sólo para exhibición
 * (menú lateral / futuros paneles). No toca la estructura real en Appwrite:
 * las ~90 categorías del catálogo son, salvo una, todas de primer nivel
 * (parent_id vacío) — nombres de colecciones sueltas ("Blue Note", "Autos
 * Alemanes", "Rock de Acá"...) sin un árbol real detrás. Mostrarlas todas
 * juntas y en fila era ilegible; acá se las junta por temática para que el
 * menú se navegue de un vistazo.
 *
 * Es un mapa explícito por nombre (no heurística por palabras clave):
 * con nombres de colecciones tan variados, adivinar por keyword arriesgaba
 * clasificar mal ("Hola" podría matchear cualquier cosa). Una categoría
 * nueva que no esté en el mapa cae en "Otras categorías" — nunca desaparece,
 * sólo hay que sumarla acá cuando se detecte.
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

function idDeGrupo(nombreCategoria: string): string {
	return ASIGNACION[(nombreCategoria || '').trim()] || 'otras';
}

export interface CategoriaAgrupada<T> {
	grupo: GrupoCategoria;
	categorias: T[];
}

/** Agrupa categorías (con `nombre`) manteniendo el orden recibido dentro de cada grupo. */
export function agruparCategorias<T extends { nombre: string }>(categorias: T[]): CategoriaAgrupada<T>[] {
	const porGrupo = new Map<string, T[]>();
	for (const c of categorias) {
		const id = idDeGrupo(c.nombre);
		const lista = porGrupo.get(id);
		if (lista) lista.push(c);
		else porGrupo.set(id, [c]);
	}
	return GRUPOS.map((g) => ({ grupo: g, categorias: porGrupo.get(g.id) || [] })).filter((x) => x.categorias.length > 0);
}
