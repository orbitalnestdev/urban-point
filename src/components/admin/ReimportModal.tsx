import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';
import { parseCsvText } from '../../lib/csvParser';

type Props = {};

export default function ReimportModal({}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewInfo, setPreviewInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setFile(null);
      setErrorMsg('');
      setLoading(false);
      setPreviewInfo(null);
    };
    document.addEventListener('modal:reimport-xlsx', handleOpen);
    return () => {
      document.removeEventListener('modal:reimport-xlsx', handleOpen);
    };
  }, []);

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    setErrorMsg('');
    setPreviewInfo(null);

    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const { headers, rows, delimiter } = parseCsvText(text);
      if (rows.length === 0) {
        setErrorMsg('El archivo seleccionado no contiene filas de datos.');
        return;
      }

      setPreviewInfo(`Se detectaron ${rows.length} filas. Delimitador: "${delimiter === '\t' ? 'TAB' : delimiter}". Columnas: ${headers.slice(0, 5).join(', ')}...`);
    };
    reader.readAsText(selectedFile);
  };

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

      const { rows } = parseCsvText(text);
      if (rows.length === 0) {
        setErrorMsg('El archivo debe tener al menos una fila de datos.');
        setLoading(false);
        return;
      }

      const parseMoney = (val?: string): number | undefined => {
        if (!val || val.trim().length === 0) return undefined;
        const clean = val.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
        const num = parseFloat(clean);
        return isNaN(num) ? undefined : Math.round(num * 100);
      };

      const parseNum = (val?: string): number | undefined => {
        if (!val || val.trim().length === 0) return undefined;
        const num = parseInt(val.replace(/[^0-9-]/g, ''), 10);
        return isNaN(num) ? undefined : num;
      };

      const updates = rows.map(row => {
        // Encontrar claves sin importar mayúsculas/minúsculas ni espacios
        const getVal = (...keys: string[]): string | undefined => {
          for (const k of keys) {
            const matchKey = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim() || rk.toLowerCase().trim().replace(/_/g, ' ') === k.toLowerCase().trim());
            if (matchKey && row[matchKey] !== undefined && row[matchKey].trim().length > 0) {
              return row[matchKey].trim();
            }
          }
          return undefined;
        };

        const id = getVal('id', 'document_id', 'id_producto');
        const sku = getVal('sku', 'codigo', 'codigo_sku');
        const nombre = getVal('nombre', 'title', 'producto');
        const precioStr = getVal('precio', 'precio_venta', 'precio_minorista');
        const promoStr = getVal('precio_promocional', 'precio_promo', 'promo');
        const canillitaStr = getVal('precio_canillita', 'canillita');
        const distribuidorStr = getVal('precio_distribuidor', 'distribuidor', 'mayorista');
        const costoStr = getVal('costo', 'precio_costo', 'cost');
        const stockStr = getVal('stock', 'cantidad', 'unidades');
        const estadoStr = getVal('estado', 'status');
        const catIdStr = getVal('categoria_id', 'id_categoria');
        const catNombreStr = getVal('categoria', 'categoria_nombre', 'category');
        const marcaStr = getVal('marca', 'brand');
        const portadaStr = getVal('portada_url', 'imagen_url', 'imagen');
        const descStr = getVal('descripcion', 'desc');

        return {
          id,
          sku,
          nombre,
          precio: parseMoney(precioStr),
          precio_promocional: parseMoney(promoStr),
          precio_canillita: parseMoney(canillitaStr),
          precio_distribuidor: parseMoney(distribuidorStr),
          costo: parseMoney(costoStr),
          stock: parseNum(stockStr),
          estado: estadoStr ? estadoStr.toLowerCase() : undefined,
          categoria_id: catIdStr,
          categoria_nombre: catNombreStr,
          marca: marcaStr,
          portada_url: portadaStr,
          descripcion: descStr
        };
      }).filter(u => u.id || u.sku || u.nombre);

      if (updates.length === 0) {
        setErrorMsg('No se pudieron extraer datos válidos del archivo. Asegurate de incluir columnas como SKU, ID, Nombre o Precio.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await actions.reimportProductsStock({ updates });
        if (error || !data?.success) {
          setErrorMsg(error?.message || data?.error || 'Error en re-importación');
          setLoading(false);
          return;
        }

        const msg = data.created > 0 
          ? `¡Re-importación exitosa! Se actualizaron ${data.updated} productos y se crearon ${data.created} nuevos.`
          : `¡Re-importación exitosa! Se actualizaron ${data.updated} productos.`;

        alert(msg);
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
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            </span>
            Re-importar / Actualizar Catálogo (Excel / CSV)
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-xs text-slate-500 leading-relaxed">
            Subí el archivo que exportaste previamente o un listado con SKU/ID. Podés modificar <strong>precios (normal, promo, canillita, distribuidor), costo, stock, categoría y estado</strong> en lote.
          </p>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
              {errorMsg}
            </div>
          )}

          {previewInfo && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl">
              {previewInfo}
            </div>
          )}

          <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50">
            <label className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors shadow-sm shrink-0">
              Seleccionar archivo
              <input 
                type="file" 
                accept=".csv,.xlsx,.txt" 
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} 
                className="hidden" 
              />
            </label>
            <span className="text-xs font-medium text-slate-500 truncate">
              {file ? file.name : 'Ningún archivo seleccionado (.csv / .xlsx / .txt)'}
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
            disabled={loading || !file}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-md text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            {loading ? 'Procesando...' : 'Aplicar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
