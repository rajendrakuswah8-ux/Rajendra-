import React from 'react';
import { Bell, Smartphone, User, Plus, Battery, BatteryCharging, Zap, ShieldAlert } from 'lucide-react';
import { ChildDevice, GuardianTab } from '../types';

interface GuardianNavbarProps {
  currentTab: GuardianTab;
  onTabChange: (tab: GuardianTab) => void;
  devices: ChildDevice[];
  selectedDevice: ChildDevice | null;
  onSelectDevice: (device: ChildDevice) => void;
  onOpenAddChild: () => void;
  onOpenConnectionTest: () => void;
  unreadNoticesCount: number;
}

export const GuardianNavbar: React.FC<GuardianNavbarProps> = ({
  currentTab,
  onTabChange,
  devices,
  selectedDevice,
  onSelectDevice,
  onOpenAddChild,
  onOpenConnectionTest,
  unreadNoticesCount,
}) => {
  // Check if selected device is actually online (heartbeat within last 30 seconds)
  const isActuallyOnline =
    selectedDevice &&
    selectedDevice.isOnline &&
    Date.now() - selectedDevice.lastSeen < 35000;

  const formatLastSeen = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  };

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Left: Child Profile & Selector */}
          {selectedDevice ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-bold flex items-center justify-center text-base shadow-sm">
                  {selectedDevice.childName.charAt(0).toUpperCase()}
                </div>
                {/* Live Online Badge */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    isActuallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                  title={isActuallyOnline ? 'Online - Heartbeat active' : 'Offline'}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  {devices.length > 1 ? (
                    <select
                      value={selectedDevice.deviceId}
                      onChange={(e) => {
                        const found = devices.find((d) => d.deviceId === e.target.value);
                        if (found) onSelectDevice(found);
                      }}
                      className="font-bold text-slate-900 text-sm bg-transparent border-none p-0 cursor-pointer focus:ring-0"
                    >
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.childName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight">
                      {selectedDevice.childName}
                    </h2>
                  )}

                  {/* Online/Offline status pill */}
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      isActuallyOnline
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActuallyOnline ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    {isActuallyOnline ? 'Online' : `Offline (${formatLastSeen(selectedDevice.lastSeen)})`}
                  </span>
                </div>

                {/* Subtitle: Real Battery & Model */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span className="truncate max-w-[120px] sm:max-w-none text-[11px]">
                    {selectedDevice.deviceModel || 'Android Device'}
                  </span>
                  <span>•</span>
                  {selectedDevice.batteryLevel !== null ? (
                    <span className="flex items-center gap-1 font-medium text-slate-700 text-[11px]">
                      {selectedDevice.isCharging ? (
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Battery className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {selectedDevice.batteryLevel}%{selectedDevice.isCharging ? ' ⚡' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">No battery data</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                G
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Guardian</h2>
                <p className="text-xs text-slate-500">No child paired yet</p>
              </div>
            </div>
          )}

          {/* Right Action buttons */}
          <div className="flex items-center gap-2">
            {selectedDevice && (
              <button
                onClick={onOpenConnectionTest}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition-all shadow-xs active:scale-95"
                title="Test real PING/PONG connection between Guardian and Child phone"
              >
                <Zap className="w-3.5 h-3.5 text-purple-600 fill-purple-600" />
                <span className="hidden sm:inline">Test Connection</span>
              </button>
            )}

            <button
              onClick={onOpenAddChild}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 transition-all shadow-sm shadow-purple-300 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Child</span>
            </button>
          </div>
        </div>
      </header>

      {/* Bottom Navigation: NOTICE | DEVICE | ME */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-lg">
        <div className="max-w-md mx-auto px-6 py-2 flex items-center justify-around">
          {/* NOTICE Tab */}
          <button
            onClick={() => onTabChange('NOTICE')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-2xl transition-all relative ${
              currentTab === 'NOTICE'
                ? 'text-purple-700 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadNoticesCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                  {unreadNoticesCount}
                </span>
              )}
            </div>
            <span className="text-[11px] uppercase tracking-wider">NOTICE</span>
          </button>

          {/* DEVICE Tab (Main Dashboard) */}
          <button
            onClick={() => onTabChange('DEVICE')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-2xl transition-all ${
              currentTab === 'DEVICE'
                ? 'text-purple-700 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1.5 rounded-xl ${currentTab === 'DEVICE' ? 'bg-purple-100 text-purple-700' : ''}`}>
              <Smartphone className="w-5 h-5" />
            </div>
            <span className="text-[11px] uppercase tracking-wider">DEVICE</span>
          </button>

          {/* ME Tab */}
          <button
            onClick={() => onTabChange('ME')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-2xl transition-all ${
              currentTab === 'ME'
                ? 'text-purple-700 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[11px] uppercase tracking-wider">ME</span>
          </button>
        </div>
      </nav>
    </>
  );
};
