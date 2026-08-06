import { Client, Databases, Users, Storage, Account } from 'node-appwrite';
import { APPWRITE_API_KEY } from 'astro:env/server';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';

const DEFAULT_ENDPOINT = 'https://aw.orbitalnest.net/v1';
const DEFAULT_PROJECT_ID = '6a6a5321001439f06817';
const DEFAULT_API_KEY = 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const clean = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

export const createAdminClient = () => {
    const rawEndpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || PUBLIC_APPWRITE_ENDPOINT || NEXT_PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT;
    const rawProjectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || PUBLIC_APPWRITE_PROJECT_ID || NEXT_PUBLIC_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID;
    const rawApiKey = process.env.APPWRITE_API_KEY || APPWRITE_API_KEY || DEFAULT_API_KEY;

    const endpoint = clean(rawEndpoint) || DEFAULT_ENDPOINT;
    const projectId = clean(rawProjectId) || DEFAULT_PROJECT_ID;
    const apiKey = clean(rawApiKey) || DEFAULT_API_KEY;

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
