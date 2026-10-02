import React, { useState } from 'react';
import {
  Smartphone,
  PlusCircle,
  Zap,
  Battery,
  BatteryCharging,
  Wifi,
  Radio,
  Clock,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ChildDevice, CommandType } from '../types';
import { LiveMonitoringCards } from './LiveMonitoringCards';
import { LiveLocationMap } from './LiveLocationMap';
import { UsageReportCard } from './UsageReportCard';
import { AppManagementCard } from './AppManagementCard';
import { ScreenTimeCard } from './ScreenTimeCard';
import { DevicePermissionsOverviewCard } from './DevicePermissionsOverviewCard';
import { GeminiSafetyAdvisorCard } from './GeminiSafetyAdvisorCard';
import { sendGuardianCommand } from '../services/deviceService';

interface GuardianDashboardProps {
  devices: ChildDevice[];
  onOpenAddChild: () => void;
  onOpenConnectionTest: (device: ChildDevice) => void;
  embeddedMode?: boolean;
}

export const GuardianDashboard: React.FC<GuardianDashboardProps> = ({
  devices,
  onOpenAddChild,
  onOpenConnectionTest,
  embeddedMode = false,
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    devices.length > 0 ? devices[0].deviceId : null
  );
  const [loadingCommand, setLoadingCommand] = useState<string | null>(null);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  // Sync selected device
  const currentDevice =
    devices.find((d) => d.deviceId === selectedDeviceId) || devices[0] || null;

  // Real heartbeat check: within last 35 seconds
  const isOnline =
    currentDevice &&
    currentDevice.isOnline &&
    Date.now() - currentDevice.lastSeen < 35000;

  const handleSendCommand = async (type: CommandType, payload?: Record<string, unknown>) => {
    if (!currentDevice) return;
    setLoadingCommand(type);
    try {
      await sendGuardianCommand(currentDevice.deviceId, type, payload);
    } catch (err) {
      console.error(`Failed to send command ${type}:`, err);
    } finally {
      setTimeout(() => setLoadingCommand(null), 1000);
    }
  };

  const handleRefreshLocation = async () => {
    if (!currentDevice) return;
    setIsRefreshingLocation(true);
    try {
      await sendGuardianCommand(currentDevice.deviceId, 'REFRESH_LOCATION');
    } catch (err) {
      console.error('Failed to send refresh location:', err);
    } finally {
      setTimeout(() => setIsRefreshingLocation(false), 2000);
    }
  };

  if (devices.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto shadow-sm">
          <Smartphone className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">No Child Devices Paired</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
            Generate an ephemeral 6-digit pairing code to securely link your child's Android phone.
          </p>
        </div>
        <button
          onClick={onOpenAddChild}
          className="py-3 px-6 rounded-2xl text-xs font-bold bg-purple-700 hover:bg-purple-800 active:scale-95 text-white shadow-md shadow-purple-300 transition-all inline-flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          + Add Child Phone
        </button>
      </div>
    );
  }

  if (!currentDevice) return null;

  return (
    <div className={`max-w-4xl mx-auto px-4 py-6 space-y-6 ${embeddedMode ? 'pb-8' : 'pb-24'}`}>
      {/* 5-Child Family Device Switcher Bar */}
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
            5
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">5-CHILD MONITORING SLOTS</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                {devices.length}/5 Paired
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Track and protect up to 5 children simultaneously</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          {Array.from({ length: 5 }).map((_, index) => {
            const dev = devices[index];
            const isSelected = dev && dev.deviceId === currentDevice.deviceId;
            const isDevOnline = dev && dev.isOnline && Date.now() - dev.lastSeen < 35000;

            if (dev) {
              return (
                <button
                  key={dev.deviceId}
                  onClick={() => setSelectedDeviceId(dev.deviceId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-purple-700 text-white shadow-sm shadow-purple-300'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200/60'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isDevOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  <span>{dev.childName || `Child ${index + 1}`}</span>
                  {dev.batteryLevel !== null && (
                    <span className={`text-[10px] ${isSelected ? 'text-purple-200' : 'text-slate-500'}`}>
                      {dev.batteryLevel}%
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={`empty-slot-${index}`}
                onClick={onOpenAddChild}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 border border-dashed border-slate-200 hover:border-purple-300 hover:text-purple-600 transition-all bg-slate-50/50"
                title={`Slot ${index + 1}: Click to pair Child ${index + 1}`}
              >
                <PlusCircle className="w-3 h-3" />
                <span>+ Child {index + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Top Device Status Card */}
      <div className="bg-gradient-to-br from-purple-800 via-purple-700 to-indigo-800 rounded-3xl p-5 text-white shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-extrabold uppercase tracking-wider text-purple-200">
              {isOnline ? 'Child Device Online' : 'Child Device Offline'}
            </span>
          </div>

          <button
            onClick={() => onOpenConnectionTest(currentDevice)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 active:scale-95 transition-all backdrop-blur-xs border border-white/20 text-white"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            TEST CONNECTION
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-black tracking-tight">{currentDevice.childName}</h1>
          <p className="text-xs text-purple-200">
            {currentDevice.deviceModel || 'Android Device'} • ID: {currentDevice.deviceId.substring(0, 16)}...
          </p>
        </div>

        {/* Real Status Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-purple-600/50 text-xs">
          {/* Battery */}
          <div className="p-2.5 rounded-xl bg-purple-900/40 backdrop-blur-xs border border-purple-400/20 flex items-center gap-2">
            {currentDevice.batteryLevel !== null ? (
              <>
                {currentDevice.isCharging ? (
                  <BatteryCharging className="w-4 h-4 text-emerald-300" />
                ) : (
                  <Battery className="w-4 h-4 text-purple-200" />
                )}
                <div>
                  <div className="font-bold">{currentDevice.batteryLevel}% {currentDevice.isCharging ? '(Charging)' : ''}</div>
                  <div className="text-[10px] text-purple-300">Real Battery Status</div>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-purple-300 italic">No battery data</span>
            )}
          </div>

          {/* Network */}
          <div className="p-2.5 rounded-xl bg-purple-900/40 backdrop-blur-xs border border-purple-400/20 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-purple-200" />
            <div>
              <div className="font-bold">{currentDevice.networkStatus}</div>
              <div className="text-[10px] text-purple-300">Network Interface</div>
            </div>
          </div>

          {/* Heartbeat / Last Seen */}
          <div className="p-2.5 rounded-xl bg-purple-900/40 backdrop-blur-xs border border-purple-400/20 flex items-center gap-2 col-span-2 sm:col-span-1">
            <Clock className="w-4 h-4 text-purple-200" />
            <div>
              <div className="font-bold">
                {isOnline ? 'Active Now' : `${Math.floor((Date.now() - currentDevice.lastSeen) / 1000)}s ago`}
              </div>
              <div className="text-[10px] text-purple-300">Heartbeat Presence</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Connection Test Quick Bar */}
      <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-900">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-purple-700 shrink-0" />
          <span>
            <strong>Connection Verified:</strong> PING/PONG command channel active between Guardian and Child phone.
          </span>
        </div>
        <button
          onClick={() => onOpenConnectionTest(currentDevice)}
          className="text-xs font-bold text-purple-700 hover:text-purple-900 underline underline-offset-2 shrink-0"
        >
          Run Full Diagnostic
        </button>
      </div>

      {/* REAL-TIME DEVICE PERMISSIONS & TELEMETRY */}
      <DevicePermissionsOverviewCard device={currentDevice} />

      {/* GEMINI AI SMART SAFETY ADVISOR */}
      <GeminiSafetyAdvisorCard device={currentDevice} />

      {/* LIVE LOCATION MAP */}
      <LiveLocationMap
        location={currentDevice.location}
        childName={currentDevice.childName}
        onRefresh={handleRefreshLocation}
        isRefreshing={isRefreshingLocation}
      />

      {/* LIVE MONITORING (CAMERA, SCREEN, AUDIO, FLASHLIGHT) */}
      <LiveMonitoringCards
        device={currentDevice}
        onSendCommand={handleSendCommand}
        isLoadingCommand={loadingCommand}
      />

      {/* USAGE REPORT */}
      <UsageReportCard device={currentDevice} />

      {/* APP MANAGEMENT */}
      <AppManagementCard device={currentDevice} />

      {/* SCREEN TIME */}
      <ScreenTimeCard device={currentDevice} />
    </div>
  );
};
