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

export const getOptimizedImageUrl = (url?: string | null, width = 400, height = 400, quality = 80): string => {
  if (!url) return '';
  const cleanUrl = url.trim();
  if (cleanUrl.includes('/storage/buckets/') && cleanUrl.includes('/files/') && cleanUrl.includes('/view')) {
    return cleanUrl.replace('/view', `/preview?width=${width}&height=${height}&output=webp&quality=${quality}`);
  }
  return cleanUrl;
};

export const getCachedCatalog = async () => {
  const cache = globalObj.__urbanpointCache;
  const now = Date.now();

  if (cache.products && (now - cache.lastFetch < CACHE_TTL)) {
    return cache;
  }

  try {
    const { databases } = createAdminClient();
    cache.degradado = false;

    // Fetch all products
    const allProducts: any[] = [];
    let pOffset = 0;
    while (true) {
      const pRes = await databases.listDocuments('urbanpoint', 'products', [
        Query.notEqual('estado', 'borrador'),
        Query.limit(100),
        Query.offset(pOffset),
        Query.orderDesc('$createdAt')
      ]);
      allProducts.push(...pRes.documents);
      if (pRes.documents.length < 100) break;
      pOffset += 100;
    }

    // Fetch all categories
    const allCategories: any[] = [];
    let cOffset = 0;
    while (true) {
      const cRes = await databases.listDocuments('urbanpoint', 'categories', [
        Query.limit(100),
        Query.offset(cOffset)
      ]);
      allCategories.push(...cRes.documents);
      if (cRes.documents.length < 100) break;
      cOffset += 100;
    }

    // Fetch all pickup points
    const allPickupPoints: any[] = [];
    let pkOffset = 0;
    while (true) {
      const pkRes = await databases.listDocuments('urbanpoint', 'pickup_points', [
        Query.limit(100),
        Query.offset(pkOffset)
      ]);
      allPickupPoints.push(...pkRes.documents);
      if (pkRes.documents.length < 100) break;
      pkOffset += 100;
    }

    cache.products = allProducts.filter((p: any) => p.estado === 'activo' || !p.estado);
    cache.categories = allCategories;
    cache.pickupPoints = allPickupPoints
      .filter((p: any) => p.estado === 'activo' || !p.estado)
      .map((p: any) => ({
        $id: p.$id,
        nombre_comercial: p.nombre_comercial,
        direccion: p.direccion,
        localidad: p.localidad,
        provincia: p.provincia,
        horarios: p.horarios,
        lat: p.lat,
        lng: p.lng,
        slug: p.slug || '',
        telefono: p.telefono || ''
      }));

    cache.lastFetch = now;
  } catch (err: any) {
    console.error('[Cache] Fatal Appwrite connection error:', err.message);
    cache.degradado = true;
    if (!cache.products) cache.products = [];
    if (!cache.categories) cache.categories = [];
    if (!cache.pickupPoints) cache.pickupPoints = [];
  }

  return cache;
};

export const getAdminCachedCatalog = async () => {
  const cache = globalObj.__urbanpointAdminCache || {
    products: null,
    categories: null,
    lastFetch: 0
  };
  globalObj.__urbanpointAdminCache = cache;

  const now = Date.now();
  if (cache.products && (now - cache.lastFetch < 15000)) { // 15s TTL
    return cache;
  }

  try {
    const { databases } = createAdminClient();

    // Fetch all products
    const allProducts: any[] = [];
    let pOffset = 0;
    while (true) {
      const pRes = await databases.listDocuments('urbanpoint', 'products', [
        Query.limit(100),
        Query.offset(pOffset),
        Query.orderDesc('$createdAt')
      ]);
      allProducts.push(...pRes.documents);
      if (pRes.documents.length < 100) break;
      pOffset += 100;
    }

    // Fetch all categories
    const allCategories: any[] = [];
    let cOffset = 0;
    while (true) {
      const cRes = await databases.listDocuments('urbanpoint', 'categories', [
        Query.limit(100),
        Query.offset(cOffset)
      ]);
      allCategories.push(...cRes.documents);
      if (cRes.documents.length < 100) break;
      cOffset += 100;
    }

    cache.products = allProducts;
    cache.categories = allCategories;
    cache.lastFetch = now;
  } catch (err: any) {
    console.error('[AdminCache] Error:', err.message);
    if (!cache.products) cache.products = [];
    if (!cache.categories) cache.categories = [];
  }

  return cache;
};

export const invalidateCatalogCache = () => {
  if (globalObj.__urbanpointCache) {
    globalObj.__urbanpointCache.products = null;
    globalObj.__urbanpointCache.categories = null;
    globalObj.__urbanpointCache.pickupPoints = null;
    globalObj.__urbanpointCache.lastFetch = 0;
  }
  if (globalObj.__urbanpointAdminCache) {
    globalObj.__urbanpointAdminCache.products = null;
    globalObj.__urbanpointAdminCache.categories = null;
    globalObj.__urbanpointAdminCache.lastFetch = 0;
  }
};



