import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { Calculator, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  products: { id: string, name: string }[];
  canillitas: { id: string, name: string }[];
}

export default function CommissionSimulator({ products, canillitas }: Props) {
  const [canillitaId, setCanillitaId] = useState(canillitas[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async () => {
    if (!canillitaId || !productId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: actionError } = await actions.simulateCommission({ canillitaId, productId });
      if (actionError) throw new Error(actionError.message);
      if (!data?.success) throw new Error(data?.error || 'Error desconocido');
      
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-900 p-6 text-white flex items-center gap-3">
        <Calculator className="w-6 h-6 text-indigo-400" />
        <h2 className="text-xl font-bold">Simulador de Comisiones</h2>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Canillita (Punto de Retiro o Referente)</label>
            <select 
              value={canillitaId} 
              onChange={e => setCanillitaId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Seleccione un Canillita...</option>
              {canillitas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Producto de Prueba</label>
            <select 
              value={productId} 
              onChange={e => setProductId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Seleccione un Producto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <button 
          onClick={handleSimulate}
          disabled={loading || !canillitaId || !productId}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Simular Devengo'}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-lg font-bold text-slate-900 mb-4 border-b pb-2">Resultado de la Simulación</h3>
            
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <span className="text-slate-600">Precio Base del Producto:</span>
                <span className="text-xl font-bold text-slate-900">${(result.productPrice / 100).toFixed(2)}</span>
              </div>
              
              {result.rule ? (
                <>
                  <div className="flex justify-between items-center mb-6 bg-green-100 p-4 rounded-xl border border-green-200 shadow-sm">
                    <div>
                      <span className="text-green-800 font-bold block mb-1">Monto a Devengar</span>
                      <span className="text-xs text-green-700">Regla aplicada: Nivel de precedencia {result.ruleLevel}</span>
                    </div>
                    <span className="text-2xl font-black text-green-700">
                      ${(result.amount / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">Detalles de la Regla Ganadora</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-xs">Alcance</span>
                        <span className="font-semibold text-slate-900 capitalize">{result.rule.alcance.replace('_', ' ')}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-xs">Tipo</span>
                        <span className="font-semibold text-slate-900 capitalize">{result.rule.tipo.replace('_', ' ')}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-xs">Valor Bruto (BD)</span>
                        <span className="font-semibold text-slate-900">{result.rule.valor} {result.rule.tipo === 'porcentaje' ? 'bp' : 'centavos'}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-xs">ID Regla</span>
                        <span className="font-mono text-slate-900 text-xs truncate block">{result.rule.$id}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 font-medium">No se encontró ninguna regla vigente para esta combinación. La comisión devengada será $0.00.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
