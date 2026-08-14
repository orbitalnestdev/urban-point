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

    cache.degradado = false;

    try {
      const pRes = await databases.listDocuments('urbanpoint', 'products', [Query.limit(100)]);
      cache.products = pRes.documents.filter((p: any) => p.estado === 'activo' || !p.estado);
    } catch (e: any) {
      console.error('[Cache] Error fetching products:', e.message);
      // Marcar la degradación: si no, un fallo del backend se ve exactamente
      // igual que un catálogo vacío y la tienda queda muda.
      cache.degradado = true;
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
        // Allowlist explícita: este objeto se serializa dentro del HTML
        // (index.astro:93), así que no puede arrastrar CBU, condición fiscal,
        // profile_id ni los tokens de Mercado Pago del punto.
        //
        // Tiene que incluir TODOS los campos que consume el front. Antes sólo
        // traía nombre y dirección, y el buscador de barrios del home filtra
        // por `localidad` y `provincia`: llegaban undefined, así que devolvía
        // cero resultados para cualquier barrio y el listado imprimía
        // "undefined" al lado de la dirección.
        .map((p: any) => ({
          $id: p.$id,
          nombre_comercial: p.nombre_comercial,
          direccion: p.direccion,
          localidad: p.localidad,
          provincia: p.provincia,
          horarios: p.horarios
        }));
    } catch (e: any) {
      if (!cache.pickupPoints) cache.pickupPoints = [];
    }

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
