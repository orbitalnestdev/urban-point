import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  canillitas: { id: string, name: string }[];
  categorias: { id: string, name: string }[];
}

export default function RuleForm({ canillitas, categorias }: Props) {
  const [formData, setFormData] = useState({
    alcance: 'default',
    tipo: 'porcentaje',
    valor: 1000,
    canillita_id: '',
    categoria_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: actionError } = await (actions as any).createCommissionRule(formData as any);
      if (actionError) throw new Error(actionError.message);
      if (!data?.success) throw new Error(data?.error || 'Error al crear la regla');
      window.location.href = '/admin/comisiones';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Alcance de la Regla</label>
        <select 
          value={formData.alcance} 
          onChange={e => setFormData({...formData, alcance: e.target.value, canillita_id: '', categoria_id: ''})}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="default">Global (Default)</option>
          <option value="categoria">Por Categoría</option>
          <option value="canillita">Por Canillita</option>
          <option value="canillita_categoria">Por Canillita y Categoría</option>
        </select>
        <p className="text-xs text-slate-500 mt-2">Crear una regla desactivará automáticamente cualquier regla existente con el mismo alcance exacto.</p>
      </div>

      {(formData.alcance === 'categoria' || formData.alcance === 'canillita_categoria') && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Categoría</label>
          <select 
            required
            value={formData.categoria_id} 
            onChange={e => setFormData({...formData, categoria_id: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Seleccione...</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {(formData.alcance === 'canillita' || formData.alcance === 'canillita_categoria') && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Canillita</label>
          <select 
            required
            value={formData.canillita_id} 
            onChange={e => setFormData({...formData, canillita_id: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Seleccione...</option>
            {canillitas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo</label>
          <select 
            value={formData.tipo} 
            onChange={e => setFormData({...formData, tipo: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="porcentaje">Porcentaje</option>
            <option value="monto_fijo">Monto Fijo</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Valor {formData.tipo === 'porcentaje' ? '(Basis Points, ej: 1000 = 10%)' : '(Centavos, ej: 15000 = $150.00)'}
          </label>
          <input 
            type="number"
            required
            value={formData.valor}
            onChange={e => setFormData({...formData, valor: Number(e.target.value)})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
          />
        </div>
      </div>

      <div className="pt-4 flex items-center justify-end gap-4">
        <a href="/admin/comisiones" className="px-6 py-3 text-slate-600 font-semibold hover:text-slate-900">Cancelar</a>
        <button 
          type="submit" 
          disabled={loading}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Regla'}
        </button>
      </div>
    </form>
  );
}
