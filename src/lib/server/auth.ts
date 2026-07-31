import { Client, Account, Query } from 'node-appwrite';
import { createAdminClient } from './appwrite';

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
