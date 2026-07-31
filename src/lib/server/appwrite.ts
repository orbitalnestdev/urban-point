import { Client, Databases, Users, Storage, Account } from 'node-appwrite';
import { APPWRITE_API_KEY } from 'astro:env/server';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';

const clean = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

export const createAdminClient = () => {
    const rawEndpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || PUBLIC_APPWRITE_ENDPOINT || NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
    const rawProjectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || PUBLIC_APPWRITE_PROJECT_ID || NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
    const rawApiKey = process.env.APPWRITE_API_KEY || APPWRITE_API_KEY || '';

    const endpoint = clean(rawEndpoint) || 'https://aw.orbitalnest.net/v1';
    const projectId = clean(rawProjectId) || '6a6a5321001439f06817';
    const apiKey = clean(rawApiKey);

    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId);
    
    if (apiKey) {
        client.setKey(apiKey);
    }

    return {
        client,
        get databases() {
            return new Databases(client);
        },
        get users() {
            return new Users(client);
        },
        get storage() {
            return new Storage(client);
        },
        get account() {
            return new Account(client);
        }
    };
};
