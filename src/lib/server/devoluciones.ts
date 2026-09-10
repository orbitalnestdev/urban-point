/**
 * Solicitudes de devolución.
 *
 * Las tres razones por las que alguien devuelve algo no son intercambiables:
 * cada una tiene un plazo y una resolución distinta por ley, y están
 * publicadas en /cambios-y-devoluciones. El resumen que importa acá:
 *
 * - `arrepentimiento`: 10 días corridos desde la entrega, sin causa. La Ley
 *   24.240 (art. 34) obliga a devolver el DINERO al mismo medio de pago. El
 *   saldo a favor sólo vale si el cliente lo acepta, así que la UI lo
 *   preselecciona como reintegro y avisa si se elige lo otro.
 * - `garantia`: 6 meses por defecto de fábrica; el cliente elige entre
 *   reparación, reemplazo, devolución del importe o quita.
 * - `cambio_preferencia`: cortesía, no obligación. Acá el saldo a favor es la
 *   resolución natural.
 *
 * Toda función de lectura degrada si la colección todavía no existe: el script
 * de esquema se corre a mano con credenciales, y hasta entonces el panel tiene
 * que seguir funcionando en vez de tirar un 500.
 */

import { Query, ID } from 'node-appwrite';
import { createAdminClient } from './appwrite';
import { intentarReclamar, liberar } from './locks';

const DB = 'urbanpoint';
export const COLECCION_DEVOLUCIONES = 'return_requests';

export type MotivoDevolucion = 'arrepentimiento' | 'garantia' | 'cambio_preferencia';
export type EstadoDevolucion = 'solicitada' | 'aprobada' | 'rechazada';
export type ResolucionDevolucion = 'reintegro' | 'saldo_a_favor';

/** Mientras está así, no se puede abrir otra devolución para el mismo pedido. */
export const ESTADOS_ABIERTOS: readonly EstadoDevolucion[] = ['solicitada'];

/** Días corridos para arrepentirse, contados desde la entrega (Ley 24.240). */
export const DIAS_ARREPENTIMIENTO = 10;

/** Estados del pedido sobre los que tiene sentido pedir una devolución. */
export const ESTADOS_PEDIDO_DEVOLVIBLE = ['entregado', 'retirado'] as const;

export interface SolicitudDevolucion {
	$id: string;
	order_id: string;
	profile_id: string;
	motivo: MotivoDevolucion;
	detalle?: string | null;
	estado: EstadoDevolucion;
	resolucion?: ResolucionDevolucion | null;
	monto_centavos: number;
	dentro_de_plazo: boolean;
	solicitado_at: string;
	resuelto_at?: string | null;
	resuelto_por?: string | null;
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
	`La colección "${COLECCION_DEVOLUCIONES}" no existe todavía. ` +
	'Corré: APPWRITE_API_KEY=... npx tsx scripts/setup_return_requests.ts --apply';

/** Indica si la funcionalidad está disponible en esta base. */
export async function devolucionesDisponibles(): Promise<boolean> {
	try {
		const { databases } = createAdminClient();
		await databases.listDocuments(DB, COLECCION_DEVOLUCIONES, [Query.limit(1)]);
		return true;
	} catch (e) {
		if (esColeccionFaltante(e)) return false;
		throw e;
	}
}

/**
 * ¿Sigue en plazo para arrepentirse?
 *
 * Se cuenta desde la entrega, no desde la compra. Si no hay fecha de entrega
 * registrada se toma la de creación del pedido: es el dato más conservador que
 * hay y evita negarle el derecho a alguien por un dato que no cargamos.
 */
export function dentroDelPlazoDeArrepentimiento(entregadoAt: string | null | undefined, ahora = new Date()): boolean {
	if (!entregadoAt) return true;
	const entrega = new Date(entregadoAt);
	if (Number.isNaN(entrega.getTime())) return true;
	const dias = (ahora.getTime() - entrega.getTime()) / 86400000;
	return dias <= DIAS_ARREPENTIMIENTO;
}

/**
 * Qué resolución corresponde por defecto según el motivo.
 *
 * Para un arrepentimiento la ley pide dinero: el saldo a favor requiere que el
 * cliente lo acepte. Ver el docblock de arriba.
 */
export function resolucionSugerida(motivo: MotivoDevolucion): ResolucionDevolucion {
	return motivo === 'cambio_preferencia' ? 'saldo_a_favor' : 'reintegro';
}

/** ¿Elegir esta resolución para este motivo necesita una advertencia? */
export function requiereConsentimiento(motivo: MotivoDevolucion, resolucion: ResolucionDevolucion): boolean {
	return motivo === 'arrepentimiento' && resolucion === 'saldo_a_favor';
}

/** Devoluciones de un cliente, de la más nueva a la más vieja. */
export async function devolucionesDeCliente(profileId: string, limite = 20): Promise<SolicitudDevolucion[]> {
	if (!profileId) return [];
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_DEVOLUCIONES, [
			Query.equal('profile_id', profileId),
			Query.orderDesc('solicitado_at'),
			Query.limit(limite)
		]);
		return res.documents as unknown as SolicitudDevolucion[];
	} catch (e) {
		if (esColeccionFaltante(e)) return [];
		console.error('No se pudieron leer las devoluciones del cliente:', e);
		return [];
	}
}

