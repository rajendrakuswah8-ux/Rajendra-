import React, { useEffect, useRef } from 'react';
import { DeviceLocation } from '../types';
import { MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import L from 'leaflet';

interface LiveLocationMapProps {
  location: DeviceLocation | null;
  childName: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const LiveLocationMap: React.FC<LiveLocationMapProps> = ({
  location,
  childName,
  onRefresh,
  isRefreshing = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const hasValidCoords =
    location &&
    location.permissionStatus === 'granted' &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    (location.latitude !== 0 || location.longitude !== 0);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = hasValidCoords ? location.latitude : 37.7749;
      const initialLng = hasValidCoords ? location.longitude : -122.4194;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([initialLat, initialLng], hasValidCoords ? 15 : 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    if (hasValidCoords && map) {
      const latLng: L.LatLngExpression = [location.latitude, location.longitude];

      // Custom Purple Pin Marker Icon
      const customIcon = L.divIcon({
        className: 'custom-guardian-pin',
        html: `
          <div style="background-color: #6750A4; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(103,80,164,0.4); display: flex; align-items: center; justify-content: center; color: white;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!markerRef.current) {
        markerRef.current = L.marker(latLng, { icon: customIcon }).addTo(map);
      } else {
        markerRef.current.setLatLng(latLng);
      }

      // Accuracy circle
      if (location.accuracy && location.accuracy > 0) {
        if (!circleRef.current) {
          circleRef.current = L.circle(latLng, {
            radius: Math.min(location.accuracy, 500),
            color: '#6750A4',
            fillColor: '#6750A4',
            fillOpacity: 0.15,
            weight: 1.5,
          }).addTo(map);
        } else {
          circleRef.current.setLatLng(latLng);
          circleRef.current.setRadius(Math.min(location.accuracy, 500));
        }
      }

      map.panTo(latLng);
    }

    return () => {
      // Map cleanup on unmount
    };
  }, [hasValidCoords, location?.latitude, location?.longitude, location?.accuracy]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">LIVE LOCATION</h3>
            <p className="text-xs text-slate-500">
              {hasValidCoords
                ? `Updated ${new Date(location.timestamp).toLocaleTimeString()}`
                : 'Real-time GPS coordinates'}
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      {/* Map or Error Banner */}
      <div className="relative h-64 w-full bg-slate-100">
        <div ref={mapContainerRef} className="h-full w-full" />

        {!hasValidCoords && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-[1000]">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-white font-medium text-sm mb-1">
              {location?.permissionStatus === 'denied'
                ? 'Location Permission Denied'
                : 'Live Location Unavailable'}
            </h4>
            <p className="text-slate-300 text-xs max-w-xs mb-3">
              {location?.errorMessage ||
                'Child device has not granted location permission or GPS hardware is disabled. Real location will display immediately when authorized.'}
            </p>
            <span className="text-[11px] text-purple-300 font-mono bg-purple-900/40 px-2.5 py-1 rounded-md border border-purple-400/20">
              No simulated data shown
            </span>
          </div>
        )}

        {/* Location stats footer badge */}
        {hasValidCoords && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200/80 text-[11px] text-slate-700 flex items-center gap-3 z-[1000]">
            <span>
              <strong>Lat:</strong> {location.latitude.toFixed(5)}
            </span>
            <span>
              <strong>Lng:</strong> {location.longitude.toFixed(5)}
            </span>
            <span>
              <strong>Accuracy:</strong> ±{location.accuracy}m
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
