/**
 * Saldo a favor del cliente.
 *
 * El saldo no se guarda: se calcula sumando los movimientos que no estén
 * `liberado`. Ver el docblock de scripts/setup_credit_ledger.ts para por qué
 * es un libro de movimientos y no un contador (spoiler: es plata, y el campo
 * `profiles.saldo_disponible_centavos` ya significa otra cosa).
 *
 * Ciclo de vida de un gasto: `reservarParaOrden` escribe un asiento negativo
 * `reservado` al crear la orden, y cuando el pago se resuelve el asiento pasa
 * a `confirmado` (se gastó) o vuelve al saldo con `liberarReserva`. Reservar
 * en el checkout y confirmar después es lo que evita que dos pedidos
 * simultáneos gasten el mismo crédito, sin quemarle el saldo al cliente que
 * abandona el pago a mitad de camino.
 *
 * Toda función de lectura degrada si la colección todavía no existe: el script
 * de esquema se corre a mano con credenciales, y hasta entonces el sitio tiene
 * que seguir funcionando en vez de tirar un 500. Las escrituras sí fallan, con
 * un mensaje que dice qué correr.
 */

import { Query, ID } from 'node-appwrite';
import { createAdminClient } from './appwrite';
import { intentarReclamar, liberar } from './locks';

const DB = 'urbanpoint';
export const COLECCION_CREDITOS = 'credit_ledger';

export type TipoMovimiento = 'emision' | 'reserva' | 'ajuste';
export type EstadoMovimiento = 'reservado' | 'confirmado' | 'liberado';

export interface MovimientoCredito {
	$id: string;
	profile_id: string;
	/** Positivo acredita, negativo consume. */
	monto_centavos: number;
	tipo: TipoMovimiento;
	estado: EstadoMovimiento;
	order_id?: string | null;
	return_id?: string | null;
	motivo?: string | null;
	creado_por?: string | null;
	created_at: string;
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
	`La colección "${COLECCION_CREDITOS}" no existe todavía. ` +
	'Corré: APPWRITE_API_KEY=... npx tsx scripts/setup_credit_ledger.ts --apply';

/** Indica si la funcionalidad está disponible en esta base. */
export async function creditosDisponibles(): Promise<boolean> {
	try {
		const { databases } = createAdminClient();
		await databases.listDocuments(DB, COLECCION_CREDITOS, [Query.limit(1)]);
		return true;
	} catch (e) {
		if (esColeccionFaltante(e)) return false;
		throw e;
	}
}

/**
 * Movimientos de un cliente, del más nuevo al más viejo.
 * Devuelve [] si la colección no existe.
 */
export async function movimientosDe(profileId: string, limite = 100): Promise<MovimientoCredito[]> {
	if (!profileId) return [];
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_CREDITOS, [
			Query.equal('profile_id', profileId),
			Query.orderDesc('created_at'),
			Query.limit(limite)
		]);
		return res.documents as unknown as MovimientoCredito[];
	} catch (e) {
		if (esColeccionFaltante(e)) return [];
		console.error('No se pudieron leer los movimientos de saldo:', e);
		return [];
	}
}

/**
 * Saldo disponible, en centavos.
 *
 * Suma todo lo que no esté liberado: las reservas todavía sin confirmar
 * cuentan como gastadas, que es justamente lo que evita gastarlas dos veces.
 * Nunca devuelve negativo — un saldo negativo sería un bug de otro lado y
 * cobrarle de más al cliente por eso sería peor que ignorarlo.
 */
export async function saldoDisponible(profileId: string): Promise<number> {
	if (!profileId) return 0;
	const movimientos = await movimientosDe(profileId, 500);
	const total = movimientos
		.filter((m) => m.estado !== 'liberado')
		.reduce((acc, m) => acc + (Number(m.monto_centavos) || 0), 0);
	return Math.max(0, total);
}

/**
 * Acredita saldo a un cliente.
 *
 * `montoCentavos` tiene que ser positivo: para descontar a mano está
 * `ajustarSaldo`, que deja explícito en el código que se está restando.
 */
