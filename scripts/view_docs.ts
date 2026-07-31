import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

const client = new Client()
  .setEndpoint('http://localhost/v1')
  .setProject('urbanpoint')
  .setKey('2f9f1b2b64d39fdf7d391f6cf1a77dc62768d7f872410a69a835b0266016149f1a260275811c750b3e51edc4e365064e622ef370db07dcf1dd51241f98d7e4811a21e64903df1979fb36d01bb7f6c6c770c8a60db2a5436329fc5f8e6dcd0c995cf53f7c11f71df42f778d2b7f73db16c33c375628173cf4c760cdbfcae0ecdb'); // Use key from test_database_flow

const db = new Databases(client);

async function run() {
  const docs = await db.listDocuments('urbanpoint', 'products');
  console.log('Total:', docs.documents.length);
  if(docs.documents.length > 0) {
    console.log('URL portada:', docs.documents[0].portada_url);
  }
}
run();
