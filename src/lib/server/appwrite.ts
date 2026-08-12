import { Client, Databases, Users, Storage, Account } from 'node-appwrite';
import { env, appwriteEndpoint, appwriteProjectId } from './env';

let singletonClient: Client | null = null;
let singletonDatabases: Databases | null = null;
let singletonUsers: Users | null = null;
let singletonStorage: Storage | null = null;
let singletonAccount: Account | null = null;

function getSingletonClient(): Client {
    if (!singletonClient) {
        const endpoint = appwriteEndpoint();
        const projectId = appwriteProjectId();
        const apiKey = env('APPWRITE_API_KEY');

        // Sin API key el cliente admin no puede autorizar nada. Fallar acá, de
        // forma ruidosa, es preferible a arrancar y devolver 500 en cada request
        // (o peor: a depender de una clave hardcodeada en el repositorio).
        if (!apiKey) {
            throw new Error(
                'APPWRITE_API_KEY no está definida. El servidor no puede iniciar sin ella. ' +
                'Configurala como variable de entorno en el deploy.'
            );
        }

        singletonClient = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
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
