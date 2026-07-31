import { Client, Databases, Users } from 'node-appwrite';
import { APPWRITE_API_KEY } from 'astro:env/server';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';

export const createAdminClient = () => {
    const endpoint = PUBLIC_APPWRITE_ENDPOINT || NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
    const projectId = PUBLIC_APPWRITE_PROJECT_ID || NEXT_PUBLIC_APPWRITE_PROJECT_ID || '679c1ab70038cb12bc4f';

    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setKey(APPWRITE_API_KEY);

    return {
        get databases() {
            return new Databases(client);
        },
        get users() {
            return new Users(client);
        }
    };
};
