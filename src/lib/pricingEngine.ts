import type { SiteSettings } from './server/settings';

export type PricingLevel = 'distribuidor' | 'canillita' | 'publico';
export type LevelMode = 'inherit' | 'percent' | 'fixed';
export type RoundMode = 'nearest' | 'up' | 'down';

export interface LevelPriceResult {
	mode: LevelMode;
	exactCentavos: number | null;
	roundedCentavos: number | null;
	appliedPercent: number | null;
}

export interface ProductPriceResolution {
	price_distribuidor: number | null;
	price_canillita: number | null;
	price_publico: number | null;
	exact_distribuidor: number | null;
	exact_canillita: number | null;
	exact_publico: number | null;
}

/**
 * Aplica la regla de redondeo configurable.
 * @param exactCentavos Importe exacto en centavos
 * @param roundToPesos Paso de redondeo en pesos: 0 (sin redondeo), 10, 50, 100
 * @param roundMode Modo de redondeo: 'nearest' | 'up' | 'down'
 */
export function applyRoundingCentavos(
	exactCentavos: number,
	roundToPesos: number = 0,
	roundMode: RoundMode = 'nearest'
): number {
	if (!Number.isFinite(exactCentavos)) return 0;
	if (!roundToPesos || roundToPesos <= 0) {
		return Math.round(exactCentavos);
	}

	const stepCentavos = roundToPesos * 100;
	const ratio = exactCentavos / stepCentavos;

	let factor: number;
	if (roundMode === 'up') {
		factor = Math.ceil(ratio);
	} else if (roundMode === 'down') {
		factor = Math.floor(ratio);
	} else {
		factor = Math.round(ratio);
	}

	return factor * stepCentavos;
}

/**
 * Obtiene el porcentaje de markup a aplicar según la jerarquía de resolución:
 * 1. Override por producto (si el producto está en modo 'percent')
 * 2. Regla de categoría (si está definida)
 * 3. Default global en settings
 */
export function resolveLevelMarkupPercent(
	level: PricingLevel,
	product: any,
	category: any,
	settings: SiteSettings
): number {
	const levelKey = level; // 'distribuidor' | 'canillita' | 'publico'

	// Mode on product
	const mode = (product?.[`${levelKey}_mode`] as LevelMode) || 'inherit';

	if (mode === 'percent') {
		const productPercent = Number(product?.[`${levelKey}_percent`]);
		if (Number.isFinite(productPercent)) {
			return productPercent;
		}
	}

	// Category check (if mode is inherit or fallback)
	const catKey = `markup_${levelKey}`;
	if (category && category[catKey] !== undefined && category[catKey] !== null) {
		const catPercent = Number(category[catKey]);
		if (Number.isFinite(catPercent)) {
			return catPercent;
		}
	}

	// Settings fallback
	const settingKey = `default_markup_${levelKey}`;
	const settingsPercent = Number((settings as any)[settingKey] ?? (settings as any)[catKey]);
	if (Number.isFinite(settingsPercent)) {
		return settingsPercent;
	}

	// Default fallback values if missing in settings
	if (level === 'distribuidor') return 10.0;
	if (level === 'canillita') return 20.0;
	return 30.0;
}

/**
 * Calcula el precio exacto y redondeado de un nivel específico para un producto.
 */
export function calculateLevelPriceCentavos(
	level: PricingLevel,
	product: any,
	category: any,
	settings: SiteSettings
): LevelPriceResult {
	const levelKey = level;
	const mode = (product?.[`${levelKey}_mode`] as LevelMode) || 'inherit';

	if (mode === 'fixed') {
		const fixedPriceVal = product?.[`${levelKey}_fixed_price`] ?? product?.[`precio_${levelKey}`];
		const fixedCentavos = Number(fixedPriceVal);
		if (Number.isFinite(fixedCentavos) && fixedCentavos >= 0) {
			const rounded = applyRoundingCentavos(
				fixedCentavos,
				settings?.round_to ?? 0,
				settings?.round_mode ?? 'nearest'
			);
			return {
				mode: 'fixed',
				exactCentavos: fixedCentavos,
				roundedCentavos: rounded,
				appliedPercent: null
			};
		}
	}

	// Cost in centavos
	const cost = product?.cost !== undefined && product?.cost !== null
		? Number(product.cost)
		: (product?.costo !== undefined && product?.costo !== null ? Number(product.costo) : null);

	if (cost === null || !Number.isFinite(cost) || cost <= 0) {
		// No cost available
		// If product has a legacy or current fixed price stored in level key, fallback to it
		const legacyPrice = Number(product?.[`price_${levelKey}`] ?? product?.[`precio_${levelKey}`] ?? (level === 'publico' ? product?.precio : null));
		if (Number.isFinite(legacyPrice) && legacyPrice > 0) {
			return {
				mode,
				exactCentavos: legacyPrice,
				roundedCentavos: legacyPrice,
				appliedPercent: null
			};
		}
		return {
			mode,
			exactCentavos: null,
			roundedCentavos: null,
			appliedPercent: null
		};
	}

	const percent = resolveLevelMarkupPercent(level, product, category, settings);
	const exactCentavos = cost * (1 + percent / 100);
	const roundedCentavos = applyRoundingCentavos(
		exactCentavos,
		settings?.round_to ?? 0,
		settings?.round_mode ?? 'nearest'
	);

	return {
		mode,
		exactCentavos,
		roundedCentavos,
		appliedPercent: percent
	};
}

