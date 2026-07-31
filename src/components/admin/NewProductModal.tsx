import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';

export default function NewProductModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setErrorMsg('');
      setLoadingType(null);
    };

    document.addEventListener('modal:new-product', handleOpen);
    window.addEventListener('modal:new-product', handleOpen);
    (window as any).openNewProductModal = handleOpen;

    return () => {
      document.removeEventListener('modal:new-product', handleOpen);
      window.removeEventListener('modal:new-product', handleOpen);
      delete (window as any).openNewProductModal;
    };
  }, []);

  const handleSelectType = async (tipo: 'simple' | 'variantes' | 'combo') => {
    setLoadingType(tipo);
    setErrorMsg('');

    const defaultNames = {
      simple: 'Nuevo Producto Simple',
      variantes: 'Nuevo Producto con Variantes',
      combo: 'Nuevo Combo'
    };

    try {
      const { data, error } = await actions.createProduct({ 
        nombre: defaultNames[tipo],
        tipo: tipo 
      });
      
      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'Error al crear producto');
        setLoadingType(null);
        return;
      }
      
      // Redirigir a la vista de edición con la solapa adecuada
      window.location.href = `/admin/catalogo/${data.id}?tipo=${tipo}`;
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de conexión');
      setLoadingType(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-100">
        
        {/* Header con botón de cierre X */}
        <div className="p-6 pb-2 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nuevo producto</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Elegí qué tipo de producto querés crear. Esto se fija al momento de crear y no se puede cambiar después.
            </p>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Opción 1: Producto simple */}
          <button 
            onClick={() => handleSelectType('simple')}
            disabled={loadingType !== null}
            className="w-full text-left p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-start gap-4 group cursor-pointer disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base group-hover:text-emerald-600 transition-colors">
                {loadingType === 'simple' ? 'Creando...' : 'Producto simple'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Un SKU, un precio, un stock. La opción por defecto.</p>
            </div>
          </button>

          {/* Opción 2: Producto con variantes */}
          <button 
            onClick={() => handleSelectType('variantes')}
            disabled={loadingType !== null}
            className="w-full text-left p-5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-start gap-4 group cursor-pointer disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base group-hover:text-indigo-600 transition-colors">
                {loadingType === 'variantes' ? 'Creando...' : 'Producto con variantes'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Mismo producto con talles, colores u otras opciones.</p>
            </div>
          </button>

          {/* Opción 3: Combo */}
          <button 
            onClick={() => handleSelectType('combo')}
            disabled={loadingType !== null}
            className="w-full text-left p-5 rounded-2xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-start gap-4 group cursor-pointer disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base group-hover:text-amber-600 transition-colors">
                  {loadingType === 'combo' ? 'Creando...' : 'Combo'}
                </h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                  VA AL ARMADOR DE COMBOS
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Combinación de otros productos con su propia estrategia de precio.</p>
            </div>
          </button>

        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button 
            onClick={() => setIsOpen(false)}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
