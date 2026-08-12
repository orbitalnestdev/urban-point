/**
 * Slugs reservados del sitio. [M-12]
 *
 * La lista estaba duplicada literalmente en src/pages/[slug].astro y en la
 * action savePickupPoint: agregar una ruta nueva obligaba a tocar los dos
 * archivos, y olvidarse de uno dejaba el hueco para que un punto de retiro se
 * la robara.
 */
export const SLUGS_RESERVADOS = new Set([
	'tienda', 'carrito', 'checkout', 'pago', 'retiro', 'success', 'mi-cuenta',
	'contacto', 'admin', 'canillita', 'puntos-de-retiro', 'login', 'registro',
	'api', 'productos', 'ingresar', 'nosotros', 'ayuda', 'terminos', 'privacidad',
	'comisiones', 'favicon.ico', 'robots.txt', 'sumate-como-canillita', 'puntos',
	'sitemap.xml', '404'
]);

/** Normaliza un texto libre a un slug de URL. */
export function normalizarSlug(texto: string): string {
	return texto
		.toLowerCase()
		.trim()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** ¿El slug pisa una ruta del sistema o rompe el routing? */
export function esSlugReservado(slug: string): boolean {
	const limpio = slug.toLowerCase();
	return SLUGS_RESERVADOS.has(limpio) || limpio.includes('.') || limpio.startsWith('_');
}

/** Limpia y normaliza el nombre o slug de un nodo/canillita para obtener una URL amigable sin dirección ni prefijos "puesto". */
export function limpiarSlugNodo(texto: string): string {
	if (!texto) return 'punto';
	// 1. Quitar parte de dirección después de " - " o " – " o " — "
	let limpio = texto.split(/\s*[\-\–\—]\s*/)[0].trim();

	// 2. Quitar prefijos "puesto de diarios", "kiosco de diarios", "kiosco", "puesto n°", "puesto nº", "puesto nro", "puesto", etc.
	limpio = limpio.replace(/^(puesto\s+de\s+diarios|kiosco\s+de\s+diarios|kiosco)\s+/i, '').trim();
	limpio = limpio.replace(/^puesto\s+(?:n[rº°#\.]*|#)\s*/i, '').trim();
	limpio = limpio.replace(/^puesto\s+/i, '').trim();

	if (!limpio) {
		limpio = texto.trim();
	}

	// 3. Normalizar caracteres especiales a minúsculas y guiones
	let slug = normalizarSlug(limpio);

	// 4. Si el slug generado aún arranca con "puesto-" o "kiosco-", removerlo
	slug = slug.replace(/^(puesto|kiosco)-+/i, '');

	return slug || 'punto';
}
