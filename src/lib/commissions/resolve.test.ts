// @ts-nocheck
import { test, expect, describe } from 'vitest';
import { resolverComision, calcularMontoComision, CommissionRule } from './resolve';

describe('Motor de Comisiones - resolverComision', () => {
  const baseDate = new Date('2026-07-29T10:00:00Z');
  
  const reglasBase: CommissionRule[] = [
    {
      id: 'rule_default',
      alcance: 'default',
      canillita_id: null,
      categoria_id: null,
      tipo: 'porcentaje',
      valor: 500, // 5%
      vigente_desde: new Date('2020-01-01T00:00:00Z'),
      vigente_hasta: null,
      activo: true
    },
    {
      id: 'rule_cat_1',
      alcance: 'categoria',
      canillita_id: null,
      categoria_id: 'cat_electronica',
      tipo: 'porcentaje',
      valor: 750, // 7.5%
      vigente_desde: new Date('2025-01-01T00:00:00Z'),
      vigente_hasta: null,
      activo: true
    },
    {
      id: 'rule_can_jorge',
      alcance: 'canillita',
      canillita_id: 'can_jorge',
      categoria_id: null,
      tipo: 'porcentaje',
      valor: 1000, // 10%
      vigente_desde: new Date('2026-01-01T00:00:00Z'),
      vigente_hasta: null,
      activo: true
    },
    {
      id: 'rule_jorge_elec',
      alcance: 'canillita_categoria',
      canillita_id: 'can_jorge',
      categoria_id: 'cat_electronica',
      tipo: 'monto_fijo',
      valor: 500000, // $5000 fijos
      vigente_desde: new Date('2026-06-01T00:00:00Z'),
      vigente_hasta: null,
      activo: true
    },
    {
      id: 'rule_expired',
      alcance: 'canillita',
      canillita_id: 'can_marta',
      categoria_id: null,
      tipo: 'porcentaje',
      valor: 2000, // 20%
      vigente_desde: new Date('2025-01-01T00:00:00Z'),
      vigente_hasta: new Date('2026-01-01T00:00:00Z'), // Expiró
      activo: true
    }
  ];

  test('Debería retornar regla default si no hay matches', () => {
    const result = resolverComision(reglasBase, 'can_nuevo', 'cat_ropa', baseDate);
    expect(result.regla_id).toBe('rule_default');
    expect(result.valor).toBe(500);
  });

  test('Debería retornar regla de categoría si el canillita no tiene trato', () => {
    const result = resolverComision(reglasBase, 'can_nuevo', 'cat_electronica', baseDate);
    expect(result.regla_id).toBe('rule_cat_1');
    expect(result.valor).toBe(750);
  });

  test('Debería retornar regla de canillita sobre categoría si no hay canillita_categoria', () => {
    const result = resolverComision(reglasBase, 'can_jorge', 'cat_ropa', baseDate);
    expect(result.regla_id).toBe('rule_can_jorge');
    expect(result.valor).toBe(1000);
  });

  test('Debería retornar regla más específica canillita_categoria', () => {
    const result = resolverComision(reglasBase, 'can_jorge', 'cat_electronica', baseDate);
    expect(result.regla_id).toBe('rule_jorge_elec');
    expect(result.tipo).toBe('monto_fijo');
    expect(result.valor).toBe(500000);
  });

  test('Debería ignorar reglas expiradas (Marta expiró, cae a default)', () => {
    const result = resolverComision(reglasBase, 'can_marta', 'cat_ropa', baseDate);
    expect(result.regla_id).toBe('rule_default');
  });

  test('Debería fallar si no hay regla default', () => {
    const reglasRotas = reglasBase.filter(r => r.alcance !== 'default');
    expect(() => resolverComision(reglasRotas, 'c', 'cat', baseDate)).toThrow(/Inconsistencia fatal/);
  });
});

describe('Motor de Comisiones - calcularMontoComision', () => {
  test('Calcula porcentaje con redondeo correcto', () => {
    const result = { tipo: 'porcentaje' as TipoComision, tasa_bp: 725, monto_fijo_centavos: null, valor: 725, regla_id: '1', motivo: '' };
    // $1.499,00 -> 149900 centavos * 7.25% = 10867.75 -> 10868
    expect(calcularMontoComision(149900, result)).toBe(10868);
  });

  test('Calcula monto fijo', () => {
    const result = { tipo: 'monto_fijo' as TipoComision, tasa_bp: null, monto_fijo_centavos: 50000, valor: 50000, regla_id: '1', motivo: '' };
    expect(calcularMontoComision(149900, result)).toBe(50000);
  });
});
