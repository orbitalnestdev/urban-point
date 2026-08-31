/**
 * Solicitudes de cobro del canillita.
 *
 * El canillita veía su libro de comisiones pero no tenía forma de pedir que se
 * las paguen: `createPayout` es admin-only y no había ningún botón. El cobro
 * dependía de que el administrador se acordara.
 *
 * Vive en su propia colección y no en `payouts` porque ahí un documento
 * significa "ya se pagó" (ver scripts/setup_payout_requests.ts).
 *
 * Toda función degrada si la colección todavía no existe: el script de esquema
 * se corre a mano con credenciales, y hasta entonces el panel tiene que seguir
 * funcionando en vez de tirar un 500.
 */

import { Query, ID } from 'node-appwrite';
import { createAdminClient } from './appwrite';

const DB = 'urbanpoint';
export const COLECCION_SOLICITUDES = 'payout_requests';

export type EstadoSolicitud = 'solicitada' | 'aprobada' | 'rechazada' | 'pagada';

/** Estados en los que la solicitud sigue viva y bloquea pedir otra. */
export const ESTADOS_ABIERTOS: readonly EstadoSolicitud[] = ['solicitada', 'aprobada'];

export interface SolicitudLiquidacion {
	$id: string;
	profile_id: string;
	monto_centavos: number;
	estado: EstadoSolicitud;
	solicitado_at: string;
	resuelto_at?: string | null;
	resuelto_por?: string | null;
	payout_id?: string | null;
	nota_canillita?: string | null;
	nota_admin?: string | null;
	[k: string]: any;
}

/** ¿El error viene de que la colección no está creada todavía? */
function esColeccionFaltante(e: any): boolean {
	if (!e) return false;
	if (e.code === 404) return true;
	const msg = String(e?.message || '');
	return /could not be found|not found/i.test(msg) && /collection/i.test(msg);
}

const AVISO_FALTA_COLECCION =
	`La colección "${COLECCION_SOLICITUDES}" no existe todavía. ` +
	'Corré: APPWRITE_API_KEY=... npx tsx scripts/setup_payout_requests.ts --apply';

/** Indica si la funcionalidad está disponible en esta base. */
export async function solicitudesDisponibles(): Promise<boolean> {
	try {
		const { databases } = createAdminClient();
		await databases.listDocuments(DB, COLECCION_SOLICITUDES, [Query.limit(1)]);
		return true;
	} catch (e) {
		if (esColeccionFaltante(e)) return false;
		throw e;
	}
}

/**
 * Solicitudes de un canillita, de la más nueva a la más vieja.
 * Devuelve [] si la colección no existe.
 */
export async function solicitudesDeCanillita(profileId: string, limite = 20): Promise<SolicitudLiquidacion[]> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_SOLICITUDES, [
			Query.equal('profile_id', profileId),
			Query.orderDesc('solicitado_at'),
			Query.limit(limite)
		]);
		return res.documents as unknown as SolicitudLiquidacion[];
	} catch (e) {
		if (esColeccionFaltante(e)) return [];
		console.error('No se pudieron leer las solicitudes de liquidación:', e);
		return [];
	}
}

/** La solicitud abierta de un canillita, si tiene una. */
export async function solicitudAbierta(profileId: string): Promise<SolicitudLiquidacion | null> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_SOLICITUDES, [
			Query.equal('profile_id', profileId),
			Query.equal('estado', [...ESTADOS_ABIERTOS]),
			Query.limit(1)
		]);
		return (res.documents[0] as unknown as SolicitudLiquidacion) || null;
	} catch (e) {
		if (esColeccionFaltante(e)) return null;
		throw e;
	}
}

/** Todas las solicitudes abiertas, para el panel de administración. */
export async function solicitudesPendientes(limite = 200): Promise<SolicitudLiquidacion[]> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_SOLICITUDES, [
			Query.equal('estado', [...ESTADOS_ABIERTOS]),
			Query.orderDesc('solicitado_at'),
			Query.limit(limite)
		]);
		return res.documents as unknown as SolicitudLiquidacion[];
	} catch (e) {
		if (esColeccionFaltante(e)) return [];
		console.error('No se pudieron leer las solicitudes pendientes:', e);
		return [];
	}
}

/**
 * Registra una solicitud de cobro.
 *
 * El monto lo calcula quien llama a partir del ledger, no el canillita: es un
 * dato del servidor, no un campo del formulario.
 */
export async function crearSolicitud(input: {
	profileId: string;
	montoCentavos: number;
	nota?: string;
}): Promise<SolicitudLiquidacion> {
	const { databases } = createAdminClient();

	try {
		const doc = await databases.createDocument(DB, COLECCION_SOLICITUDES, ID.unique(), {
			profile_id: input.profileId,
			monto_centavos: Math.round(input.montoCentavos),
			estado: 'solicitada',
			solicitado_at: new Date().toISOString(),
			nota_canillita: (input.nota || '').slice(0, 500)
		});
		return doc as unknown as SolicitudLiquidacion;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}

/** Cambia el estado de una solicitud dejando registro de quién y cuándo. */
export async function resolverSolicitud(input: {
	solicitudId: string;
	estado: EstadoSolicitud;
	actorProfileId: string;
	notaAdmin?: string;
	payoutId?: string;
}): Promise<SolicitudLiquidacion> {
	const { databases } = createAdminClient();

	const payload: Record<string, any> = {
		estado: input.estado,
		resuelto_at: new Date().toISOString(),
		resuelto_por: input.actorProfileId
	};
	if (input.notaAdmin) payload.nota_admin = input.notaAdmin.slice(0, 500);
	if (input.payoutId) payload.payout_id = input.payoutId;

	try {
		const doc = await databases.updateDocument(DB, COLECCION_SOLICITUDES, input.solicitudId, payload);
		return doc as unknown as SolicitudLiquidacion;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}

/**
 * Cierra la solicitud abierta de un canillita cuando el pago se concreta.
 *
 * Se llama desde createPayout: si el admin liquida sin pasar por la solicitud,
 * igual queda cerrada en vez de eterna. Nunca hace fallar el pago — el dinero
 * ya se movió, y una solicitud sin cerrar es un problema menor que un error
 * después de haber pagado.
 */
export async function cerrarSolicitudPorPago(profileId: string, payoutId: string): Promise<void> {
	try {
		const abierta = await solicitudAbierta(profileId);
		if (!abierta) return;
		await resolverSolicitud({
			solicitudId: abierta.$id,
			estado: 'pagada',
			actorProfileId: abierta.resuelto_por || '',
			payoutId
		});
	} catch (e) {
		console.warn(`No se pudo cerrar la solicitud de cobro de ${profileId}:`, e);
	}
}
