/**
 * Traducción de errores a mensajes seguros para el navegador.
 *
 * Los handlers de las actions terminaban en
 * `catch (error) { return { success: false, error: error.message } }`, así que
 * el error crudo de Appwrite llegaba al cliente: nombra la base, la colección
 * y los atributos, y en los rechazos por esquema desalineado incluye el
 * payload. Los errores de runtime (TypeError y compañía) exponen internals del
 * mismo modo.
 *
 * El criterio es el que ya usaba `auth_login` para no permitir enumerar
 * cuentas, generalizado: los `throw new Error(...)` escritos por nosotros son
 * texto pensado para el usuario y se devuelven tal cual; cualquier otra cosa
 * se registra completa en el servidor y afuera sale un mensaje genérico.
 */

export const MENSAJE_GENERICO =
	'No pudimos completar la operación. Probá de nuevo; si el problema sigue, avisanos.';

/** Errores de runtime: nunca son texto para mostrarle a alguien. */
const ERRORES_DE_RUNTIME = new Set([
	'TypeError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'EvalError',
	'URIError'
]);

/** AppwriteException extiende Error y suma code/type/response. */
function esDeAppwrite(error: any): boolean {
	if (!error || typeof error !== 'object') return false;
	return (
		error.name === 'AppwriteException' ||
		typeof error.code === 'number' ||
		typeof error.type === 'string' ||
		typeof error.response === 'string'
	);
}

/**
 * Devuelve el mensaje que puede ver el cliente.
 *
 * @param contexto Etiqueta para el log del servidor (p. ej. 'createProduct').
 */
export function mensajeParaCliente(error: any, contexto?: string): string {
	const etiqueta = contexto ? `[${contexto}]` : '[Error interno]';

	if (esDeAppwrite(error) || ERRORES_DE_RUNTIME.has(error?.name)) {
		console.error(etiqueta, error);
		return MENSAJE_GENERICO;
	}

	if (error instanceof Error && error.message) {
		return error.message;
	}

	console.error(etiqueta, error);
	return MENSAJE_GENERICO;
}
