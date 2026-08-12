import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://aw.orbitalnest.net/v1')
    .setProject('6a6a5321001439f06817')
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

async function addAttribute() {
    try {
        console.log('Adding precio_promocional to products collection...');
        await databases.createFloatAttribute(
            'urbanpoint',
            'products',
            'precio_promocional',
            false,
            0.0
        );
        console.log('Success! Waiting for attribute to be available...');
        
        // Wait for it to become available
        let isReady = false;
        while (!isReady) {
            await new Promise(r => setTimeout(r, 2000));
            const attr = await databases.getAttribute('urbanpoint', 'products', 'precio_promocional');
            isReady = attr.status === 'available';
            console.log(`Status: ${attr.status}`);
        }
        
        console.log('Attribute is ready.');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('Attribute already exists')) {
            console.log('Attribute already exists.');
        } else {
            console.error('Error:', e);
        }
    }
}

addAttribute();
