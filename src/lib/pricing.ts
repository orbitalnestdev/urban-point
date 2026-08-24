export * from './pricingEngine';

export interface ProductoPrecio {
	precio: number;
	precio_promocional?: number | null;
	price_publico?: number | null;
	price_canillita?: number | null;
	price_distribuidor?: number | null;
}

/** `precio_promocional` está declarado como double en Appwrite (ver C-06). */
function aCentavosEnteros(valor: unknown): number {
	const n = Number(valor);
	return Number.isFinite(n) ? Math.round(n) : 0;
}

/** ¿La promoción es aplicable? Debe ser positiva y menor al precio de lista. */
export function tienePromocion(producto: ProductoPrecio): boolean {
	const promo = aCentavosEnteros(producto?.precio_promocional);
	const lista = aCentavosEnteros(producto?.price_publico ?? producto?.precio);
	return promo > 0 && promo < lista;
}

/**
 * Precio que se cobra por unidad, en centavos.
 * Es el único número que debe usarse tanto para mostrar como para cobrar.
 */
export function precioDeVentaCentavos(producto: ProductoPrecio): number {
	const base = aCentavosEnteros(producto?.price_publico ?? producto?.precio);
	return tienePromocion(producto)
		? aCentavosEnteros(producto.precio_promocional)
		: base;
}

/** Precio de lista tachado. Devuelve null si no hay promoción real. */
export function precioListaCentavos(producto: ProductoPrecio): number | null {
	return tienePromocion(producto) ? aCentavosEnteros(producto?.price_publico ?? producto?.precio) : null;
}

export function porcentajeDescuento(producto: ProductoPrecio): number {
	if (!tienePromocion(producto)) return 0;
	const lista = aCentavosEnteros(producto?.price_publico ?? producto?.precio);
	const venta = aCentavosEnteros(producto.precio_promocional);
	return Math.round(((lista - venta) / lista) * 100);
}

const FORMATO_ARS = new Intl.NumberFormat('es-AR', {
	style: 'currency',
	currency: 'ARS',
	maximumFractionDigits: 0
});

/** Formatea centavos a moneda. Nunca se dividen centavos a mano. */
export function formatearCentavos(centavos: number): string {
	return FORMATO_ARS.format(aCentavosEnteros(centavos) / 100);
}

