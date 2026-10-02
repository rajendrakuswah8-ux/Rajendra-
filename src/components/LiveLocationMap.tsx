import React, { useEffect, useRef, useState } from 'react';
import { DeviceLocation } from '../types';
import { MapPin, AlertCircle, RefreshCw, Layers, ExternalLink, Globe } from 'lucide-react';
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
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');

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

      // Standard OSM Streets layer
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);
      streetLayerRef.current = streetLayer;

      // High-resolution Esri World Imagery Satellite layer
      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
        }
      );
      satelliteLayerRef.current = satelliteLayer;

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
          <div style="background-color: #6750A4; width: 38px; height: 38px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 14px rgba(103,80,164,0.6); display: flex; align-items: center; justify-content: center; color: white;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
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
            fillOpacity: 0.18,
            weight: 2,
          }).addTo(map);
        } else {
          circleRef.current.setLatLng(latLng);
          circleRef.current.setRadius(Math.min(location.accuracy, 500));
        }
      }

      map.panTo(latLng);
    }
  }, [hasValidCoords, location?.latitude, location?.longitude, location?.accuracy]);

  // Handle Map Type change (Street vs Satellite)
  const toggleMapType = (type: 'streets' | 'satellite') => {
    setMapType(type);
    const map = mapInstanceRef.current;
    if (!map || !streetLayerRef.current || !satelliteLayerRef.current) return;

    if (type === 'satellite') {
      map.removeLayer(streetLayerRef.current);
      satelliteLayerRef.current.addTo(map);
    } else {
      map.removeLayer(satelliteLayerRef.current);
      streetLayerRef.current.addTo(map);
    }
  };

  const googleMapsSatelliteUrl = hasValidCoords
    ? `https://www.google.com/maps/@${location.latitude},${location.longitude},18z/data=!3m1!1e3`
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">LIVE LOCATION & SATELLITE MAP</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Satellite Supported
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {hasValidCoords
                ? `Updated ${new Date(location.timestamp).toLocaleTimeString()}`
                : 'Real-time GPS coordinates'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {googleMapsSatelliteUrl && (
            <a
              href={googleMapsSatelliteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              title="Open Google Maps Satellite View"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google Satellite</span>
            </a>
          )}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Map or Error Banner */}
      <div className="relative h-72 w-full bg-slate-100">
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* Map Type Switcher Floating Pills (Streets vs Satellite) */}
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-1 z-[1000]">
          <button
            onClick={() => toggleMapType('streets')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              mapType === 'streets'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Default Map
          </button>
          <button
            onClick={() => toggleMapType('satellite')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              mapType === 'satellite'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            🛰️ Satellite (सैटेलाइट)
          </button>
        </div>

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
          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200/80 text-[11px] text-slate-700 flex items-center gap-3 z-[1000]">
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
