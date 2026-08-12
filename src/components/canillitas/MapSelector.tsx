import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, MapPin } from 'lucide-react';

interface MapSelectorProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number, addressInfo?: { direccion: string, localidad: string, provincia: string }) => void;
}

export default function MapSelector({ lat, lng, onChange }: MapSelectorProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const performReverseGeocoding = async (lat: number, lng: number) => {
    try {
        const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
        const data = await res.json();
        if (data && data.features && data.features.length > 0) {
            const props = data.features[0].properties;
            const direccion = props.street ? `${props.street} ${props.housenumber || ''}`.trim() : (props.name || '');
            const localidad = props.district || props.city || '';
            const provincia = props.state || '';
            return { direccion, localidad, provincia };
        }
    } catch (e) {
        console.error("Reverse geocoding error", e);
    }
    return undefined;
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([lat, lng], 15);
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);
    
    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google'
    }).addTo(mapInstance.current);

    const customIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div style="transform: scale(1.2);" class="flex items-center justify-center">
        <div style="background-color: #2D5A27; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.3);" class="w-8 h-8 rounded-full flex items-center justify-center text-white cursor-grab active:cursor-grabbing">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        </div>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    markerInstance.current = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(mapInstance.current);

    markerInstance.current.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      mapInstance.current?.setView(pos);
      const addressInfo = await performReverseGeocoding(pos.lat, pos.lng);
      onChange(pos.lat, pos.lng, addressInfo);
    });

    mapInstance.current.on('click', async (e: L.LeafletMouseEvent) => {
      markerInstance.current?.setLatLng(e.latlng);
      mapInstance.current?.flyTo(e.latlng, 16);
      const addressInfo = await performReverseGeocoding(e.latlng.lat, e.latlng.lng);
      onChange(e.latlng.lat, e.latlng.lng, addressInfo);
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync with external updates
  useEffect(() => {
    if (markerInstance.current && mapInstance.current) {
        const currentPos = markerInstance.current.getLatLng();
        if (currentPos.lat !== lat || currentPos.lng !== lng) {
            markerInstance.current.setLatLng([lat, lng]);
            mapInstance.current.flyTo([lat, lng], 16);
        }
    }
  }, [lat, lng]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery + ', Argentina')}&limit=1`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const newLng = parseFloat(data.features[0].geometry.coordinates[0]);
        const newLat = parseFloat(data.features[0].geometry.coordinates[1]);
        const props = data.features[0].properties;
        const direccion = props.street ? `${props.street} ${props.housenumber || ''}`.trim() : (props.name || '');
        const localidad = props.district || props.city || '';
        const provincia = props.state || '';
        
        onChange(newLat, newLng, { direccion, localidad, provincia });
      } else {
        alert('No se encontró la dirección. Intentá agregar tu ciudad (Ej: Callao 722, CABA).');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Search Overlay */}
      <div className="absolute top-4 left-4 right-16 z-[400] max-w-sm">
        <form onSubmit={handleSearch} className="relative">
          <input 
            type="text" 
            placeholder="Buscar calle y número..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-12 py-3 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2D5A27] transition-shadow"
          />
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <button 
            type="submit"
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#2D5A27] text-white rounded-lg hover:bg-[#23471F] transition-colors disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>
      </div>
      
      <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 0, borderRadius: 'inherit' }} />
    </div>
  );
}
