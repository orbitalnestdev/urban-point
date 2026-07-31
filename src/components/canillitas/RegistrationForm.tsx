import React, { useState, useEffect, useRef } from 'react';
import { actions } from 'astro:actions';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, User, Store, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';

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
    }
    if (step === 2) {
      if (!formData.nombre_comercial || !formData.direccion || !formData.localidad || !formData.provincia) {
        setError('Por favor completá los datos de ubicación del local (nombre, dirección, barrio/localidad y provincia).');
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
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      {/* Progress Header */}
      {step < 4 && (
        <div className="bg-slate-900 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>1</div>
            <div className={`w-8 h-1 ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>2</div>
            <div className={`w-8 h-1 ${step >= 3 ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>3</div>
          </div>
          <div className="text-white font-medium">
            Paso {step} de 3
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="p-8">
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6 text-indigo-600">
              <User className="w-6 h-6" />
              <h2 className="text-2xl font-bold text-slate-900">Datos Personales</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre</label>
                <input type="text" value={formData.nombre} onChange={e => updateForm('nombre', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Juan" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Apellido</label>
                <input type="text" value={formData.apellido} onChange={e => updateForm('apellido', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Pérez" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">DNI</label>
                <input type="text" value={formData.dni} onChange={e => updateForm('dni', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Sin puntos ni espacios" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Teléfono / WhatsApp</label>
                <input type="tel" value={formData.telefono} onChange={e => updateForm('telefono', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Ej: 1145678901" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input type="email" value={formData.email} onChange={e => updateForm('email', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="juan@ejemplo.com" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6 text-indigo-600">
              <Store className="w-6 h-6" />
              <h2 className="text-2xl font-bold text-slate-900">Datos del Local</h2>
            </div>

            <div className="grid gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre Comercial del Punto</label>
                <input type="text" value={formData.nombre_comercial} onChange={e => updateForm('nombre_comercial', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Kiosco de Diarios - Av. Santa Fe" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Barrio / Localidad</label>
                  <input type="text" value={formData.localidad} onChange={e => updateForm('localidad', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Ej: Palermo, Belgrano, San Isidro" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Provincia</label>
                  <select value={formData.provincia} onChange={e => updateForm('provincia', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white">
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Dirección Exacta</label>
                <input type="text" value={formData.direccion} onChange={e => updateForm('direccion', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Av. Santa Fe 3250" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Condición Fiscal</label>
                  <select value={formData.condicion_fiscal} onChange={e => updateForm('condicion_fiscal', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white">
                    <option value="Monotributo">Monotributo</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CBU / Alias (Cobro comisiones)</label>
                  <input type="text" value={formData.cbu} onChange={e => updateForm('cbu', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="0000003100012345678901 o alias" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center justify-between">
                  <span>Ubicación en el Mapa</span>
                  <span className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded">¡IMPORTANTE!</span>
                </label>
                <p className="text-sm text-slate-500 mb-3">Arrastrá el pin para ubicar exactamente tu punto en el mapa de sucursales.</p>
                <div className="h-[300px] w-full rounded-2xl overflow-hidden border-2 border-indigo-100 shadow-inner relative z-0">
                  <MapSelector 
                    lat={formData.lat} 
                    lng={formData.lng} 
                    onChange={(lat, lng) => {
                      updateForm('lat', lat);
                      updateForm('lng', lng);
                    }} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Horarios de Atención</label>
                <input type="text" value={formData.horarios} onChange={e => updateForm('horarios', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Ej: Lunes a Sábado de 07:00 a 20:00 hs." />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6 text-indigo-600">
              <CheckCircle className="w-6 h-6" />
              <h2 className="text-2xl font-bold text-slate-900">Confirmar Solicitud</h2>
            </div>
            
            <p className="text-slate-600 mb-8 text-lg">
              Estás a un paso de postularte como Canillita. Por favor revisá que la información de tu local sea correcta.
            </p>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8 space-y-4">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500">Titular</span>
                <span className="font-semibold text-slate-900">{formData.nombre} {formData.apellido}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500">Local</span>
                <span className="font-semibold text-slate-900">{formData.nombre_comercial}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500">Dirección</span>
                <span className="font-semibold text-slate-900 text-right">{formData.direccion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Horarios</span>
                <span className="font-semibold text-slate-900">{formData.horarios}</span>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Al enviar la solicitud, nuestro equipo revisará los datos y la ubicación para asegurar que no haya otro punto en un radio de 100 metros. Te notificaremos por email sobre los siguientes pasos.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="py-12 text-center animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-100">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">¡Solicitud Enviada!</h2>
            <p className="text-lg text-slate-600 mb-8 max-w-md mx-auto">
              Hemos recibido tu postulación para <strong>{formData.nombre_comercial}</strong>. La revisaremos y nos pondremos en contacto con vos a la brevedad.
            </p>
            <a href="/" className="inline-flex px-8 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors">
              Volver al Inicio
            </a>
          </div>
        )}

        {/* Footer Actions */}
        {step < 4 && (
          <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
            {step > 1 ? (
              <button onClick={prevStep} disabled={isSubmitting} className="px-6 py-3 text-slate-600 font-semibold hover:text-slate-900 transition-colors flex items-center gap-2 disabled:opacity-50">
                <ChevronLeft className="w-5 h-5" /> Atrás
              </button>
            ) : <div></div>}
            
            {step < 3 ? (
              <button onClick={nextStep} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 hover:-translate-y-0.5">
                Siguiente <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={isSubmitting} className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-70">
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

function MapSelector({ lat, lng, onChange }: { lat: number, lng: number, onChange: (lat: number, lng: number) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([lat, lng], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstance.current);

      markerInstance.current = L.marker([lat, lng], { draggable: true }).addTo(mapInstance.current);
      
      markerInstance.current.on('dragend', (e) => {
        const marker = e.target;
        const position = marker.getLatLng();
        onChange(position.lat, position.lng);
      });
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []); // Solo se inicializa una vez

  // Si cambia externamente (ej: geocoding, no implementado aquí para mantenerlo simple, pero el draggable actualiza el estado parent)
  
  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