export async function emitirCredito(input: {
	profileId: string;
	montoCentavos: number;
	motivo: string;
	returnId?: string;
	creadoPor?: string;
}): Promise<MovimientoCredito> {
	const monto = Math.round(input.montoCentavos);
	if (!Number.isFinite(monto) || monto <= 0) {
		throw new Error('El monto a acreditar tiene que ser mayor a cero.');
	}
	if (!input.profileId) throw new Error('Falta el cliente al que acreditar el saldo.');

	const { databases } = createAdminClient();
	try {
		// createDocument directo y no escribirDocumentoTolerante: es plata. Si
		// falta un atributo queremos el error, no un asiento mutilado.
		const doc = await databases.createDocument(DB, COLECCION_CREDITOS, ID.unique(), {
			profile_id: input.profileId,
			monto_centavos: monto,
			tipo: 'emision',
			estado: 'confirmado',
			return_id: input.returnId || null,
			motivo: (input.motivo || '').slice(0, 500),
			creado_por: input.creadoPor || null,
			created_at: new Date().toISOString()
		});
		return doc as unknown as MovimientoCredito;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}

/**
 * Ajuste manual, a favor o en contra. Se usa para corregir errores.
 * A diferencia de `emitirCredito`, acepta montos negativos.
 */
export async function ajustarSaldo(input: {
	profileId: string;
	montoCentavos: number;
	motivo: string;
	creadoPor?: string;
}): Promise<MovimientoCredito> {
	const monto = Math.round(input.montoCentavos);
	if (!Number.isFinite(monto) || monto === 0) {
		throw new Error('El ajuste no puede ser cero.');
	}
	if (!input.motivo?.trim()) {
		throw new Error('Un ajuste manual de saldo necesita un motivo.');
	}

	const { databases } = createAdminClient();
	try {
		const doc = await databases.createDocument(DB, COLECCION_CREDITOS, ID.unique(), {
			profile_id: input.profileId,
			monto_centavos: monto,
			tipo: 'ajuste',
			estado: 'confirmado',
			motivo: input.motivo.slice(0, 500),
			creado_por: input.creadoPor || null,
			created_at: new Date().toISOString()
		});
		return doc as unknown as MovimientoCredito;
	} catch (e) {
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	}
}

/** La reserva de un pedido, si tiene una (en cualquier estado). */
export async function reservaDeOrden(orderId: string): Promise<MovimientoCredito | null> {
	if (!orderId) return null;
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_CREDITOS, [
			Query.equal('order_id', orderId),
			Query.equal('tipo', 'reserva'),
			Query.limit(1)
		]);
		return (res.documents[0] as unknown as MovimientoCredito) || null;
	} catch (e) {
		if (esColeccionFaltante(e)) return null;
		throw e;
	}
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reserva saldo para un pedido. Devuelve cuánto se reservó realmente.
 *
 * El monto pedido es un techo: si el saldo alcanza para menos, se reserva lo
 * que hay. Devuelve 0 si no hay saldo.
 *
 * Hacen falta DOS reclamos, porque protegen de cosas distintas:
 *
 * - Por pedido (`credito-reserva:${orderId}`), permanente: una orden reserva
 *   una sola vez en su vida. Cubre el reintento sobre el mismo pedido.
 * - Por cliente (`credito-cliente:${profileId}`), que se suelta al terminar:
 *   serializa la lectura del saldo con su escritura. Sin esto, dos pedidos
 *   DISTINTOS del mismo cliente en simultáneo toman locks distintos, leen los
 *   dos el saldo completo antes de que cualquiera escriba, y gastan el mismo
 *   crédito dos veces.
 *
 * Si el reclamo por cliente no se consigue —hay otro checkout suyo en curso en
 * este mismo instante— se reintenta un rato y, si aun así no se puede, se
 * devuelve 0: el pedido sigue, se cobra completo y el saldo le queda intacto
 * al cliente. Es preferible a hacerle fallar una compra legítima.
 */
