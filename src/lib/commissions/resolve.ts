export type AlcanceComision = 'default' | 'canillita' | 'categoria' | 'canillita_categoria';
export type TipoComision = 'porcentaje' | 'monto_fijo';

export interface CommissionRule {
  id: string;
  alcance: AlcanceComision;
  canillita_id: string | null;
  categoria_id: string | null;
  tipo: TipoComision;
  valor: number; // basis points si porcentaje, centavos si monto_fijo
  vigente_desde: Date;
  vigente_hasta: Date | null;
  activo: boolean;
}

export interface CommissionResult {
  tasa_bp: number | null;
  monto_fijo_centavos: number | null;
  tipo: TipoComision;
  valor: number;
  regla_id: string;
  motivo: string;
}

/**
 * Función pura para resolver qué regla de comisión aplica.
 * Precedencia:
 * 1. canillita_categoria
 * 2. canillita
 * 3. categoria
 * 4. default
 */
export function resolverComision(
  reglas: CommissionRule[],
  canillitaId: string | null,
  categoriaId: string | null,
  fecha: Date
): CommissionResult {
  // Filtrar reglas activas y vigentes
  const vigentes = reglas.filter(r => {
    if (!r.activo) return false;
    if (fecha < r.vigente_desde) return false;
    if (r.vigente_hasta && fecha >= r.vigente_hasta) return false;
    return true;
  });

  // 1. Intentar canillita_categoria
  if (canillitaId && categoriaId) {
    const regla = vigentes.find(r => r.alcance === 'canillita_categoria' && r.canillita_id === canillitaId && r.categoria_id === categoriaId);
    if (regla) return mapToResult(regla, 'Acuerdo específico canillita-categoría');
  }

  // 2. Intentar canillita
  if (canillitaId) {
    const regla = vigentes.find(r => r.alcance === 'canillita' && r.canillita_id === canillitaId);
    if (regla) return mapToResult(regla, 'Trato particular con el canillita');
  }

  // 3. Intentar categoria
  if (categoriaId) {
    const regla = vigentes.find(r => r.alcance === 'categoria' && r.categoria_id === categoriaId);
    if (regla) return mapToResult(regla, 'Regla por categoría de producto');
  }

  // 4. Default
  const reglaDefault = vigentes.find(r => r.alcance === 'default');
  if (!reglaDefault) {
    throw new Error('Inconsistencia fatal: No se encontró regla default activa y vigente.');
  }

  return mapToResult(reglaDefault, 'Regla por defecto global');
}

export function calcularMontoComision(baseCentavos: number, result: CommissionResult): number {
  if (result.tipo === 'monto_fijo') {
    return result.monto_fijo_centavos || 0;
  }
  if (result.tipo === 'porcentaje' && result.tasa_bp !== null) {
    return Math.round((baseCentavos * result.tasa_bp) / 10000);
  }
  return 0;
}

function mapToResult(regla: CommissionRule, motivo: string): CommissionResult {
  return {
    tipo: regla.tipo,
    tasa_bp: regla.tipo === 'porcentaje' ? regla.valor : null,
    monto_fijo_centavos: regla.tipo === 'monto_fijo' ? regla.valor : null,
    valor: regla.valor,
    regla_id: regla.id,
    motivo
  };
}
