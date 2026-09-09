import { createAdminClient } from './appwrite';
import { Query } from 'node-appwrite';

export interface CollectionBanner {
	$id: string;
	nombre: string;
	imagen_url?: string;
	link_url?: string;
	orden?: number;
	activo?: boolean;
}

// Mismo patrón que settings.ts: una promesa cacheada con TTL corto, para no
// pegarle a Appwrite en cada request de la home, pero sin arrastrar los
// banners a la caché de catálogo (pensada para miles de productos, no para
// esta lista de a lo sumo un puñado de filas).
let bannersCachePromise: Promise<CollectionBanner[]> | null = null;
let bannersCacheAt = 0;
const BANNERS_CACHE_TTL_MS = 60 * 1000;

export function invalidateBannersCache(): void {
	bannersCachePromise = null;
	bannersCacheAt = 0;
}

/** Banners visibles en la home: sólo los activos, en orden. Cacheado. */
export async function getActiveBanners(): Promise<CollectionBanner[]> {
	const now = Date.now();
	if (bannersCachePromise && now - bannersCacheAt < BANNERS_CACHE_TTL_MS) {
		return bannersCachePromise;
	}
	bannersCacheAt = now;
	bannersCachePromise = fetchActiveBanners();
	return bannersCachePromise;
}

async function fetchActiveBanners(): Promise<CollectionBanner[]> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments('urbanpoint', 'collection_banners', [
			Query.equal('activo', true),
			Query.orderAsc('orden'),
			Query.limit(50)
		]);
		return res.documents as unknown as CollectionBanner[];
	} catch (e) {
		// Si la colección todavía no existe o falla la consulta, la sección
		// simplemente no se muestra — no puede tumbar la home.
		console.error('No se pudieron leer los banners de colecciones:', e);
		invalidateBannersCache();
		return [];
	}
}

/** Todos los banners (incluye ocultos). Lo usa el panel de admin, sin cache. */
export async function getAllBanners(): Promise<CollectionBanner[]> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments('urbanpoint', 'collection_banners', [
			Query.orderAsc('orden'),
			Query.limit(50)
		]);
		return res.documents as unknown as CollectionBanner[];
	} catch (e) {
		console.error('No se pudieron leer los banners de colecciones (admin):', e);
		return [];
	}
}
