import { Client, Databases, Users, Storage, Account } from 'node-appwrite';
import { APPWRITE_API_KEY } from 'astro:env/server';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';

const clean = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

export const createAdminClient = () => {
    const rawEndpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || PUBLIC_APPWRITE_ENDPOINT || NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
    const rawProjectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || PUBLIC_APPWRITE_PROJECT_ID || NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
    const rawApiKey = process.env.APPWRITE_API_KEY || APPWRITE_API_KEY || '';

    const defaultApiKey = 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';
    const endpoint = clean(rawEndpoint) || 'https://aw.orbitalnest.net/v1';
    const projectId = clean(rawProjectId) || '6a6a5321001439f06817';
    const apiKey = clean(rawApiKey) || defaultApiKey;

    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setKey(apiKey);

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
