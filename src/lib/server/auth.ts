import { Client, Account, Query } from 'node-appwrite';
import { createAdminClient } from './appwrite';

/**
 * `distribuidor` faltaba, y no era una omisión inocente: el rol se puede
 * asignar desde /admin/clientes (updateProfileRole lo acepta), el catálogo
 * tiene precio y márgenes propios para ese nivel, y el checkout se lo cobra.
 * Pero como no existía acá, getClientProfile lo trataba como "no es cliente" y
 * devolvía null: el distribuidor quedaba afuera de /mi-cuenta y su pedido se
 * guardaba SIN customer_id. Compraba a precio mayorista y la orden quedaba
 * huérfana.
 */
export type UserRole = 'admin' | 'gestion' | 'canillita' | 'cliente' | 'distribuidor';

/** Roles que compran en la tienda. Cada uno con su nivel de precio. */
export const ROLES_COMPRADORES: readonly UserRole[] = ['cliente', 'distribuidor'];

/** ¿Este rol es un comprador (tiene carrito, pedidos y ficha en /mi-cuenta)? */
export function esComprador(rol?: string | null): boolean {
    return ROLES_COMPRADORES.includes(rol as UserRole);
}

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    profileId: string;
}

/**
 * Exige que quien invoca tenga alguno de los roles indicados.
 *
 * Las Astro Actions son endpoints POST accesibles directamente en
 * /_actions/<nombre>, y el middleware sólo filtra por pathname (/admin,
 * /canillita). Proteger la página NO protege la action: cada handler que
 * muta datos tiene que verificar el rol por su cuenta.
 */
export function requireRole(ctx: { locals: App.Locals }, ...roles: UserRole[]): SessionUser {
    const user = ctx.locals.user as SessionUser | undefined;
    if (!user) {
        throw new Error('Necesitás iniciar sesión para realizar esta acción.');
    }
    if (!roles.includes(user.role)) {
        throw new Error('No tenés permisos para realizar esta acción.');
    }
    return user;
}

/**
 * Jerarquía de privilegio de los roles, para la impersonación.
 *
 * Sólo el administrador puede impersonar, y sólo perfiles de rol
 * estrictamente inferior al suyo.
 *
 * Sin esta regla la impersonación era una escalada de privilegios directa: el
 * endpoint aceptaba también al rol `gestion` y el middleware adoptaba el perfil
 * destino sin mirar su rol. Un usuario `gestion` —cuya única restricción es el
 * 403 sobre /admin/configuracion y /admin/equipo— entraba a
 * /admin/clientes?role=admin, copiaba el $id de un administrador y pasaba a
 * tener rol admin en el middleware y en todas las actions.
 */
export const NIVEL_ROL: Record<string, number> = {
    admin: 3,
    gestion: 2,
    canillita: 1,
    cliente: 0,
    distribuidor: 0
};

/** Roles que se pueden impersonar con un perfil sintético (sin tocar la base). */
export const ROLES_IMPERSONABLES: readonly string[] = [
    'gestion',
    'canillita',
    'cliente',
    'distribuidor'
];

/**
 * ¿`rolActor` puede impersonar a `rolDestino`?
 *
 * Exige que el actor sea admin y que el destino esté estrictamente por debajo.
 * Un rol desconocido nunca habilita nada.
 */
export function puedeImpersonar(rolActor?: string | null, rolDestino?: string | null): boolean {
    const actor = NIVEL_ROL[rolActor ?? ''];
    const destino = NIVEL_ROL[rolDestino ?? ''];
    if (actor === undefined || destino === undefined) return false;
    return actor === NIVEL_ROL.admin && destino < actor;
}

/**
 * Devuelve el profile del cliente logueado, o null si no hay sesión de cliente.
 *
 * Acepta el contexto completo (Astro o ctx de una action, con locals+cookies)
 * o, por compatibilidad, sólo el objeto cookies. Con contexto completo reusa
 * el usuario que el middleware ya autenticó y cacheó — evita repetir
 * account.get() + listDocuments en cada página de /mi-cuenta — y memoiza el
 * resultado en locals para que layout y página compartan una única consulta.
 */
export const getClientProfile = async (ctxOrCookies: any) => {
    const hasCtx = !!ctxOrCookies && typeof ctxOrCookies === 'object' && 'cookies' in ctxOrCookies;
    const cookies = hasCtx ? ctxOrCookies.cookies : ctxOrCookies;
    const locals = hasCtx ? ctxOrCookies.locals : undefined;

    const sessionUser = locals?.user as SessionUser | undefined;
    if (sessionUser) {
        // Cliente y distribuidor son los dos roles que compran. Acá se
        // comparaba contra 'cliente' a secas, y el distribuidor caía como si
        // no tuviera sesión.
        if (!esComprador(sessionUser.role)) return null;

        // Usuario sintético del switch de desarrollo: no existe en la base.
        if (import.meta.env.DEV && sessionUser.profileId.startsWith('dev-profile-')) {
            return {
                $id: sessionUser.profileId,
                user_id: sessionUser.id,
                role: sessionUser.role,
                nombre: sessionUser.name,
                email: sessionUser.email
            };
        }

        if (!locals.__clientProfilePromise) {
            locals.__clientProfilePromise = (async () => {
                try {
                    const { databases } = createAdminClient();
                    return await databases.getDocument('urbanpoint', 'profiles', sessionUser.profileId);
                } catch (e) {
                    return null;
                }
            })();
        }
        return locals.__clientProfilePromise;
    }

    // Camino legado (llamadas que sólo pasan cookies): autentica contra Appwrite.
    const sessionSecret = cookies?.get?.('up_session')?.value;
    if (!sessionSecret) return null;

    try {
        const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
        const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';

        const authClient = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setSession(sessionSecret);

        const account = new Account(authClient);
        const user = await account.get();

        const { databases } = createAdminClient();
        const profiles = await databases.listDocuments('urbanpoint', 'profiles', [
            Query.equal('user_id', user.$id)
        ]);

        if (profiles.documents.length === 0 || !esComprador(profiles.documents[0].role)) {
            return null;
        }

        return profiles.documents[0];
    } catch (e) {
        return null;
    }
};
