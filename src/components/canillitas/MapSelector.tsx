import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface MapSelectorProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

export default function MapSelector({ lat, lng, onChange }: MapSelectorProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current).setView([lat, lng], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance.current);

    markerInstance.current = L.marker([lat, lng], { draggable: true }).addTo(mapInstance.current);

    markerInstance.current.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      onChange(pos.lat, pos.lng);
    });

    mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
      markerInstance.current?.setLatLng(e.latlng);
      onChange(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync with external updates
  useEffect(() => {
    // Only update if map is initialized and the marker is not already at the new position
    // to avoid resetting the view while dragging
    if (markerInstance.current && mapInstance.current) {
        const currentPos = markerInstance.current.getLatLng();
        if (currentPos.lat !== lat || currentPos.lng !== lng) {
            markerInstance.current.setLatLng([lat, lng]);
            mapInstance.current.setView([lat, lng]);
        }
    }
  }, [lat, lng]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 0, borderRadius: 'inherit' }} />;
}
