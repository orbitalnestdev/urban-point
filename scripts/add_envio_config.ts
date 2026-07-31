import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID as string)
    .setKey(process.env.APPWRITE_API_KEY as string);

const db = new Databases(client);

async function main() {
    try {
        console.log('Adding envio_config to products...');
        await db.createStringAttribute('urbanpoint', 'products', 'envio_config', 5000, false);
        console.log('Success! Attribute added.');
    } catch(e: any) {
        console.log('Error adding envio_config:', e.message);
    }
}
main();
