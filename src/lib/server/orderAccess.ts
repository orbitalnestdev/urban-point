import crypto from 'node:crypto';

/**
 * Permiso de lectura de un pedido para compradores no logueados. [C-08]
 *
 * /checkout/success mostraba el código de retiro con sólo pasar un order_id
 * por la URL, sin sesión ni verificación de pertenencia. Como deliverOrder
 * valida la entrega comparando ese mismo código, enumerar ids permitía
 * retirar el pedido de otra persona.
 *
 * No se puede exigir sesión sin más: la compra como invitado es válida. En su
 * lugar, al crear el pedido se firma su id y se guarda en una cookie httpOnly.
 * Sólo el navegador que hizo la compra puede ver el código.
 */

const COOKIE = 'up_order_access';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días
const MAX_PEDIDOS = 20;

/**
 * Clave de firma. Se deriva de APPWRITE_API_KEY, que ya es obligatoria y
 * vive sólo en el servidor, para no sumar otra variable de entorno que
 * pueda faltar en el deploy y tirar abajo el checkout.
 */
function claveDeFirma(): string {
	const base = process.env.ORDER_ACCESS_SECRET || process.env.APPWRITE_API_KEY;
	if (!base) {
		throw new Error('No hay secreto disponible para firmar el acceso a pedidos.');
	}
	return base;
}

function firmar(orderId: string): string {
	return crypto.createHmac('sha256', claveDeFirma()).update(orderId).digest('hex').slice(0, 32);
}

function iguales(a: string, b: string): boolean {
	const ba = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

type CookieJar = {
	get(name: string): { value: string } | undefined;
	set(name: string, value: string, opts?: Record<string, unknown>): void;
};

function leerConcesiones(cookies: CookieJar): string[] {
	const raw = cookies.get(COOKIE)?.value;
	if (!raw) return [];
	return raw.split('.').filter(Boolean);
}

/** Otorga a este navegador permiso para ver el pedido recién creado. */
export function otorgarAccesoAPedido(cookies: CookieJar, orderId: string): void {
	try {
		const concesiones = leerConcesiones(cookies).filter((c) => !c.startsWith(`${orderId}~`));
		concesiones.push(`${orderId}~${firmar(orderId)}`);

		cookies.set(COOKIE, concesiones.slice(-MAX_PEDIDOS).join('.'), {
			path: '/',
			httpOnly: true,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			maxAge: MAX_AGE
		});
	} catch (e) {
		// No poder firmar no debe impedir la compra: el comprador logueado
		// igual accede por pertenencia.
		console.error('No se pudo otorgar acceso al pedido:', e);
	}
}

/** ¿Este navegador puede ver el pedido? */
export function tieneAccesoAPedido(cookies: CookieJar, orderId: string): boolean {
	try {
		const esperado = firmar(orderId);
		return leerConcesiones(cookies).some((concesion) => {
			const [id, firma] = concesion.split('~');
			return id === orderId && firma && iguales(firma, esperado);
		});
	} catch {
		return false;
	}
}
