/**
 * Máquina de estados del pedido [C-04, M-03].
 */
import { describe, it, expect } from 'vitest';
import {
	normalizarEstadoPedido,
	esTransicionValida,
	transicionesPosibles,
	esTerminal,
	ESTADOS_PEDIDO,
	ETIQUETAS
} from '../../src/lib/orderStates';

describe('Normalización de estados', () => {
	it('mapea los alias de la UI al estado canónico', () => {
		expect(normalizarEstadoPedido('confirmado')).toBe('pagado');
		expect(normalizarEstadoPedido('preparado')).toBe('preparando');
		expect(normalizarEstadoPedido('enviado')).toBe('despachado');
		expect(normalizarEstadoPedido('nuevo')).toBe('pendiente_pago');
	});

	it('mapea los estados fantasma que usaba la UI', () => {
		// Estos no existen en el enum de Appwrite: por eso el cliente nunca
		// veía su código de retiro y los contadores daban 0.
		expect(normalizarEstadoPedido('listo_retiro')).toBe('en_punto');
		expect(normalizarEstadoPedido('listo')).toBe('en_punto');
		expect(normalizarEstadoPedido('en_transito')).toBe('despachado');
	});

	it('rechaza estados desconocidos en vez de escribirlos crudos', () => {
		expect(normalizarEstadoPedido('cualquier_cosa')).toBeNull();
		expect(normalizarEstadoPedido('')).toBeNull();
	});

	it('todo estado canónico se normaliza a sí mismo', () => {
		for (const e of ESTADOS_PEDIDO) {
			expect(normalizarEstadoPedido(e)).toBe(e);
		}
	});
});

describe('Transiciones válidas', () => {
	it('permite el camino feliz de envío', () => {
		expect(esTransicionValida('pendiente_pago', 'pagado')).toBe(true);
		expect(esTransicionValida('pagado', 'preparando')).toBe(true);
		expect(esTransicionValida('preparando', 'despachado')).toBe(true);
		expect(esTransicionValida('despachado', 'entregado')).toBe(true);
	});

	it('permite el camino feliz de retiro en punto', () => {
		expect(esTransicionValida('preparando', 'en_punto')).toBe(true);
		expect(esTransicionValida('en_punto', 'retirado')).toBe(true);
		expect(esTransicionValida('en_punto', 'entregado')).toBe(true);
	});

	it('impide saltear el pago', () => {
		expect(esTransicionValida('pendiente_pago', 'entregado')).toBe(false);
		expect(esTransicionValida('pendiente_pago', 'despachado')).toBe(false);
	});

	it('impide retroceder', () => {
		expect(esTransicionValida('entregado', 'pendiente_pago')).toBe(false);
		expect(esTransicionValida('despachado', 'pagado')).toBe(false);
		expect(esTransicionValida('pagado', 'pendiente_pago')).toBe(false);
	});

	it('no permite cancelar un pedido ya entregado', () => {
		expect(esTransicionValida('entregado', 'cancelado')).toBe(false);
	});

	it('permite cancelar mientras no se haya entregado', () => {
		for (const e of ['pendiente_pago', 'pagado', 'preparando', 'despachado', 'en_punto'] as const) {
			expect(esTransicionValida(e, 'cancelado'), `debería poder cancelarse desde ${e}`).toBe(true);
		}
	});

	it('cancelado y reembolsado son terminales', () => {
		expect(esTerminal('cancelado')).toBe(true);
		expect(esTerminal('reembolsado')).toBe(true);
		expect(transicionesPosibles('cancelado')).toEqual([]);
	});

	it('reembolsado es alcanzable (no es un estado muerto)', () => {
		const alcanzable = ESTADOS_PEDIDO.some((e) => transicionesPosibles(e).includes('reembolsado'));
		expect(alcanzable).toBe(true);
	});

	it('todo estado no terminal es alcanzable desde algún otro', () => {
		for (const destino of ESTADOS_PEDIDO) {
			if (destino === 'pendiente_pago') continue; // estado inicial
			const alcanzable = ESTADOS_PEDIDO.some((e) => transicionesPosibles(e).includes(destino));
			expect(alcanzable, `${destino} es inalcanzable`).toBe(true);
		}
	});

	it('toda transición apunta a un estado canónico', () => {
		for (const e of ESTADOS_PEDIDO) {
			for (const destino of transicionesPosibles(e)) {
				expect(ESTADOS_PEDIDO).toContain(destino);
			}
		}
	});

	it('cada estado tiene etiqueta para la UI', () => {
		for (const e of ESTADOS_PEDIDO) {
			expect(ETIQUETAS[e]).toBeTruthy();
		}
	});
});
