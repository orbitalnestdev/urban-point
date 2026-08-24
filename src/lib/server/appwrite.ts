import { Client, Databases, Users, Storage, Account, ID } from 'node-appwrite';
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

/**
 * Extrae o detecta el atributo desconocido en un payload cuando Appwrite
 * rechaza la escritura por desalineación de esquema.
 */
export function extractUnknownAttribute(message: string, payload: Record<string, any>): string | null {
	if (!message) return null;

	// 1. Regex de extracción de atributo desconocido
	const match = /Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i.exec(message)
		|| /Attribute\s+"?([a-zA-Z0-9_]+)"?\s+is/i.exec(message)
		|| /"([a-zA-Z0-9_]+)"/i.exec(message);

	if (match && match[1] && Object.prototype.hasOwnProperty.call(payload, match[1])) {
		return match[1];
	}

	// 2. Búsqueda directa en claves del payload si la regex no extrajo coincidencia exacta
	for (const key of Object.keys(payload)) {
		if (
			message.includes(`"${key}"`) ||
			message.includes(`:${key}`) ||
			message.includes(` ${key} `) ||
			message.includes(` ${key}.`) ||
			message.includes(`:${key}.`)
		) {
			return key;
		}
	}

	return null;
}

/**
 * Escribe o actualiza un documento tolerando diferencias de esquema con Appwrite.
 *
 * Si Appwrite rechaza la escritura con `Invalid document structure: Unknown attribute: "X"`,
 * extrae el nombre del atributo inexistente, lo remueve del payload y reintenta la operación.
 */
export async function escribirDocumentoTolerante(
	coleccion: string,
	data: Record<string, any>,
	docId?: string,
	databaseId: string = 'urbanpoint'
) {
	const { databases } = createAdminClient();
	const payload: Record<string, any> = { ...data };

	for (let intento = 0; intento < 10; intento++) {
		try {
			if (docId) {
				return await databases.updateDocument(databaseId, coleccion, docId, payload);
			}
			return await databases.createDocument(databaseId, coleccion, ID.unique(), payload);
		} catch (e: any) {
			const msg = String(e?.message || e || '');
			const attr = extractUnknownAttribute(msg, payload);

			if (attr && Object.prototype.hasOwnProperty.call(payload, attr)) {
				console.warn(`La colección "${coleccion}" no tiene el atributo "${attr}": se omite y se reintenta.`);
				delete payload[attr];
				continue;
			}
			throw e;
		}
	}
	throw new Error(`No se pudo guardar en ${coleccion}: demasiados atributos desconocidos en el payload.`);
}

