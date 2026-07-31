import { Client, Databases, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Buscar .env.local o .env
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

async function seedCommissions() {
    try {
        console.log("Inyectando reglas de comisión de prueba...");
        
        // 1. Regla Default (7.25%)
        await db.createDocument('urbanpoint', 'commission_rules', ID.unique(), {
            alcance: 'default',
            tipo: 'porcentaje',
            valor: 725, // 7.25%
            activo: true,
            vigente_desde: new Date().toISOString()
        });
        console.log("✅ Regla Default creada (7.25%)");

        // 2. Regla para alguna categoría específica (10%)
        // Primero buscamos la categoría de Yerba
        const cats = await db.listDocuments('urbanpoint', 'categories');
        const yerbaCat = cats.documents.find(c => c.nombre === 'Yerba Mate');
        if (yerbaCat) {
            await db.createDocument('urbanpoint', 'commission_rules', ID.unique(), {
                alcance: 'categoria',
                categoria_id: yerbaCat.$id,
                tipo: 'porcentaje',
                valor: 1000, // 10.00%
                activo: true,
                vigente_desde: new Date().toISOString()
            });
            console.log(`✅ Regla Categoría 'Yerba Mate' creada (10.00%)`);
        }

        console.log("🎉 Reglas de comisión inyectadas exitosamente.");
    } catch (error) {
        console.error("❌ Error al inyectar reglas:", error);
    }
}

seedCommissions();
