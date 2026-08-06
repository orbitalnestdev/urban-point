import { Client, Databases, Query } from 'node-appwrite';
import { createAdminClient } from './appwrite';

const globalObj = global as any;

if (!globalObj.__urbanpointCache) {
  globalObj.__urbanpointCache = {
    products: null,
    categories: null,
    pickupPoints: null,
    lastFetch: 0
  };
}

const CACHE_TTL = 30000; // 30 seconds

export const getCachedCatalog = async () => {
  const cache = globalObj.__urbanpointCache;
  const now = Date.now();

  if (cache.products && (now - cache.lastFetch < CACHE_TTL)) {
    return cache;
  }

  try {
    const { databases } = createAdminClient();

    try {
      const pRes = await databases.listDocuments('urbanpoint', 'products', [Query.limit(100)]);
      cache.products = pRes.documents.filter((p: any) => p.estado === 'activo' || !p.estado);
    } catch (e: any) {
      console.error('[Cache] Error fetching products:', e.message);
      if (!cache.products) cache.products = [];
    }

    try {
      const cRes = await databases.listDocuments('urbanpoint', 'categories', [Query.limit(100)]);
      cache.categories = cRes.documents;
    } catch (e: any) {
      if (!cache.categories) cache.categories = [];
    }

    try {
      const pkRes = await databases.listDocuments('urbanpoint', 'pickup_points', [Query.limit(100)]);
      cache.pickupPoints = pkRes.documents
        .filter((p: any) => p.estado === 'activo' || !p.estado)
        .map((p: any) => ({
          $id: p.$id,
          nombre_comercial: p.nombre_comercial,
          direccion: p.direccion
        }));
    } catch (e: any) {
      if (!cache.pickupPoints) cache.pickupPoints = [];
    }

    cache.lastFetch = now;
  } catch (err: any) {
    console.error('[Cache] Fatal Appwrite connection error:', err.message);
    if (!cache.products) cache.products = [];
    if (!cache.categories) cache.categories = [];
    if (!cache.pickupPoints) cache.pickupPoints = [];
  }

  return cache;
};
