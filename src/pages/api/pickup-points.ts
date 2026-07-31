import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/server/appwrite';
import { Query } from 'node-appwrite';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const { databases } = createAdminClient();
    const pickupRes = await databases.listDocuments('urbanpoint', 'pickup_points', [
      Query.equal('estado', 'activo')
    ]);
    const points = pickupRes.documents.map(p => ({
      $id: p.$id,
      nombre_comercial: p.nombre_comercial,
      direccion: p.direccion
    }));
    return new Response(JSON.stringify(points), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
