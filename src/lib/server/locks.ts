/**
 * Exclusión mutua entre requests concurrentes, para operaciones que no
 * pueden ejecutarse dos veces para la misma clave (acreditar una orden,
 * liquidar un saldo) ni tener más de una "abierta" a la vez (una solicitud
 * de cobro).
 *
 * Los checks de la forma "leer si ya existe, después escribir" (el patrón
 * que tenía todo esto antes) tienen una ventana real entre la lectura y la
 * escritura: dos requests casi simultáneas —el reintento de un webhook, dos
 * pestañas, dos admins— pueden pasar ambas la lectura antes de que
 * cualquiera escriba. Appwrite no tiene transacciones ni upsert condicional,
 * pero sí garantiza que el ID de un documento es único dentro de su
 * colección: crear un documento con un ID determinístico y capturar el 409
 * si ya existe ES una primitiva atómica de "compare-and-swap" utilizable.
 *
 * Colección `processing_locks`: creada por scripts/setup_processing_locks.ts.
 * Mientras no exista, se degrada devolviendo "se pudo reclamar" siempre —el
 * mismo comportamiento sin protección que había antes— para no romper
 * checkout/liquidaciones esperando la migración.
 */
import { createAdminClient } from './appwrite';

const DB = 'urbanpoint';
const COL = 'processing_locks';

let avisoFaltaColeccion = false;

function esColeccionFaltante(e: any): boolean {
	if (!e) return false;
	if (e.code === 404) return true;
	const msg = String(e?.message || '');
	return /could not be found|not found/i.test(msg) && /collection/i.test(msg);
}

/** Convierte una clave libre en un ID de documento válido para Appwrite. */
function idDesdeClave(key: string): string {
	return key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 36);
}

/**
 * Intenta reclamar `key` en forma exclusiva. Devuelve `true` si esta llamada
 * es la que se quedó con el reclamo (puede seguir), `false` si ya estaba
 * reclamada por otra (tiene que abortar sin hacer nada).
 */
export async function intentarReclamar(key: string, motivo: string): Promise<boolean> {
	const { databases: db } = createAdminClient();
	try {
		await db.createDocument(DB, COL, idDesdeClave(key), { motivo: motivo.slice(0, 255) });
		return true;
	} catch (e: any) {
		if (esColeccionFaltante(e)) {
			if (!avisoFaltaColeccion) {
				avisoFaltaColeccion = true;
				console.warn(
					`La colección "${COL}" no existe todavía: corré scripts/setup_processing_locks.ts. ` +
						'Mientras tanto, esta operación queda sin protección real contra ejecuciones concurrentes.'
				);
			}
			return true;
		}
		// 409 (o el equivalente que use el SDK): ya existía, alguien más se
		// quedó con el reclamo primero.
		if (e?.code === 409 || /already exists/i.test(String(e?.message || ''))) {
			return false;
		}
		throw e;
	}
}

/** Libera `key` para que se pueda volver a reclamar más adelante (best-effort). */
export async function liberar(key: string): Promise<void> {
	const { databases: db } = createAdminClient();
	try {
		await db.deleteDocument(DB, COL, idDesdeClave(key));
	} catch (e: any) {
		if (esColeccionFaltante(e) || e?.code === 404) return;
		console.warn(`No se pudo liberar el reclamo "${key}":`, e?.message || e);
	}
}
