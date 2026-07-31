import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { AlertCircle, CheckCircle, Loader2, Banknote, FileText } from 'lucide-react';

export default function ActivationForm() {
  const [formData, setFormData] = useState({
    cbu: '',
    condicion_fiscal: 'monotributo'
  });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accepted) {
      setError('Debes aceptar los términos y condiciones para continuar.');
      return;
    }
    if (formData.cbu.length < 10) {
      setError('El CBU/CVU debe tener al menos 10 dígitos.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: actionError } = await actions.activateCanillita(formData);
      if (actionError) {
        throw new Error(actionError.message || 'Error de conexión');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Error al procesar la solicitud');
      }
      setSuccess(true);
      // Redirigir al panel
      setTimeout(() => {
        window.location.href = '/canillita';
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center shadow-xl border border-slate-100 animate-in zoom-in duration-500">
        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 mb-4">¡Cuenta Activada!</h2>
        <p className="text-slate-600 mb-8">Tu punto de retiro ya está visible para los clientes.</p>
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-2 text-indigo-500 font-medium">Redirigiendo a tu panel...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      <div className="bg-slate-900 p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Activá tu cuenta</h2>
        <p className="text-slate-400">Completá tus datos para empezar a recibir paquetes y ganar comisiones.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Banknote className="w-4 h-4 text-indigo-500" /> CBU o CVU
          </label>
          <input 
            type="text" 
            required
            placeholder="Ingresá los 22 números"
            value={formData.cbu}
            onChange={(e) => setFormData({...formData, cbu: e.target.value.replace(/\D/g,'')})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
            maxLength={22}
          />
          <p className="text-xs text-slate-500 mt-2">Acá depositaremos tus comisiones. Debe estar a nombre del titular de la cuenta.</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <FileText className="w-4 h-4 text-indigo-500" /> Condición Fiscal
          </label>
          <select 
            value={formData.condicion_fiscal}
            onChange={(e) => setFormData({...formData, condicion_fiscal: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="monotributo">Monotributista</option>
            <option value="responsable_inscripto">Responsable Inscripto</option>
            <option value="consumidor_final">Consumidor Final / Sin registrar</option>
          </select>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
          <input 
            type="checkbox" 
            id="terms" 
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
          />
          <label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer">
            Confirmo que mis horarios de atención precargados son correctos y me comprometo a recibir y entregar paquetes dentro de esa franja horaria. Acepto los <a href="#" className="text-indigo-600 underline">términos y condiciones</a> del programa.
          </label>
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Activando...</>
          ) : (
            'Activar Cuenta'
          )}
        </button>
      </form>
    </div>
  );
}
