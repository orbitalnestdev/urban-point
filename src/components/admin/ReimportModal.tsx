import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';

type Props = {};

export default function ReimportModal({}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setFile(null);
      setErrorMsg('');
      setLoading(false);
    };
    document.addEventListener('modal:reimport-xlsx', handleOpen);
    return () => {
      document.removeEventListener('modal:reimport-xlsx', handleOpen);
    };
  }, []);

  const handleReimport = async () => {
    if (!file) {
      setErrorMsg('Por favor seleccioná un archivo para continuar.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) {
        setErrorMsg('El archivo está vacío.');
        setLoading(false);
        return;
      }

      const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        setErrorMsg('El archivo debe tener cabecera y al menos una fila de datos.');
        setLoading(false);
        return;
      }

      const rawHeaders = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
      const skuIdx = rawHeaders.findIndex(h => /sku|id|codigo/i.test(h));
      const priceIdx = rawHeaders.findIndex(h => /precio|price/i.test(h));
      const stockIdx = rawHeaders.findIndex(h => /stock|cantidad/i.test(h));

      if (skuIdx === -1) {
        setErrorMsg('No se encontró la columna SKU o ID en el archivo.');
        setLoading(false);
        return;
      }

      const updates = lines.slice(1).map(line => {
        const parts = line.split(',').map(p => p.replace(/^["']|["']$/g, '').trim());
        const sku = parts[skuIdx];
        const precio = priceIdx !== -1 ? Math.round(parseFloat(parts[priceIdx] || '0') * 100) : undefined;
        const stock = stockIdx !== -1 ? parseInt(parts[stockIdx] || '0', 10) : undefined;

        return { sku, precio, stock };
      }).filter(u => u.sku && u.sku.length > 0);

      try {
        const { data, error } = await actions.reimportProductsStock({ updates });
        if (error || !data?.success) {
          setErrorMsg(error?.message || data?.error || 'Error en re-importación');
          setLoading(false);
          return;
        }

        alert(`¡Re-importación exitosa! Se actualizaron ${data.updated} productos.`);
        window.location.reload();
      } catch (e: any) {
        setErrorMsg(e.message || 'Error de conexión');
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-900">Re-importar productos</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-500 leading-relaxed">
            Subí el archivo que descargaste con “Exportar productos”. Solo se actualizan precio, coste y stock — el resto del producto no se toca.
          </p>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50">
            <label className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors shadow-sm shrink-0">
              Seleccionar archivo
              <input 
                type="file" 
                accept=".csv,.xlsx" 
                onChange={(e) => setFile(e.target.files?.[0] || null)} 
                className="hidden" 
              />
            </label>
            <span className="text-xs font-medium text-slate-500 truncate">
              {file ? file.name : 'Ningún archivo seleccionado'}
            </span>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button 
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 font-bold text-slate-600 hover:text-slate-900 transition-colors text-sm"
          >
            Cancelar
          </button>
          <button 
            onClick={handleReimport}
            disabled={loading}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-md text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            {loading ? 'Procesando...' : 'Re-importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
