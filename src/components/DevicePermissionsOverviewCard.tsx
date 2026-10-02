import React from 'react';
import {
  ShieldCheck,
  Camera,
  Mic,
  MapPin,
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  Smartphone,
  Wifi,
  Battery,
  BatteryCharging,
  Radio,
} from 'lucide-react';
import { ChildDevice } from '../types';

interface DevicePermissionsOverviewCardProps {
  device: ChildDevice;
}

export const DevicePermissionsOverviewCard: React.FC<DevicePermissionsOverviewCardProps> = ({
  device,
}) => {
  const isOnline = device.isOnline && Date.now() - device.lastSeen < 35000;

  const renderBadge = (status: 'granted' | 'denied' | 'prompt' | 'unsupported' | undefined) => {
    if (status === 'granted') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Allowed
        </span>
      );
    }
    if (status === 'denied') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 rounded-full">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          Denied
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
        Permission Required
      </span>
    );
  };

  const formatLastSync = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 5) return 'Just now (live sync)';
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">CHILD DEVICE PERMISSIONS & TELEMETRY</h3>
            <p className="text-xs text-slate-500">Real-time status synced from child phone</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-500 flex items-center gap-1 justify-end font-mono">
            <Clock className="w-3 h-3 text-purple-600" />
            {formatLastSync(device.lastSeen)}
          </span>
          <span className="text-[10px] text-slate-400">LAST HEARTBEAT</span>
        </div>
      </div>

      {/* 4 Core Android Runtime Permissions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Camera Permission */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-purple-700">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Camera Permission</div>
              <div className="text-[10px] text-slate-400">Remote Video Monitoring</div>
            </div>
          </div>
          {renderBadge(device.permissions?.camera)}
        </div>

        {/* Microphone Permission */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-purple-700">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Microphone Permission</div>
              <div className="text-[10px] text-slate-400">One-Way Audio Stream</div>
            </div>
          </div>
          {renderBadge(device.permissions?.microphone)}
        </div>

        {/* Location Permission */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-purple-700">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Location (GPS)</div>
              <div className="text-[10px] text-slate-400">Real-Time Coordinates</div>
            </div>
          </div>
          {renderBadge(device.permissions?.location)}
        </div>

        {/* Notifications Permission */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-purple-700">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Notifications</div>
              <div className="text-[10px] text-slate-400">FCM Urgent Alerts</div>
            </div>
          </div>
          {renderBadge(device.permissions?.notifications)}
        </div>
      </div>

      {/* Real Hardware & Location Detail Snapshot */}
      <div className="p-3.5 rounded-2xl bg-purple-50/40 border border-purple-100/80 text-xs space-y-2">
        <div className="flex items-center justify-between font-bold text-slate-800 text-[11px] pb-1 border-b border-purple-100">
          <span>HARDWARE IDENTIFICATION & REAL DATA</span>
          <span className={isOnline ? 'text-emerald-700 font-extrabold' : 'text-slate-500'}>
            {isOnline ? '● Online & Listening' : '○ Standby / Offline'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
          <div>
            <strong>Device Model:</strong> {device.deviceModel || 'Android Device'}
          </div>
          <div>
            <strong>Device ID:</strong>{' '}
            <span className="font-mono text-slate-500">{device.deviceId}</span>
          </div>
          <div>
            <strong>Battery:</strong>{' '}
            {device.batteryLevel !== null ? (
              <span className="font-semibold text-slate-900">
                {device.batteryLevel}% {device.isCharging ? '(Charging ⚡)' : ''}
              </span>
            ) : (
              <span className="text-slate-400 italic">No battery data reported</span>
            )}
          </div>
          <div>
            <strong>Network:</strong> {device.networkStatus || 'UNKNOWN'}
          </div>
        </div>

        {/* Location coordinates summary */}
        <div className="pt-1 text-[11px] text-slate-700 border-t border-purple-100 flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-purple-700 shrink-0" />
          {device.location && device.location.permissionStatus === 'granted' && device.location.latitude !== 0 ? (
            <span>
              <strong>Last Known Location:</strong> Lat: {device.location.latitude.toFixed(5)}, Lng:{' '}
              {device.location.longitude.toFixed(5)} (±{device.location.accuracy}m, updated{' '}
              {new Date(device.location.timestamp).toLocaleTimeString()})
            </span>
          ) : device.location?.permissionStatus === 'denied' ? (
            <span className="text-rose-600 font-medium">
              Location permission has been denied on the child phone.
            </span>
          ) : (
            <span className="text-amber-700 font-medium">
              Location permission not yet authorized by child device.
            </span>
          )}
        </div>
      </div>

      {/* Secret Parent PIN & Anti-Uninstall Protection Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/80 to-white border border-purple-200/80 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-xs">
                PARENT SECURITY PIN & ANTI-UNINSTALL CODE
              </h4>
              <p className="text-[11px] text-slate-500">
                Child app cannot be opened or uninstalled without this secret PIN
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            Anti-Uninstall Active
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-purple-100">
          <div className="flex items-center gap-3">
            <span className="text-slate-600 font-medium">Active Security Code:</span>
            <span className="font-mono text-base font-extrabold text-purple-700 bg-white px-3 py-1 rounded-xl border border-purple-200 shadow-2xs tracking-widest">
              {(device as unknown as { securityPin?: string }).securityPin || '123456'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 max-w-sm">
            Enter this code on the child phone to open settings. If child tries to uninstall from
            Settings or Launcher, Device Admin prompts for this code.
          </p>
        </div>
      </div>
    </div>
  );
};
