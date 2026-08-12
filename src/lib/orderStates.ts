/**
 * Máquina de estados del pedido. Fuente única de verdad. [C-04, M-03]
 *
 * Los estados canónicos son exactamente los del enum `orders.estado` en
 * Appwrite. La UI venía usando además `listo_retiro`, `en_transito`, `listo`
 * y `preparado`, que NO existen en la base: por eso el cliente nunca veía su
 * código de retiro y los contadores del panel daban siempre 0.
 */

export const ESTADOS_PEDIDO = [
	'pendiente_pago',
	'pagado',
	'preparando',
	'despachado',
	'en_punto',
	'entregado',
	'retirado',
	'cancelado',
	'reembolsado'
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Alias históricos de la UI -> estado canónico. */
const ALIAS: Record<string, EstadoPedido> = {
	nuevo: 'pendiente_pago',
	pendiente: 'pendiente_pago',
	pendiente_pago: 'pendiente_pago',
	confirmado: 'pagado',
	pagado: 'pagado',
	preparado: 'preparando',
	preparando: 'preparando',
	listo: 'en_punto',
	listo_retiro: 'en_punto',
	en_punto: 'en_punto',
	enviado: 'despachado',
	en_camino: 'despachado',
	en_transito: 'despachado',
	despachado: 'despachado',
	entregado: 'entregado',
	retirado: 'retirado',
	cancelado: 'cancelado',
	reembolsado: 'reembolsado'
};

/** Devuelve el estado canónico, o null si el valor no se reconoce. */
export function normalizarEstadoPedido(valor: string): EstadoPedido | null {
	return ALIAS[valor?.trim()] ?? null;
}

/**
 * Transiciones permitidas. Todo lo que no esté acá se rechaza: antes se podía
 * saltar de `pendiente_pago` a `entregado` o volver de `entregado` a
 * `pendiente_pago`, porque el estado se escribía sin ninguna validación.
 */
const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
	pendiente_pago: ['pagado', 'cancelado'],
	pagado: ['preparando', 'cancelado', 'reembolsado'],
	preparando: ['despachado', 'en_punto', 'cancelado'],
	despachado: ['entregado', 'cancelado'],
	en_punto: ['entregado', 'retirado', 'cancelado'],
	entregado: ['reembolsado'],
	retirado: ['reembolsado'],
	cancelado: [],
	reembolsado: []
};

export function esTransicionValida(desde: EstadoPedido, hacia: EstadoPedido): boolean {
	return TRANSICIONES[desde]?.includes(hacia) ?? false;
}

export function transicionesPosibles(desde: EstadoPedido): EstadoPedido[] {
	return TRANSICIONES[desde] ?? [];
}

/**
 * ¿El canillita puede entregar este pedido?
 *
 * Sólo si el pago está acreditado y todavía no se entregó. El panel marcaba
 * como "Listo para Retiro" todo lo que no estuviera entregado —incluidos los
 * pendiente_pago— con el botón de entrega habilitado.
 */
export function puedeEntregarse(estado: EstadoPedido): boolean {
	return ['pagado', 'preparando', 'despachado', 'en_punto'].includes(estado);
}

/** Un pedido cobrado: a partir de acá se devengan comisiones. */
export function estaPago(estado: EstadoPedido): boolean {
	return !['pendiente_pago', 'cancelado'].includes(estado);
}

/** Estados en los que el pedido ya no se puede mover. */
export function esTerminal(estado: EstadoPedido): boolean {
	return TRANSICIONES[estado]?.length === 0;
}

export const ETIQUETAS: Record<EstadoPedido, string> = {
	pendiente_pago: 'Pendiente de pago',
	pagado: 'Pagado',
	preparando: 'En preparación',
	despachado: 'Despachado',
	en_punto: 'Listo para retirar',
	entregado: 'Entregado',
	retirado: 'Retirado',
	cancelado: 'Cancelado',
	reembolsado: 'Reembolsado'
};
