import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { InputFile } from 'node-appwrite/file';
import { ID, Permission, Role } from 'node-appwrite';

export const prerender = false;

/** 5 MB: de sobra para una foto de producto. */
const MAX_BYTES = 5 * 1024 * 1024;

const TIPOS_PERMITIDOS = new Map<string, string>([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['image/avif', 'avif'],
	['image/gif', 'gif']
]);

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

/**
 * Subida de imágenes de producto. [M-13]
 *
 * Estaba abierta a internet: no verificaba sesión —el middleware sólo protege
 * /admin y /canillita, no /api—, no validaba tipo, extensión ni tamaño, y
 * cargaba el archivo entero en memoria antes de cualquier chequeo. Todo lo
 * subido quedaba con lectura pública, así que servía de hosting gratuito de
 * contenido arbitrario bajo el dominio del proyecto.
 */
export const POST: APIRoute = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || (user.role !== 'admin' && user.role !== 'gestion')) {
		return json({ success: false, error: 'No autorizado' }, 403);
	}

	try {
		// Se corta por Content-Length antes de leer el cuerpo, para no bufferear
		// en memoria un archivo que igual se va a rechazar.
		const declarado = Number(request.headers.get('content-length') || 0);
		if (declarado > MAX_BYTES) {
			return json({ success: false, error: 'El archivo supera los 5 MB' }, 413);
		}

		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || typeof file === 'string') {
			return json({ success: false, error: 'No se envió ningún archivo válido' }, 400);
		}

		const extension = TIPOS_PERMITIDOS.get(file.type);
		if (!extension) {
			return json(
				{ success: false, error: `Tipo de archivo no permitido: ${file.type || 'desconocido'}` },
				415
			);
		}

		// El tamaño real puede no coincidir con el Content-Length declarado.
		if (file.size > MAX_BYTES) {
			return json({ success: false, error: 'El archivo supera los 5 MB' }, 413);
		}

		const buffer = Buffer.from(await file.arrayBuffer());

		// Nombre derivado del tipo verificado: el original lo controla quien
		// sube y se pasaba tal cual al storage.
		const nombreSeguro = `${ID.unique()}.${extension}`;

		const { storage } = createAdminClient();
		const uploadedFile = await storage.createFile(
			'products',
			ID.unique(),
			InputFile.fromBuffer(buffer, nombreSeguro),
			[Permission.read(Role.any())]
		);

		const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
		const project = process.env.PUBLIC_APPWRITE_PROJECT_ID || 'urbanpoint';
		const publicUrl = `${endpoint}/storage/buckets/products/files/${uploadedFile.$id}/view?project=${project}`;

		return json({ success: true, url: publicUrl, fileId: uploadedFile.$id }, 200);
	} catch (error: any) {
		console.error('Error al subir imagen a Appwrite Storage:', error);
		return json({ success: false, error: 'No se pudo subir la imagen' }, 500);
	}
};
