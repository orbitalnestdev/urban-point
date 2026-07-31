import type { APIRoute } from 'astro';
import { Client, Account } from 'node-appwrite';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const sessionSecret = cookies.get('up_session')?.value;
    
    if (sessionSecret) {
        try {
            const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
            const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';

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
    
    cookies.delete('up_session', { path: '/' });
    return redirect('/');
};
