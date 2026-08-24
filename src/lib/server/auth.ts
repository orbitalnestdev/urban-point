import { Client, Account, Query } from 'node-appwrite';
import { createAdminClient } from './appwrite';

export type UserRole = 'admin' | 'gestion' | 'canillita' | 'cliente';

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
        if (sessionUser.role !== 'cliente') return null;

        // Usuario sintético del switch de desarrollo: no existe en la base.
        if (import.meta.env.DEV && sessionUser.profileId.startsWith('dev-profile-')) {
            return {
                $id: sessionUser.profileId,
                user_id: sessionUser.id,
                role: 'cliente',
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

        if (profiles.documents.length === 0 || profiles.documents[0].role !== 'cliente') {
            return null;
        }

        return profiles.documents[0];
    } catch (e) {
        return null;
    }
};
