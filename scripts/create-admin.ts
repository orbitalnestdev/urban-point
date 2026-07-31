import { Client, Databases, Users, ID, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envLocalPath = join(__dirname, '../.env.local');
const envPath = join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

const client = new Client()
    .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
    .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const db = new Databases(client);
const users = new Users(client);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function createAdmin() {
    try {
        console.log("=== Crear Usuario Administrador ===");
        const nombre = await question("Nombre completo: ");
        const email = await question("Email: ");
        const password = await question("Contraseña (min 8 caracteres): ");

        if (password.length < 8) {
            console.error("❌ La contraseña debe tener al menos 8 caracteres.");
            rl.close();
            return;
        }

        // 1. Crear usuario en Auth
        console.log("Creando usuario en Auth...");
        let userId;
        try {
            const newUser = await users.create(ID.unique(), email, undefined, password, nombre);
            userId = newUser.$id;
        } catch (e: any) {
            if (e.code === 409) {
                console.log("⚠️ El email ya está registrado en Auth. Buscando ID...");
                const existingUsers = await users.list([Query.equal('email', email)]);
                userId = existingUsers.users[0].$id;
                
                // Actualizar contraseña si ya existe
                await users.updatePassword(userId, password);
                console.log("Contraseña actualizada para el usuario existente.");
            } else {
                throw e;
            }
        }

        // 2. Verificar/Crear Perfil en base de datos
        console.log("Verificando perfil de administrador...");
        const profilesRes = await db.listDocuments('urbanpoint', 'profiles', [
            Query.equal('user_id', userId)
        ]);

        if (profilesRes.documents.length > 0) {
            const profile = profilesRes.documents[0];
            await db.updateDocument('urbanpoint', 'profiles', profile.$id, {
                role: 'admin',
                nombre: nombre
            });
            console.log("✅ Perfil existente actualizado a rol 'admin'.");
        } else {
            await db.createDocument('urbanpoint', 'profiles', ID.unique(), {
                user_id: userId,
                role: 'admin',
                nombre: nombre,
                email: email,
                saldo_disponible_centavos: 0
            });
            console.log("✅ Nuevo perfil de administrador creado.");
        }

        console.log("\n🎉 ¡Administrador listo!");
        console.log(`Podés iniciar sesión en http://localhost:4321/login con ${email}`);

    } catch (error) {
        console.error("❌ Error al crear administrador:", error);
    } finally {
        rl.close();
    }
}

createAdmin();
