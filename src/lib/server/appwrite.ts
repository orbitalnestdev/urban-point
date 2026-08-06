import { Client, Databases, Users, Storage, Account } from 'node-appwrite';

const DEFAULT_ENDPOINT = 'https://aw.orbitalnest.net/v1';
const DEFAULT_PROJECT_ID = '6a6a5321001439f06817';
const DEFAULT_API_KEY = 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a';

const clean = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

let singletonClient: Client | null = null;
let singletonDatabases: Databases | null = null;
let singletonUsers: Users | null = null;
let singletonStorage: Storage | null = null;
let singletonAccount: Account | null = null;

function getSingletonClient(): Client {
    if (!singletonClient) {
        const rawEndpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT;
        const rawProjectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID;
        const rawApiKey = process.env.APPWRITE_API_KEY || DEFAULT_API_KEY;

        const endpoint = clean(rawEndpoint) || DEFAULT_ENDPOINT;
        const projectId = clean(rawProjectId) || DEFAULT_PROJECT_ID;
        const apiKey = clean(rawApiKey) || DEFAULT_API_KEY;

        singletonClient = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId);
        
        if (apiKey) {
            singletonClient.setKey(apiKey);
        }
    }
    return singletonClient;
}

export const createAdminClient = () => {
    const client = getSingletonClient();
    if (!singletonDatabases) singletonDatabases = new Databases(client);
    if (!singletonUsers) singletonUsers = new Users(client);
    if (!singletonStorage) singletonStorage = new Storage(client);
    if (!singletonAccount) singletonAccount = new Account(client);

    return {
        client,
        databases: singletonDatabases,
        users: singletonUsers,
        storage: singletonStorage,
        account: singletonAccount
    };
};
