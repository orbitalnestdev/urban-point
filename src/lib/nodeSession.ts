export interface ActiveNodeData {
  id: string;
  nombre: string;
  slug: string;
  direccion: string;
  localidad?: string;
  horarios?: string;
  canillitaId?: string;
  telefono?: string;
}

export const NODE_COOKIE_NAME = 'up_active_node';
export const NODE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Cookie del código de referido activo. Fuente única de la atribución.
 * Política: last-touch, ventana de 30 días. Ver src/middleware.ts.
 */
export const REF_COOKIE_NAME = 'up_ref';
export const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Serializa el nodo activo para guardarlo como VALOR de cookie. [C-02]
 *
 * Devuelve JSON plano, no un header Set-Cookie. Astro.cookies.set() ya se
 * encarga de aplicar encodeURIComponent y de agregar Path/Max-Age/SameSite
 * a partir de sus opciones.
 *
 * La versión anterior devolvía el header completo
 * ("up_active_node=%7B...%7D; Path=/; Max-Age=...") y [slug].astro lo pasaba
 * como valor, con lo que Astro lo volvía a codificar. El resultado no era
 * JSON parseable y la atribución al punto de retiro nunca funcionó: en
 * producción los 19 pedidos quedaron con origin_node_id en null.
 */
export function serializeActiveNodeCookie(data: ActiveNodeData): string {
  return JSON.stringify(data);
}

/** Reconstruye el nodo a partir del valor de la cookie (ya decodificado). */
export function parseActiveNodeValue(value?: string | null): ActiveNodeData | null {
  if (!value) return null;

  const intentos = [value];
  // Tolera valores que hayan quedado codificados, por compatibilidad con
  // cookies emitidas por la versión anterior.
  try {
    const decodificado = decodeURIComponent(value);
    if (decodificado !== value) intentos.push(decodificado);
  } catch {
    // decodeURIComponent falla ante un '%' suelto: se sigue con el crudo.
  }

  for (const intento of intentos) {
    try {
      const parsed = JSON.parse(intento);
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
        return parsed as ActiveNodeData;
      }
    } catch {
      // Se prueba el siguiente candidato.
    }
  }
  return null;
}

/**
 * Reconstruye el nodo a partir de un header Cookie crudo
 * (Astro.request.headers.get('cookie') o document.cookie), donde el valor
 * todavía viene percent-encoded.
 */
export function parseActiveNodeCookie(cookieHeader?: string | null): ActiveNodeData | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${NODE_COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  return parseActiveNodeValue(match[1]);
}
