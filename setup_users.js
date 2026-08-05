import { Client, Users, Databases, ID, Query } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://aw.orbitalnest.net/v1')
    .setProject('6a6a5321001439f06817')
    .setKey(process.env.APPWRITE_API_KEY || 'standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a');

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
