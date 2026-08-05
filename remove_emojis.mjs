import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
    .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
    .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
    .setKey(process.env.APPWRITE_API_KEY || process.env.UP_APPWRITE_KEY || '');

const databases = new Databases(client);

async function run() {
    try {
        console.log("Fetching pickup points...");
        const response = await databases.listDocuments('urbanpoint', 'pickup_points');
        console.log(`Found ${response.documents.length} pickup points.`);

        for (const doc of response.documents) {
            let name = doc.nombre_comercial;
            // Remove the pushpin emoji and any leading spaces
            if (name.includes('📍')) {
                name = name.replace(/📍/g, '').trim();
                
                console.log(`Updating "${doc.nombre_comercial}" -> "${name}"`);
                
                await databases.updateDocument('urbanpoint', 'pickup_points', doc.$id, {
                    nombre_comercial: name
                });
            }
        }
        console.log("Finished updating pickup points.");
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
