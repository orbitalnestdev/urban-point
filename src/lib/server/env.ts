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

/** Dominio de producción. Último recurso si no hay nada configurado. */
export const SITE_URL_DEFAULT = 'https://urbanpoints.com.ar';

const esLocal = (valor: string): boolean =>
	valor.includes('localhost') || valor.includes('127.0.0.1');

/**
 * Hosts aceptados cuando la URL base se deduce de la petición.
 *
 * Se arma con PUBLIC_SITE_URL / SITE_URL, la lista opcional
 * PUBLIC_SITE_HOSTS (separada por comas) y el dominio de producción.
 */
function hostsPermitidos(): string[] {
	const hosts: string[] = [];
	const agregar = (valor: string) => {
		const limpio = valor.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
		if (limpio && !hosts.includes(limpio)) hosts.push(limpio);
	};

	agregar(env('PUBLIC_SITE_URL', 'SITE_URL'));
	for (const extra of env('PUBLIC_SITE_HOSTS').split(',')) agregar(extra);
	agregar(SITE_URL_DEFAULT);

	return hosts;
}

/**
 * Resuelve la URL pública base del sitio (para webhooks, back_urls y
 * redirecciones OAuth de Mercado Pago). Sirve para cuando Node corre en
 * localhost detrás de Nginx / Traefik / Passenger.
 *
 * `x-forwarded-host` lo manda el cliente, y si el proxy no lo reescribe llega
 * tal cual: sin validarlo, un atacante podía fabricar una preferencia de pago
 * cuyas back_urls y notification_url apuntaran a un dominio suyo. Ahora el host
 * deducido de la petición tiene que estar en la lista de permitidos; si no,
 * se usa la URL configurada.
 */
export function getPublicSiteUrl(ctx?: any): string {
	const envUrl = env('PUBLIC_SITE_URL', 'SITE_URL');
	if (envUrl && !esLocal(envUrl)) {
		return envUrl.replace(/\/+$/, '');
	}

	const permitidos = hostsPermitidos();

	let req: Request | null = null;
	if (ctx) {
		if (ctx instanceof Request) req = ctx;
		else if (ctx.request instanceof Request) req = ctx.request;
	}

	if (req) {
		const forwardedHost = req.headers.get('x-forwarded-host');
		const host = (forwardedHost || req.headers.get('host') || '').split(',')[0].trim();
		const proto = req.headers.get('x-forwarded-proto') || 'https';

		if (host && !esLocal(host)) {
			if (permitidos.includes(host.toLowerCase())) {
				return `${proto}://${host}`.replace(/\/+$/, '');
			}
			// Si el dominio real de producción no está en la lista, las URLs que
			// se le mandan a Mercado Pago apuntan a otro lado. Se avisa fuerte:
			// el síntoma sería un checkout que vuelve al dominio equivocado, y
			// sin este log no habría por dónde empezar a buscar.
			console.warn(
				`Host "${host}" no está permitido para armar la URL base. ` +
				`Definí PUBLIC_SITE_URL (o agregalo a PUBLIC_SITE_HOSTS). ` +
				`Se usa ${SITE_URL_DEFAULT}.`
			);
		}
	}

	const urlObj = ctx?.url || (ctx instanceof URL ? ctx : null);
	if (urlObj?.origin && !esLocal(urlObj.origin)) {
		const host = String(urlObj.host || '').toLowerCase();
		if (permitidos.includes(host)) {
			return String(urlObj.origin).replace(/\/+$/, '');
		}
	}

	return SITE_URL_DEFAULT;
}

