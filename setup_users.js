import { Client, Users, Databases, ID, Query } from 'node-appwrite';

/**
 * Alta de usuarios de prueba (admin / cliente / canillita).
 *
 * La contraseña estaba escrita en el archivo y versionada, y el script
 * ademas pisa la contraseña de las cuentas que ya existen: corrido por error
 * contra la base real, dejaba al administrador con una clave conocida y
 * pública. Ahora la contraseña llega por variable de entorno y el script se
 * niega a arrancar sin ella.
 *
 *   SETUP_USERS_PASSWORD='...' APPWRITE_API_KEY='...' node setup_users.js
 */

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;
const password = process.env.SETUP_USERS_PASSWORD;

if (!apiKey) {
    console.error('Falta APPWRITE_API_KEY.');
    process.exit(1);
}

if (!password || password.length < 8) {
    console.error(
        'Falta SETUP_USERS_PASSWORD (mínimo 8 caracteres).\n' +
        'Ejemplo: SETUP_USERS_PASSWORD="..." node setup_users.js'
    );
    process.exit(1);
}

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const users = new Users(client);
const databases = new Databases(client);

const targetUsers = [
    { email: 'admin@urbanpoint.com', name: 'Admin', role: 'admin' },
    { email: 'cliente@urbanpoint.com', name: 'Cliente de Prueba', role: 'cliente' },
    { email: 'canillita@urbanpoint.com', name: 'Canillita Prueba', role: 'canillita' }
];

async function setup() {
    for (const u of targetUsers) {
        let userId;
        try {
            const list = await users.list([Query.equal('email', u.email)]);
            if (list.total > 0) {
                userId = list.users[0].$id;
                console.log(`User ${u.email} exists. Updating password...`);
                await users.updatePassword(userId, password);
            } else {
                console.log(`Creating user ${u.email}...`);
                const newUser = await users.create(ID.unique(), u.email, undefined, password, u.name);
                userId = newUser.$id;
            }

            // Check if profile exists
            const profilesList = await databases.listDocuments('urbanpoint', 'profiles', [
                Query.equal('user_id', userId)
            ]);

            if (profilesList.total === 0) {
                console.log(`Creating profile for ${u.email} with role ${u.role}...`);
                await databases.createDocument('urbanpoint', 'profiles', ID.unique(), {
                    user_id: userId,
                    role: u.role,
                    nombre: u.name,
                    email: u.email
                });
            } else {
                console.log(`Profile for ${u.email} exists.`);
            }
        } catch (e) {
            console.error(`Error with ${u.email}:`, e.message);
        }
    }
    console.log('Done setup users.');
}

setup();
