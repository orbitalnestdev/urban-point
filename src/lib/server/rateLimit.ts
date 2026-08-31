/**
 * Limitador de tasa en memoria, por clave y ventana deslizante.
 *
 * El alta pública de canillitas deduplicaba por email exacto, lo cual frena el
 * reenvío accidental pero no un abuso: variando el email en cada intento se
 * creaban documentos con DNI y CBU sin tope, y se disparaba un mail a los
 * administradores por cada uno. La IP ya se guardaba en el documento, pero no
 * se usaba para nada.
 *
 * En memoria alcanza porque el adaptador de Node corre un solo proceso. Si
 * algún día hay varias instancias, esto tiene que pasar a un store compartido:
 * el límite sería por instancia y no global.
 */

export interface Limitador {
	/** ¿Se permite un intento más para esta clave? Lo registra si sí. */
	permitir(clave: string, ahora?: number): boolean;
	/** Intentos que quedan en la ventana actual, sin registrar nada. */
	restantes(clave: string, ahora?: number): number;
	/** Borra el historial de una clave (para tests y para casos puntuales). */
	reiniciar(clave: string): void;
}

/**
 * @param maximo    Intentos permitidos por ventana.
 * @param ventanaMs Largo de la ventana en milisegundos.
 * @param maxClaves Tope de claves distintas en memoria, para que el Map no
 *                  crezca sin límite ante un ataque distribuido.
 */
export function crearLimitador(maximo: number, ventanaMs: number, maxClaves = 5000): Limitador {
	const registros = new Map<string, number[]>();

	const vigentes = (clave: string, ahora: number): number[] => {
		const previos = registros.get(clave);
		if (!previos) return [];
		return previos.filter((t) => ahora - t < ventanaMs);
	};

	return {
		permitir(clave: string, ahora: number = Date.now()): boolean {
			const activos = vigentes(clave, ahora);

			if (activos.length >= maximo) {
				// Se guarda la lista podada igual: si no, una clave saturada
				// nunca se limpia y queda ocupando memoria para siempre.
				registros.set(clave, activos);
				return false;
			}

			if (!registros.has(clave) && registros.size >= maxClaves) {
				// Se descarta la clave más vieja (orden de inserción del Map).
				const masVieja = registros.keys().next().value;
				if (masVieja !== undefined) registros.delete(masVieja);
			}

			activos.push(ahora);
			registros.set(clave, activos);
			return true;
		},

		restantes(clave: string, ahora: number = Date.now()): number {
			return Math.max(0, maximo - vigentes(clave, ahora).length);
		},

		reiniciar(clave: string): void {
			registros.delete(clave);
		}
	};
}
