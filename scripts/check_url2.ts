import { Client, Databases } from 'node-appwrite';
const client = new Client().setEndpoint('https://aw.orbitalnest.net/v1').setProject('6a6a5321001439f06817').setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
db.listDocuments('urbanpoint', 'products').then(res => {
  console.log(JSON.stringify(res.documents.map(d => d.portada_url), null, 2));
});
