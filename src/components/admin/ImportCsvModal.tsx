import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';
import { downloadTemplateSimple, downloadTemplateVariantes } from '../../lib/exports';

type Props = {};

export default function ImportCsvModal({}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ nombre: string; sku: string; precio: string; stock: string }>({
    nombre: '',
    sku: '',
    precio: '',
    stock: ''
  });
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successCount, setSuccessCount] = useState(0);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setStep(1);
      setFile(null);
      setParsedRows([]);
      setErrorMsg('');
      setSuccessCount(0);
    };
    document.addEventListener('modal:import-csv', handleOpen);
    return () => {
      document.removeEventListener('modal:import-csv', handleOpen);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const processFile = (fileObj: File) => {
    setFile(fileObj);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) {
        setErrorMsg('El archivo está vacío.');
        return;
      }

      const rawHeaders = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
      setHeaders(rawHeaders);

      // Mapeo automático inteligente por nombre de columna
      const newMapping = {
        nombre: rawHeaders.find(h => /nombre|title|producto|description/i.test(h)) || rawHeaders[0] || '',
        sku: rawHeaders.find(h => /sku|codigo|id/i.test(h)) || rawHeaders[1] || '',
        precio: rawHeaders.find(h => /precio|price|monto/i.test(h)) || rawHeaders[2] || '',
        stock: rawHeaders.find(h => /stock|cantidad|units/i.test(h)) || rawHeaders[3] || ''
      };
      setMapping(newMapping);

      const dataRows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
        const row: Record<string, string> = {};
        rawHeaders.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        return row;
      });

      setParsedRows(dataRows);
      setStep(2); // Avanzar a Mapeo de Columnas
    };
    reader.readAsText(fileObj);
  };

  const handleConfirmMapping = () => {
    if (!mapping.nombre) {
      setErrorMsg('Seleccioná la columna correspondiente al Nombre.');
      return;
    }
    setStep(3); // Avanzar a Vista Previa
  };

  const handleExecuteImport = async () => {
    setStep(4);
    setIsImporting(true);
    setErrorMsg('');

    const itemsToImport = parsedRows.map(row => ({
      nombre: row[mapping.nombre] || 'Producto Sin Nombre',
      sku: row[mapping.sku] || '',
      precio: Math.round(parseFloat(row[mapping.precio] || '0') * 100),
      stock: parseInt(row[mapping.stock] || '0', 10)
    })).filter(item => item.nombre.trim().length > 0);

    try {
      const { data, error } = await actions.importProductsBulk({ items: itemsToImport });
      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'Error durante la importación');
        setIsImporting(false);
        return;
      }

      setSuccessCount(data.count || itemsToImport.length);
      setIsImporting(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de conexión');
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100">
        
        {/* Header con Stepper */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="12" y2="12"></line><line x1="15" y1="15" x2="12" y2="12"></line></svg>
              </span>
              Importar productos desde CSV
            </h2>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Stepper visual */}
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-4">
            <span className={`flex items-center gap-2 ${step >= 1 ? 'text-slate-900' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>1</span> Archivo
            </span>
            <div className="h-0.5 w-12 bg-slate-200"></div>
            <span className={`flex items-center gap-2 ${step >= 2 ? 'text-slate-900' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>2</span> Columnas
            </span>
            <div className="h-0.5 w-12 bg-slate-200"></div>
            <span className={`flex items-center gap-2 ${step >= 3 ? 'text-slate-900' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>3</span> Vista previa
            </span>
            <div className="h-0.5 w-12 bg-slate-200"></div>
            <span className={`flex items-center gap-2 ${step >= 4 ? 'text-slate-900' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 4 ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>4</span> Importando
            </span>
          </div>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* PASO 1: Selección de Archivo & Plantillas */}
          {step === 1 && (
            <div className="space-y-6">
              <label className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 hover:bg-indigo-50/20 group text-center">
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.txt" 
                  onChange={handleFileChange}
                  className="hidden" 
                />
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <h3 className="font-extrabold text-slate-900 text-lg mb-1">Click o arrastrá un archivo CSV o XLSX</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  No necesitás un formato específico — mapeamos las columnas automáticamente
                </p>
              </label>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plantillas:</span>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={downloadTemplateSimple}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Productos simples
                  </button>
                  <button 
                    onClick={downloadTemplateVariantes}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Con variantes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: Mapeo de Columnas */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-700">Verificá el mapeo de columnas detectado de tu archivo:</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del producto *</label>
                  <select 
                    value={mapping.nombre} 
                    onChange={e => setMapping({ ...mapping, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white"
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">SKU</label>
                  <select 
                    value={mapping.sku} 
                    onChange={e => setMapping({ ...mapping, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white"
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Precio (ARS)</label>
                  <select 
                    value={mapping.precio} 
                    onChange={e => setMapping({ ...mapping, precio: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white"
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Stock</label>
                  <select 
                    value={mapping.stock} 
                    onChange={e => setMapping({ ...mapping, stock: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white"
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-between">
                <button onClick={() => setStep(1)} className="px-4 py-2 font-bold text-xs text-slate-500">Volver</button>
                <button onClick={handleConfirmMapping} className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-xl shadow-md">Continuar a Vista Previa &rarr;</button>
              </div>
            </div>
          )}

          {/* PASO 3: Vista Previa */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-slate-900">Vista previa ({parsedRows.length} registros)</p>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Listo para importar</span>
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-3">Nombre</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-900">{row[mapping.nombre]}</td>
                        <td className="p-3 font-mono text-slate-500">{row[mapping.sku] || '-'}</td>
                        <td className="p-3 font-bold text-slate-900">${row[mapping.precio] || '0'}</td>
                        <td className="p-3 font-bold text-slate-900">{row[mapping.stock] || '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pt-4 flex justify-between">
                <button onClick={() => setStep(2)} className="px-4 py-2 font-bold text-xs text-slate-500">Volver</button>
                <button onClick={handleExecuteImport} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg">Confirmar e Importar Todo</button>
              </div>
            </div>
          )}

          {/* PASO 4: Importando */}
          {step === 4 && (
            <div className="py-12 text-center space-y-4">
              {isImporting ? (
                <>
                  <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mx-auto"></div>
                  <h3 className="font-extrabold text-slate-900 text-lg">Importando productos...</h3>
                  <p className="text-xs text-slate-400">Insertando registros en Appwrite Database</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-xl">¡Importación completada!</h3>
                  <p className="text-sm text-slate-500">Se importaron {successCount} productos con éxito.</p>
                </>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
