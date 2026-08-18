/**
 * Lectura de variables de entorno del servidor.
 *
 * Astro carga el archivo .env en `import.meta.env`, NO en `process.env`. Todo
 * el código leía sólo `process.env`, así que en desarrollo el .env nunca se
 * aplicaba y la app se comportaba como si no hubiera credenciales. De ahí
 * venía la API key hardcodeada en el repositorio: no resolvía un problema de
 * permisos de Appwrite, tapaba este bug de configuración.
 *
 * En el deploy las variables llegan por `process.env`, que tiene prioridad.
 */

const limpiar = (val?: unknown): string =>
	typeof val === 'string' ? val.replace(/^["']|["']$/g, '').trim() : '';

/** Devuelve la primera variable con valor, o '' si ninguna está definida. */
export function env(...nombres: string[]): string {
	for (const nombre of nombres) {
		const desdeProceso = typeof process !== 'undefined' ? process.env?.[nombre] : undefined;
		const valorProceso = limpiar(desdeProceso);
		if (valorProceso) return valorProceso;

		const desdeAstro = (import.meta.env as Record<string, unknown> | undefined)?.[nombre];
		const valorAstro = limpiar(desdeAstro);
		if (valorAstro) return valorAstro;
	}
	return '';
}

/** Igual que env(), pero falla si no hay valor. Para secretos obligatorios. */
export function envObligatoria(nombre: string, ayuda?: string): string {
	const valor = env(nombre);
	if (!valor) {
		throw new Error(
			`${nombre} no está definida. ${ayuda || 'Configurala como variable de entorno.'}`
		);
	}
	return valor;
}

export const APPWRITE_ENDPOINT_DEFAULT = 'https://aw.orbitalnest.net/v1';
export const APPWRITE_PROJECT_ID_DEFAULT = '6a6a5321001439f06817';

export const appwriteEndpoint = () =>
	env('PUBLIC_APPWRITE_ENDPOINT', 'NEXT_PUBLIC_APPWRITE_ENDPOINT') || APPWRITE_ENDPOINT_DEFAULT;

export const appwriteProjectId = () =>
	env('PUBLIC_APPWRITE_PROJECT_ID', 'NEXT_PUBLIC_APPWRITE_PROJECT_ID') || APPWRITE_PROJECT_ID_DEFAULT;

/**
 * Resuelve la URL pública base del sitio (para webhooks, back_urls y redirecciones OAuth MP).
 * Evita fallos cuando Node corre internamente en localhost detras de cPanel / Nginx / Passenger.
 */
export function getPublicSiteUrl(ctx?: any): string {
	const envUrl = env('PUBLIC_SITE_URL', 'SITE_URL');
	if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
		return envUrl.replace(/\/+$/, '');
	}

	let req: Request | null = null;
	if (ctx) {
		if (ctx instanceof Request) req = ctx;
		else if (ctx.request instanceof Request) req = ctx.request;
	}

	if (req) {
		const forwardedHost = req.headers.get('x-forwarded-host');
		const host = forwardedHost || req.headers.get('host');
		const proto = req.headers.get('x-forwarded-proto') || 'https';

		if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
			return `${proto}://${host}`.replace(/\/+$/, '');
		}
	}

	const urlObj = ctx?.url || (ctx instanceof URL ? ctx : null);
	if (urlObj?.origin && !urlObj.origin.includes('localhost') && !urlObj.origin.includes('127.0.0.1')) {
		return urlObj.origin.replace(/\/+$/, '');
	}

	return 'https://urbanpoints.com.ar';
}

