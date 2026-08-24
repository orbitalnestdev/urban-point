/**
 * Utilidades de saneo de HTML.
 *
 * - `escapeHtml`: para interpolar texto plano dentro de HTML (innerHTML,
 *   atributos). Escapa los cinco caracteres especiales.
 * - `sanitizeRichHtml`: para HTML "rico" que viene de la base (descripciones
 *   de producto cargadas desde el admin) y se renderiza con set:html.
 *
 * Ambas son funciones puras sin dependencias, testeables de forma aislada.
 */

/** Escapa & < > " ' para interpolar texto plano en HTML. */
export function escapeHtml(str: unknown): string {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Saneo best-effort con regex de HTML rico.
 *
 * Elimina bloques <script>/<style>/<iframe>/<object>/<embed> (con su
 * contenido), atributos on* (onclick, onerror, ...) y URLs javascript: en
 * href/src y similares.
 *
 * OJO: un saneador a regex nunca es tan robusto como un parser real (DOMPurify
 * o similar). Acá el HTML lo carga el admin —no un tercero anónimo—, así que
 * el objetivo es cortar los vectores obvios de XSS almacenado sin sumar una
 * dependencia. Si algún día la descripción la editan usuarios no confiables,
 * reemplazar por un saneador basado en parser.
 */
export function sanitizeRichHtml(html: unknown): string {
	let out = String(html ?? '');

	// Bloques peligrosos completos (tag de apertura + contenido + cierre).
	// Se repite hasta estabilizar para cubrir anidados tipo <scr<script>ipt>.
	const bloquePeligroso = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi;
	let previo;
	do {
		previo = out;
		out = out.replace(bloquePeligroso, '');
	} while (out !== previo);

	// Tags peligrosos sueltos (sin cierre, autocerrados o cierres huérfanos).
	out = out.replace(/<\/?(script|style|iframe|object|embed)\b[^>]*>/gi, '');

	// Atributos de eventos: on* con valor entre comillas dobles, simples o sin comillas.
	out = out
		.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
		.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
		.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

	// URLs javascript: en atributos de navegación/carga.
	out = out.replace(
		/\s(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi,
		' $1="#"'
	);

	return out;
}
