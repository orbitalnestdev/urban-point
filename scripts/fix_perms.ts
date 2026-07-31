import { Client, Databases, Permission, Role } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: '.env.local' });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY!;

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const db = new Databases(client);

async function fixPermissions() {
    const collections = ['products', 'categories', 'pickup_points', 'orders', 'canillitas', 'commission_ledger', 'payouts'];
    
    for (const colId of collections) {
        try {
            console.log(`Setting read(Role.any()) permissions on collection '${colId}'...`);
            await db.updateCollection(
                'urbanpoint',
                colId,
                colId,
                [Permission.read(Role.any())], // Enable public read access
                false // documentSecurity
            );
            console.log(`✓ Collection '${colId}' permissions updated to read(Role.any()).`);
        } catch (e: any) {
            console.error(`X Error updating '${colId}':`, e.message);
        }
    }
}

fixPermissions();
