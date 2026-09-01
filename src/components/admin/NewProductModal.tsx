import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';

/**
 * Alta de producto.
 *
 * Antes ofrecía tres "tipos" —simple, con variantes y combo— pero ninguno se
 * guardaba: `createProduct` recibía `tipo` y lo descartaba, y el editor decidía
 * qué mostrar leyendo `?tipo=` de la URL. Al volver desde el listado, que
 * enlaza sin ese parámetro, las pestañas desaparecían. La de variantes además
 * no guardaba nada: sembraba tres filas S/M/L con stock inventado y su
 * contenido nunca entraba al payload de guardado. La de combos no tenía nada
 * detrás.
 *
 * El modelo real, y el único que la tienda entiende, es el de documentos
 * hermanos: cada variante es su propio producto y se agrupan por el campo
 * `grupo` (ver src/lib/variantes.ts). Así cada una conserva su stock, su SKU y
 * su historial en order_items.
 */
export default function NewProductModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setErrorMsg('');
      setCreando(false);
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

  const crearProducto = async () => {
    setCreando(true);
    setErrorMsg('');

    try {
      const { data, error } = await actions.createProduct({ nombre: 'Nuevo producto' });

      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'Error al crear producto');
        setCreando(false);
        return;
      }

      window.location.href = `/admin/catalogo/${data.id}`;
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de conexión');
      setCreando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-100">

        <div className="p-6 pb-2 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nuevo producto</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Se crea como borrador y no se publica hasta que lo actives.
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

          <button
            onClick={crearProducto}
            disabled={creando}
            className="w-full text-left p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-start gap-4 group cursor-pointer disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base group-hover:text-emerald-600 transition-colors">
                {creando ? 'Creando...' : 'Crear producto'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Un SKU, un precio, un stock.</p>
            </div>
          </button>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              ¿Y si el producto tiene variantes?
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Cada talle, color o número de fascículo es <strong>su propio producto</strong>, con su
              stock y su precio. Para que se muestren juntos en una sola tarjeta, cargales el mismo
              texto en el campo <strong>Grupo de variantes</strong> de la pestaña Identidad.
            </p>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Si son muchas, conviene importarlas por CSV: una fila por variante y una columna
              <strong> Grupo</strong>. La vista previa del importador te muestra cuántas fichas van a
              quedar agrupadas antes de confirmar.
            </p>
          </div>
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
