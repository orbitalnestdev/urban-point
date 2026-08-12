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
