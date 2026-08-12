/**
 * Serialización segura de datos embebidos en un <script>. [M-17]
 *
 * JSON.stringify no escapa `</script>`, así que un valor que venga de la base
 * —por ejemplo el nombre comercial de un punto— con `</script><img src=x
 * onerror=...>` cierra el bloque y ejecuta código en la home, el mapa y el
 * checkout. También se escapan los separadores de línea U+2028 y U+2029, que
 * rompen los literales de JavaScript.
 *
 * La salida sigue siendo JSON válido: JSON.parse la reconstruye igual.
 */
const SEPARADOR_LINEA = String.fromCharCode(0x2028);
const SEPARADOR_PARRAFO = String.fromCharCode(0x2029);

export function toSafeJson(value: unknown): string {
	return JSON.stringify(value)
		.split('<').join('\\u003c')
		.split('>').join('\\u003e')
		.split('&').join('\\u0026')
		.split(SEPARADOR_LINEA).join('\\u2028')
		.split(SEPARADOR_PARRAFO).join('\\u2029');
}