export async function reservarParaOrden(input: {
	profileId: string;
	orderId: string;
	hastaCentavos: number;
}): Promise<number> {
	const tope = Math.round(input.hastaCentavos);
	if (!input.profileId || !input.orderId || !Number.isFinite(tope) || tope <= 0) return 0;

	const clavePedido = `credito-reserva:${input.orderId}`;
	if (!(await intentarReclamar(clavePedido, 'reservarParaOrden'))) return 0;

	const claveCliente = `credito-cliente:${input.profileId}`;
	let turno = false;
	for (let intento = 0; intento < 5 && !turno; intento++) {
		turno = await intentarReclamar(claveCliente, 'reservarParaOrden');
		if (!turno) await espera(150);
	}
	if (!turno) {
		console.warn(`No se pudo tomar el turno de saldo de ${input.profileId}: el pedido se cobra completo.`);
		await liberar(clavePedido);
		return 0;
	}

	try {
		const disponible = await saldoDisponible(input.profileId);
		const aReservar = Math.min(disponible, tope);
		if (aReservar <= 0) {
			await liberar(clavePedido);
			return 0;
		}

		const { databases } = createAdminClient();
		await databases.createDocument(DB, COLECCION_CREDITOS, ID.unique(), {
			profile_id: input.profileId,
			monto_centavos: -aReservar,
			tipo: 'reserva',
			estado: 'reservado',
			order_id: input.orderId,
			motivo: `Saldo aplicado al pedido ${input.orderId}`,
			created_at: new Date().toISOString()
		});
		return aReservar;
	} catch (e) {
		// Si no se llegó a escribir el asiento, el reclamo del pedido tiene que
		// soltarse: si no, ese pedido nunca más podría reservar.
		await liberar(clavePedido);
		if (esColeccionFaltante(e)) throw new Error(AVISO_FALTA_COLECCION);
		throw e;
	} finally {
		// El turno del cliente se suelta siempre: si quedara tomado, no podría
		// volver a usar su saldo nunca más.
		await liberar(claveCliente);
	}
}

/**
 * Marca la reserva de un pedido como gastada. Idempotente.
 * Se llama cuando el pago se acredita.
 */
export async function confirmarReserva(orderId: string): Promise<void> {
	const reserva = await reservaDeOrden(orderId);
	if (!reserva || reserva.estado !== 'reservado') return;
	try {
		const { databases } = createAdminClient();
		await databases.updateDocument(DB, COLECCION_CREDITOS, reserva.$id, { estado: 'confirmado' });
	} catch (e) {
		console.error(`No se pudo confirmar la reserva de saldo del pedido ${orderId}:`, e);
		throw e;
	}
}

/**
 * Devuelve al saldo la reserva de un pedido que no prosperó. Idempotente.
 *
 * Nunca lanza: se llama desde el webhook de pagos y desde la cancelación de
 * una orden, y hacer fallar esos caminos por no poder devolver el crédito
 * dejaría la orden en un estado peor que el saldo sin devolver, que es algo
 * que se puede corregir a mano.
 */
export async function liberarReserva(orderId: string, motivo: string): Promise<void> {
	try {
		const reserva = await reservaDeOrden(orderId);
		if (!reserva || reserva.estado !== 'reservado') return;
		const { databases } = createAdminClient();
		await databases.updateDocument(DB, COLECCION_CREDITOS, reserva.$id, {
			estado: 'liberado',
			motivo: `${reserva.motivo || ''} · Liberado: ${motivo}`.slice(0, 500)
		});
	} catch (e) {
		console.warn(`No se pudo liberar la reserva de saldo del pedido ${orderId}:`, e);
	}
}

/**
 * Saldos de varios clientes de una sola pasada, para el panel de admin.
 * Devuelve un Map profileId -> centavos disponibles.
 */
export async function saldosPorCliente(limite = 1000): Promise<Map<string, number>> {
	const saldos = new Map<string, number>();
	try {
		const { databases } = createAdminClient();
		const res = await databases.listDocuments(DB, COLECCION_CREDITOS, [Query.limit(limite)]);
		for (const doc of res.documents as unknown as MovimientoCredito[]) {
			if (doc.estado === 'liberado') continue;
			const actual = saldos.get(doc.profile_id) || 0;
			saldos.set(doc.profile_id, actual + (Number(doc.monto_centavos) || 0));
		}
	} catch (e) {
		if (!esColeccionFaltante(e)) console.error('No se pudieron leer los saldos:', e);
		return saldos;
	}
	// Un saldo negativo no se le muestra a nadie: sería un bug de otro lado.
	for (const [id, monto] of saldos) saldos.set(id, Math.max(0, monto));
	return saldos;
}
