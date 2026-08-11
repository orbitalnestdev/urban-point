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

export function parseActiveNodeCookie(cookieHeader?: string | null): ActiveNodeData | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${NODE_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

export function serializeActiveNodeCookie(data: ActiveNodeData): string {
  const jsonStr = JSON.stringify(data);
  return `${NODE_COOKIE_NAME}=${encodeURIComponent(jsonStr)}; Path=/; Max-Age=${NODE_COOKIE_MAX_AGE}; SameSite=Lax`;
}