/** La devolución abierta de un pedido, si tiene una. */
export async function devolucionAbiertaDePedido(orderId: string): Promise<SolicitudDevolucion | null> {
	if (!orderId) return null;
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_DEVOLUCIONES, [
			Query.equal('order_id', orderId),
			Query.equal('estado', [...ESTADOS_ABIERTOS]),
			Query.limit(1)
		]);
		return (res.documents[0] as unknown as SolicitudDevolucion) || null;
	} catch (e) {
		if (esColeccionFaltante(e)) return null;
		throw e;
	}
}

/** Todas las devoluciones, para el panel. Las pendientes primero. */
export async function devolucionesParaPanel(limite = 200): Promise<SolicitudDevolucion[]> {
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_DEVOLUCIONES, [
			Query.orderDesc('solicitado_at'),
			Query.limit(limite)
		]);
		const docs = res.documents as unknown as SolicitudDevolucion[];
		return docs.sort((a, b) => {
			const abiertaA = ESTADOS_ABIERTOS.includes(a.estado) ? 0 : 1;
			const abiertaB = ESTADOS_ABIERTOS.includes(b.estado) ? 0 : 1;
			return abiertaA - abiertaB;
		});
	} catch (e) {
		if (esColeccionFaltante(e)) return [];
		console.error('No se pudieron leer las devoluciones:', e);
		return [];
	}
}

/**
 * Registra una solicitud de devolución.
 *
 * El monto y el plazo los calcula quien llama a partir del pedido real, no el
 * cliente: son datos del servidor, no campos del formulario.
 */
export async function crearDevolucion(input: {
	orderId: string;
	profileId: string;
	motivo: MotivoDevolucion;
	montoCentavos: number;
	dentroDePlazo: boolean;
	detalle?: string;
}): Promise<SolicitudDevolucion> {
	const { databases } = createAdminClient();

	// Un doble clic o dos pestañas pueden pasar la lectura de
	// devolucionAbiertaDePedido antes de que cualquiera escriba. Este reclamo sí
	// es atómico (ver locks.ts); se libera cuando la solicitud se resuelve.
	const claveReclamo = `devolucion-abierta:${input.orderId}`;
	const reclamado = await intentarReclamar(claveReclamo, 'crearDevolucion');
	if (!reclamado) {
		throw new Error('Ya hay una devolución en curso para este pedido.');
	}

	try {
		const doc = await databases.createDocument(DB, COLECCION_DEVOLUCIONES, ID.unique(), {
			order_id: input.orderId,
			profile_id: input.profileId,
			motivo: input.motivo,
			detalle: (input.detalle || '').slice(0, 1000),
			estado: 'solicitada',
			monto_centavos: Math.max(0, Math.round(input.montoCentavos)),
			dentro_de_plazo: input.dentroDePlazo,
			solicitado_at: new Date().toISOString()
		});
		return doc as unknown as SolicitudDevolucion;
	} catch (e) {
		await liberar(claveReclamo);
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}

/**
 * Resuelve una solicitud. Devuelve la solicitud actualizada.
 *
 * No hace el movimiento de plata: sólo deja registro de qué se decidió. Quien
 * llama (la action) se encarga de acreditar el saldo o de mover el pedido a
 * `reembolsado`, porque esas dos cosas tienen que poder fallar sin dejar la
 * solicitud marcada como resuelta.
 */
export async function resolverDevolucion(input: {
	devolucionId: string;
	estado: Exclude<EstadoDevolucion, 'solicitada'>;
	resolucion?: ResolucionDevolucion;
	montoCentavos?: number;
	actorProfileId: string;
	notaAdmin?: string;
}): Promise<SolicitudDevolucion> {
	const { databases } = createAdminClient();

	let actual: SolicitudDevolucion | null = null;
	try {
		actual = (await databases.getDocument(DB, COLECCION_DEVOLUCIONES, input.devolucionId)) as unknown as SolicitudDevolucion;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}

	// Sin esto se podía "aprobar" una devolución ya rechazada, o acreditar el
	// saldo dos veces resolviendo la misma solicitud de nuevo.
	if (!ESTADOS_ABIERTOS.includes(actual.estado)) {
		throw new Error(`La devolución ya está "${actual.estado}": no se puede volver a resolver.`);
	}

	if (input.estado === 'aprobada' && !input.resolucion) {
		throw new Error('Para aprobar una devolución hay que elegir cómo se resuelve.');
	}

	const payload: Record<string, any> = {
		estado: input.estado,
		resuelto_at: new Date().toISOString(),
		resuelto_por: input.actorProfileId
	};
	if (input.resolucion) payload.resolucion = input.resolucion;
	if (input.notaAdmin) payload.nota_admin = input.notaAdmin.slice(0, 500);
	// El monto se puede bajar al resolver (devolución parcial), nunca subir por
	// encima de lo que se pagó.
	if (typeof input.montoCentavos === 'number') {
		payload.monto_centavos = Math.min(
			Math.max(0, Math.round(input.montoCentavos)),
			actual.monto_centavos
		);
	}

	try {
		const doc = await databases.updateDocument(DB, COLECCION_DEVOLUCIONES, input.devolucionId, payload);
		await liberar(`devolucion-abierta:${actual.order_id}`);
		return doc as unknown as SolicitudDevolucion;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}
