import type { APIRoute } from 'astro';
import { Client, Account } from 'node-appwrite';
import { invalidateSessionCache } from '../../middleware';

const DEFAULT_ENDPOINT = 'https://aw.orbitalnest.net/v1';
const DEFAULT_PROJECT_ID = '6a6a5321001439f06817';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const sessionSecret = cookies.get('up_session')?.value;
    
    if (sessionSecret) {
        try {
            const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT;
            const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID;

            const authClient = new Client()
                .setEndpoint(endpoint)
                .setProject(projectId)
                .setSession(sessionSecret);
            
            const account = new Account(authClient);
            await account.deleteSession('current');
        } catch (e) {
            console.error('Logout error:', e);
        }
    }
    
    invalidateSessionCache(sessionSecret);
    cookies.delete('up_session', { path: '/' });
    return redirect('/');
};
