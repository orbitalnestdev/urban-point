import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { InputFile } from 'node-appwrite/file';
import { ID, Permission, Role } from 'node-appwrite';


export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ success: false, error: 'No se envió ningún archivo válido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { storage } = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadedFile = await storage.createFile(
      'products',
      ID.unique(),
      InputFile.fromBuffer(buffer, file.name || 'imagen.jpg'),
      [Permission.read(Role.any())]
    );

    const publicUrl = `${PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/products/files/${uploadedFile.$id}/view?project=${PUBLIC_APPWRITE_PROJECT_ID}`;

    return new Response(JSON.stringify({ success: true, url: publicUrl, fileId: uploadedFile.$id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error al subir imagen a Appwrite Storage:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Error de almacenamiento' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