/**
 * Recalcula todos los precios derivados (distribuidor, canillita, público) para un producto.
 */
export function recalculateProductPrices(
	product: any,
	category: any,
	settings: SiteSettings
): ProductPriceResolution {
	const dist = calculateLevelPriceCentavos('distribuidor', product, category, settings);
	const cani = calculateLevelPriceCentavos('canillita', product, category, settings);
	const pub = calculateLevelPriceCentavos('publico', product, category, settings);

	return {
		price_distribuidor: dist.roundedCentavos,
		price_canillita: cani.roundedCentavos,
		price_publico: pub.roundedCentavos ?? (product?.precio ? Number(product.precio) : null),
		exact_distribuidor: dist.exactCentavos,
		exact_canillita: cani.exactCentavos,
		exact_publico: pub.exactCentavos
	};
}

/**
 * Resuelve qué precio ve y paga un usuario según su rol y estado de aprobación.
 * - Visitante y cliente minorista: precio_publico.
 * - Canillita logueado y aprobado: precio_canillita.
 * - Distribuidor logueado y aprobado: precio_distribuidor.
 */
export function resolveProductPriceForUser(
	product: any,
	userRole?: string | null
): { unitPriceCentavos: number; appliedLevel: 'publico' | 'canillita' | 'distribuidor' } {
	const role = userRole?.toLowerCase() || 'cliente';

	if (role === 'distribuidor') {
		const pDist = Number(product?.price_distribuidor ?? product?.precio_distribuidor);
		if (Number.isFinite(pDist) && pDist > 0) {
			return { unitPriceCentavos: Math.round(pDist), appliedLevel: 'distribuidor' };
		}
	}

	if (role === 'canillita') {
		const pCani = Number(product?.price_canillita ?? product?.precio_canillita);
		if (Number.isFinite(pCani) && pCani > 0) {
			return { unitPriceCentavos: Math.round(pCani), appliedLevel: 'canillita' };
		}
	}

	// Fallback to public price
	const pPub = Number(product?.price_publico ?? product?.precio);
	const unitPriceCentavos = Number.isFinite(pPub) && pPub > 0 ? Math.round(pPub) : 0;
	return { unitPriceCentavos, appliedLevel: 'publico' };
}

/**
 * Sanitiza un objeto de producto para respuestas de API públicas/usuarios no admin.
 * Centraliza la ocultación de costos y precios de otros niveles.
 */
export function sanitizeProductForUser(product: any, userRole?: string | null): any {
	if (!product) return product;

	const { unitPriceCentavos, appliedLevel } = resolveProductPriceForUser(product, userRole);
	const copy = { ...product };

	// Asignar el precio único resuelto al que este usuario tiene acceso
	copy.precio = unitPriceCentavos;
	copy.price_publico = unitPriceCentavos;
	copy.applied_level = appliedLevel;

	// Remover información confidencial/privada si no es admin o gestión
	const role = userRole?.toLowerCase();
	if (role !== 'admin' && role !== 'gestion') {
		delete copy.cost;
		delete copy.costo;
		delete copy.price_distribuidor;
		delete copy.precio_distribuidor;
		delete copy.price_canillita;
		delete copy.precio_canillita;
		delete copy.distribuidor_mode;
		delete copy.distribuidor_percent;
		delete copy.distribuidor_fixed_price;
		delete copy.canillita_mode;
		delete copy.canillita_percent;
		delete copy.canillita_fixed_price;
		delete copy.publico_mode;
		delete copy.publico_percent;
		delete copy.publico_fixed_price;
	}

	return copy;
}
