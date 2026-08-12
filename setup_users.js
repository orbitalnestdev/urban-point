import { Client, Users, Databases, ID, Query } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://aw.orbitalnest.net/v1')
    .setProject('6a6a5321001439f06817')
    .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);
const databases = new Databases(client);

const targetUsers = [
    { email: 'admin@urbanpoint.com', name: 'Admin', role: 'admin' },
    { email: 'cliente@urbanpoint.com', name: 'Cliente de Prueba', role: 'cliente' },
    { email: 'canillita@urbanpoint.com', name: 'Canillita Prueba', role: 'canillita' }
];

const password = 'urbanpoint123';

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
