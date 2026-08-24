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

  // Opciones de actualización al estilo Tiendanube
  const [fieldsToUpdate, setFieldsToUpdate] = useState({
    stock: true,
    precios: true,
    categoria: true,
    estado: true,
    detalles: true, // nombre, marca, descripcion
    imagenes: true  // portada_url
  });

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setFile(null);
      setErrorMsg('');
      setLoading(false);
      setPreviewInfo(null);
      setFieldsToUpdate({
        stock: true,
        precios: true,
        categoria: true,
        estado: true,
        detalles: true,
        imagenes: true
      });
    };
    document.addEventListener('modal:reimport-xlsx', handleOpen);
    return () => {
      document.removeEventListener('modal:reimport-xlsx', handleOpen);
    };
  }, []);

  const toggleField = (key: keyof typeof fieldsToUpdate) => {
    setFieldsToUpdate(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllFields = (val: boolean) => {
    setFieldsToUpdate({
      stock: val,
      precios: val,
      categoria: val,
      estado: val,
      detalles: val,
      imagenes: val
    });
  };

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

      setPreviewInfo(`Se detectaron ${rows.length} filas en el archivo. Delimitador: "${delimiter === '\t' ? 'TAB' : delimiter}". Columnas: ${headers.slice(0, 5).join(', ')}...`);
    };
    reader.readAsText(selectedFile);
  };

  const handleReimport = async () => {
    if (!file) {
      setErrorMsg('Por favor seleccioná un archivo para continuar.');
      return;
    }

    const hasSelectedAnyField = Object.values(fieldsToUpdate).some(v => v);
    if (!hasSelectedAnyField) {
      setErrorMsg('Seleccioná al menos un atributo a actualizar (Stock, Precios, Categoría, etc.).');
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
          nombre: fieldsToUpdate.detalles ? nombre : undefined,
          precio: fieldsToUpdate.precios ? parseMoney(precioStr) : undefined,
          precio_promocional: fieldsToUpdate.precios ? parseMoney(promoStr) : undefined,
          precio_canillita: fieldsToUpdate.precios ? parseMoney(canillitaStr) : undefined,
          precio_distribuidor: fieldsToUpdate.precios ? parseMoney(distribuidorStr) : undefined,
          costo: fieldsToUpdate.precios ? parseMoney(costoStr) : undefined,
          stock: fieldsToUpdate.stock ? parseNum(stockStr) : undefined,
          estado: fieldsToUpdate.estado ? (estadoStr ? estadoStr.toLowerCase() : undefined) : undefined,
          categoria_id: fieldsToUpdate.categoria ? catIdStr : undefined,
          categoria_nombre: fieldsToUpdate.categoria ? catNombreStr : undefined,
          marca: fieldsToUpdate.detalles ? marcaStr : undefined,
          portada_url: fieldsToUpdate.imagenes ? portadaStr : undefined,
          descripcion: fieldsToUpdate.detalles ? descStr : undefined
        };
      }).filter(u => u.id || u.sku || u.nombre);

      if (updates.length === 0) {
        setErrorMsg('No se pudieron extraer datos válidos del archivo. Asegurate de incluir columnas como SKU, ID o Nombre para asociar los productos.');
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
          ? `¡Actualización masiva exitosa! Se actualizaron ${data.updated} productos y se crearon ${data.created} nuevos.`
          : `¡Actualización masiva exitosa! Se actualizaron ${data.updated} productos.`;

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
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold shadow-xs">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            </span>
            Actualización Masiva de Productos (Estilo Tiendanube)
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              {errorMsg}
            </div>
          )}

          {previewInfo && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              {previewInfo}
            </div>
          )}

          {/* 1. Seleccionar Archivo */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              1. Seleccionar Archivo (.csv / .xlsx / .txt)
            </label>
            <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl bg-slate-50">
              <label className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors shadow-xs shrink-0">
                Seleccionar archivo
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.txt" 
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} 
                  className="hidden" 
                />
              </label>
              <span className="text-xs font-medium text-slate-600 truncate">
                {file ? file.name : 'Ningún archivo seleccionado'}
              </span>
            </div>
          </div>

          {/* 2. Selector de campos a actualizar */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. ¿Qué datos querés actualizar?
              </label>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => selectAllFields(true)}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  Seleccionar todos
                </button>
                <span className="text-slate-300">|</span>
                <button 
                  type="button" 
                  onClick={() => selectAllFields(false)}
                  className="text-[11px] font-bold text-slate-500 hover:underline"
                >
                  Desmarcar todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Stock */}
              <label 
                onClick={() => toggleField('stock')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.stock 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.stock}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Stock e Inventario</p>
                  <p className="text-[10px] text-slate-500 font-normal">Actualiza las unidades disponibles</p>
                </div>
              </label>

              {/* Precios */}
              <label 
                onClick={() => toggleField('precios')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.precios 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.precios}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Precios y Costos</p>
                  <p className="text-[10px] text-slate-500 font-normal">Público, Canillita, Distribuidor, Promo, Costo</p>
                </div>
              </label>

              {/* Categoría */}
              <label 
                onClick={() => toggleField('categoria')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.categoria 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.categoria}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Categoría</p>
                  <p className="text-[10px] text-slate-500 font-normal">Re-asigna por ID o Nombre de Categoría</p>
                </div>
              </label>

              {/* Estado */}
              <label 
                onClick={() => toggleField('estado')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.estado 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.estado}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Estado</p>
                  <p className="text-[10px] text-slate-500 font-normal">Activo, Borrador o Pausado</p>
                </div>
              </label>

              {/* Detalles */}
              <label 
                onClick={() => toggleField('detalles')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.detalles 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.detalles}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Nombre, Marca y Descripción</p>
                  <p className="text-[10px] text-slate-500 font-normal">Detalles informativos del producto</p>
                </div>
              </label>

              {/* Imágenes */}
              <label 
                onClick={() => toggleField('imagenes')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                  fieldsToUpdate.imagenes 
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={fieldsToUpdate.imagenes}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Imagen Portada</p>
                  <p className="text-[10px] text-slate-500 font-normal">URL de foto de portada</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 shrink-0">
          <button 
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 font-bold text-slate-600 hover:text-slate-900 transition-colors text-sm"
          >
            Cancelar
          </button>
          <button 
            onClick={handleReimport}
            disabled={loading || !file}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-md text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            {loading ? 'Procesando...' : 'Aplicar Cambios Seleccionados'}
          </button>
        </div>
      </div>
    </div>
  );
}
