import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { Wallet, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

interface Props {
  canillitaId: string;
  canillitaName: string;
  monto: number;
}

export function PayoutModal({ canillitaId, canillitaName, monto }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [medioPago, setMedioPago] = useState('Transferencia Bancaria');
  const [referencia, setReferencia] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referencia) return;
    
    setLoading(true);
    setError(null);
    try {
      const { data, error: actionError } = await (actions as any).createPayout({
        profileId: canillitaId,
        medioPago,
        referenciaPago: referencia
      });
      
      if (actionError) throw new Error(actionError.message);
      if (!data?.success) throw new Error(data?.error || 'Error al procesar el pago');
      
      window.location.reload();
    } catch(err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-lg transition-colors text-sm"
      >
        Liquidar
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-500" />
                Registrar Liquidación
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Destinatario</p>
                  <p className="font-bold text-slate-900">{canillitaName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-500">A liquidar</p>
                  <p className="font-black text-green-600 text-lg">${(monto / 100).toFixed(2)}</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg flex gap-2 items-start text-sm border border-red-100">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Medio de Pago</label>
                <select 
                  value={medioPago}
                  onChange={e => setMedioPago(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Mercado Pago">Mercado Pago</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Número de Operación / Referencia</label>
                <input 
                  type="text" 
                  required
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder="Ej: 1234567890"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={loading || !referencia}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex justify-center items-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Confirmar Pago</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
