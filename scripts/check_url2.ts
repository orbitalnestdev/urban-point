import { Client, Databases } from 'node-appwrite';
const client = new Client().setEndpoint('https://aw.orbitalnest.net/v1').setProject('6a6a5321001439f06817').setKey('standard_3baf0a2abb3d0fdac2665efd36cc68ddd47ad3ea8517c0ae76fd5c3cac164d193e8c773f80c777adcfa601440b05e722f57578f948d2d0bee6180ecae0cba2f2fb98c70bc5455ba49fe83e3ba0e579cf4ad6ecb888dc9ff51a482cbde038ef1d7caf5093be5f2ac5d8d67f86b9b49f6042e0e3bd05270c19a6601b36a144bb9a');
const db = new Databases(client);
db.listDocuments('urbanpoint', 'products').then(res => {
  console.log(JSON.stringify(res.documents.map(d => d.portada_url), null, 2));
});
