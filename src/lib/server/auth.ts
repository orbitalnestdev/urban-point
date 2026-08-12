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

export const getClientProfile = async (cookies: any) => {
    const sessionSecret = cookies.get('up_session')?.value;
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
