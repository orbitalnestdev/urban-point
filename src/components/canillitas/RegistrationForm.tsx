import React, { useState, useEffect, useRef } from 'react';
import { actions } from 'astro:actions';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, User, Store, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, Loader2, Info } from 'lucide-react';
import MapSelector from './MapSelector';

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type Step = 1 | 2 | 3 | 4; // 4 is success

export default function RegistrationForm() {
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: '',
    nombre_comercial: '',
    direccion: '',
    localidad: 'Palermo',
    provincia: 'CABA',
    cbu: '',
    condicion_fiscal: 'Monotributo',
    horarios: 'Lunes a Viernes de 9 a 18hs',
    lat: -34.6037, // default BA
    lng: -58.3816,
  });

  const updateForm = (key: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const nextStep = () => {
    setError(null);
    if (step === 1) {
      if (!formData.nombre || !formData.apellido || !formData.dni || !formData.telefono || !formData.email) {
        setError('Por favor completá todos los datos personales.');
        return;
      }
      if (formData.nombre.trim().length < 2 || formData.apellido.trim().length < 2) {
        setError('El nombre y apellido deben tener al menos 2 letras.');
        return;
      }
      if (formData.dni.trim().length < 7) {
        setError('El DNI debe tener al menos 7 números.');
        return;
      }
      if (formData.telefono.trim().length < 8) {
        setError('El teléfono debe tener al menos 8 números.');
        return;
      }
      if (!/^\\S+@\\S+\\.\\S+$/.test(formData.email)) {
        setError('El email ingresado no es válido.');
        return;
      }
    }
    if (step === 2) {
      if (!formData.nombre_comercial || !formData.direccion || !formData.localidad || !formData.provincia) {
        setError('Por favor completá los datos de ubicación del local (nombre, dirección, barrio/localidad y provincia).');
        return;
      }
      if (formData.nombre_comercial.trim().length < 2) {
        setError('El nombre comercial debe tener al menos 2 caracteres.');
        return;
      }
      if (formData.direccion.trim().length < 5) {
        setError('La dirección debe ser más específica (mínimo 5 caracteres).');
        return;
      }
      if (formData.horarios.trim().length < 5) {
        setError('Los horarios deben tener al menos 5 caracteres.');
        return;
      }
    }
    setStep((s) => (s + 1) as Step);
  };

  const prevStep = () => setStep((s) => (s - 1) as Step);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { data, error: actionError } = await actions.registerCanillita(formData);
      
      if (actionError) {
        throw new Error(actionError.message || 'Error desconocido.');
      }
      
      if (!data?.success) {
        throw new Error(data?.error || 'Error al procesar la solicitud.');
      }
      
      setStep(4);
    } catch (e: any) {
      setError(e.message || 'Error al enviar la solicitud. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden relative">
      {/* Progress Header */}
      {step < 4 && (
        <div className="bg-[#F2F7F3] border-b border-[#D4E5D6] px-8 py-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Postulación de Local</h3>
                <p className="text-sm text-slate-600 font-medium mt-1">Paso {step} de 3</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors duration-300 ${step >= 1 ? 'bg-[#2D5A27] text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>1</div>
              <div className={`w-12 h-1 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-[#2D5A27]' : 'bg-slate-200'}`}></div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors duration-300 ${step >= 2 ? 'bg-[#2D5A27] text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>2</div>
              <div className={`w-12 h-1 rounded-full transition-colors duration-300 ${step >= 3 ? 'bg-[#2D5A27]' : 'bg-slate-200'}`}></div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors duration-300 ${step >= 3 ? 'bg-[#2D5A27] text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>3</div>
            </div>
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="p-8 md:p-12">
        {error && (
          <div className="mb-8 bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-3 mb-8 text-[#2D5A27]">
              <div className="p-3 bg-[#F2F7F3] rounded-2xl">
                <User className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Datos Personales</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Nombre</label>
                <input type="text" value={formData.nombre} onChange={e => updateForm('nombre', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Juan" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Apellido</label>
                <input type="text" value={formData.apellido} onChange={e => updateForm('apellido', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Pérez" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">DNI</label>
                <input type="text" value={formData.dni} onChange={e => updateForm('dni', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Sin puntos ni espacios" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Teléfono / WhatsApp</label>
                <input type="tel" value={formData.telefono} onChange={e => updateForm('telefono', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Ej: 1145678901" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
                <input type="email" value={formData.email} onChange={e => updateForm('email', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="juan@ejemplo.com" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-3 mb-8 text-[#2D5A27]">
              <div className="p-3 bg-[#F2F7F3] rounded-2xl">
                <Store className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Datos del Local</h2>
            </div>

            <div className="grid gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Comercial del Punto</label>
                <input type="text" value={formData.nombre_comercial} onChange={e => updateForm('nombre_comercial', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Ej: Kiosco de Diarios - Av. Santa Fe" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Barrio / Localidad</label>
                  <input type="text" value={formData.localidad} onChange={e => updateForm('localidad', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Ej: Palermo, Belgrano, San Isidro" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Provincia</label>
                  <select value={formData.provincia} onChange={e => updateForm('provincia', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 shadow-sm cursor-pointer">
                    <option value="CABA">CABA</option>
                    <option value="Buenos Aires">Buenos Aires</option>
                    <option value="Santa Fe">Santa Fe</option>
                    <option value="Córdoba">Córdoba</option>
                    <option value="Mendoza">Mendoza</option>
                    <option value="Entre Ríos">Entre Ríos</option>
                    <option value="Tucumán">Tucumán</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Dirección Exacta</label>
                <input type="text" value={formData.direccion} onChange={e => updateForm('direccion', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Av. Santa Fe 3250" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Condición Fiscal</label>
                  <select value={formData.condicion_fiscal} onChange={e => updateForm('condicion_fiscal', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 shadow-sm cursor-pointer">
                    <option value="Monotributo">Monotributo</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">CBU / Alias (Cobro comisiones)</label>
                  <input type="text" value={formData.cbu} onChange={e => updateForm('cbu', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="0000003100012345678901 o alias" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                  <span>Ubicación en el Mapa</span>
                  <span className="text-xs text-[#2D5A27] font-bold bg-[#F2F7F3] border border-[#D4E5D6] px-2 py-1 rounded-md">¡IMPORTANTE!</span>
                </label>
                <p className="text-sm text-slate-500 mb-4">Arrastrá el pin para marcar exactamente la ubicación de la puerta de tu local.</p>
                <div className="h-[350px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
                  <MapSelector 
                    lat={formData.lat} 
                    lng={formData.lng} 
                    onChange={(lat, lng, info) => {
                      updateForm('lat', lat);
                      updateForm('lng', lng);
                      if (info) {
                          if (info.direccion) updateForm('direccion', info.direccion);
                          if (info.localidad) updateForm('localidad', info.localidad);
                          if (info.provincia) {
                              const p = info.provincia.toLowerCase();
                              if (p.includes('buenos aires') && !p.includes('autónoma')) updateForm('provincia', 'Buenos Aires');
                              else if (p.includes('autónoma') || p.includes('caba')) updateForm('provincia', 'CABA');
                              else if (p.includes('santa fe')) updateForm('provincia', 'Santa Fe');
                              else if (p.includes('córdoba') || p.includes('cordoba')) updateForm('provincia', 'Córdoba');
                              else if (p.includes('mendoza')) updateForm('provincia', 'Mendoza');
                              else if (p.includes('entre ríos') || p.includes('entre rios')) updateForm('provincia', 'Entre Ríos');
                              else if (p.includes('tucumán') || p.includes('tucuman')) updateForm('provincia', 'Tucumán');
                          }
                      }
                    }} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Horarios de Atención</label>
                <input type="text" value={formData.horarios} onChange={e => updateForm('horarios', e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-4 focus:ring-[#2D5A27]/10 focus:border-[#2D5A27] outline-none transition-all font-medium text-slate-900 placeholder:text-slate-400 shadow-sm" placeholder="Ej: Lunes a Sábado de 07:00 a 20:00 hs." />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-3 mb-8 text-[#2D5A27]">
              <div className="p-3 bg-[#F2F7F3] rounded-2xl">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Confirmar Solicitud</h2>
            </div>
            
            <p className="text-slate-600 mb-8 text-lg font-medium">
              Estás a un paso de postularte como Canillita. Por favor revisá que la información de tu local sea correcta.
            </p>

            <div className="bg-[#F9FAFB] p-6 rounded-2xl border border-slate-200 mb-8 space-y-4 shadow-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-medium">Titular</span>
                <span className="font-bold text-slate-900">{formData.nombre} {formData.apellido}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-medium">Local</span>
                <span className="font-bold text-slate-900">{formData.nombre_comercial}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-medium">Dirección</span>
                <span className="font-bold text-slate-900 text-right">{formData.direccion}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-medium">Localidad</span>
                <span className="font-bold text-slate-900 text-right">{formData.localidad}, {formData.provincia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Horarios</span>
                <span className="font-bold text-slate-900">{formData.horarios}</span>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-[#F2F7F3] p-5 rounded-2xl border border-[#D4E5D6]">
              <Info className="w-6 h-6 text-[#2D5A27] shrink-0 mt-0.5" />
              <p className="text-sm text-[#23471F] font-medium leading-relaxed">
                Al enviar la solicitud, nuestro equipo revisará los datos y la ubicación para asegurar que no haya otro punto en un radio de 100 metros. Te notificaremos por email sobre los siguientes pasos en un plazo de 24 a 48 horas.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="py-16 text-center animate-in zoom-in duration-700">
            <div className="w-28 h-28 bg-[#F2F7F3] text-[#2D5A27] rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-[#2D5A27]/20 relative">
                <div className="absolute inset-0 bg-[#2D5A27]/10 rounded-full animate-ping opacity-75"></div>
                <CheckCircle className="w-14 h-14 relative z-10" />
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">¡Solicitud Enviada!</h2>
            <p className="text-lg text-slate-600 mb-10 max-w-lg mx-auto leading-relaxed">
              Hemos recibido tu postulación para <strong>{formData.nombre_comercial}</strong>. La revisaremos y nos pondremos en contacto con vos a la brevedad para activar tu cuenta.
            </p>
            <a href="/" className="inline-flex px-8 py-4 bg-[#2D5A27] text-white font-bold rounded-xl hover:bg-[#23471F] transition-all hover:scale-105 shadow-lg shadow-[#2D5A27]/20">
              Volver al Inicio
            </a>
          </div>
        )}

        {/* Footer Actions */}
        {step < 4 && (
          <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
            {step > 1 ? (
              <button onClick={prevStep} disabled={isSubmitting} className="px-6 py-3.5 text-slate-500 font-bold hover:text-slate-900 transition-colors flex items-center gap-2 disabled:opacity-50 hover:bg-slate-50 rounded-xl">
                <ChevronLeft className="w-5 h-5" /> Atrás
              </button>
            ) : <div></div>}
            
            {step < 3 ? (
              <button onClick={nextStep} className="px-8 py-3.5 bg-[#2D5A27] hover:bg-[#23471F] text-white font-bold rounded-xl shadow-lg shadow-[#2D5A27]/30 transition-all flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0">
                Siguiente Paso <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={isSubmitting} className="px-10 py-3.5 bg-[#2D5A27] hover:bg-[#23471F] text-white font-bold rounded-xl shadow-lg shadow-[#2D5A27]/30 transition-all flex items-center gap-3 disabled:opacity-70 hover:-translate-y-0.5 active:translate-y-0">
                {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
