import React from 'react';
import {
  User,
  Smartphone,
  PlusCircle,
  KeyRound,
  ShieldCheck,
  Bell,
  Lock,
  Eye,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Code2,
  Trash2,
} from 'lucide-react';
import { ChildDevice } from '../types';
import { unpairChildDevice } from '../services/deviceService';

interface MeTabProps {
  guardianEmail?: string;
  guardianName?: string;
  devices: ChildDevice[];
  onOpenAddChild: () => void;
  onOpenCodeInspector: () => void;
  onLogout: () => void;
  onSwitchRole: () => void;
}

export const MeTab: React.FC<MeTabProps> = ({
  guardianEmail = 'guardian@parent.account',
  guardianName = 'Guardian Parent',
  devices,
  onOpenAddChild,
  onOpenCodeInspector,
  onLogout,
  onSwitchRole,
}) => {
  const handleRemoveDevice = async (deviceId: string, name: string) => {
    if (window.confirm(`Unpair ${name} from your Guardian account?`)) {
      await unpairChildDevice(deviceId);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">
      {/* Guardian Profile Card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-md shadow-purple-200">
            {guardianName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">{guardianName}</h2>
            <p className="text-xs text-slate-500 font-mono">{guardianEmail}</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 font-bold px-2 py-0.5 rounded-full mt-1">
              <ShieldCheck className="w-3 h-3 text-purple-600" />
              Verified Guardian Account
            </span>
          </div>
        </div>
      </div>

      {/* Paired Child Devices List */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-purple-700" />
            <h3 className="font-bold text-slate-900 text-sm">CHILD DEVICES</h3>
          </div>
          <button
            onClick={onOpenAddChild}
            className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900"
          >
            <PlusCircle className="w-4 h-4" />
            Add Child
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No child devices paired yet. Click <strong>+ Add Child</strong> to generate a pairing code.
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div
                key={d.deviceId}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{d.childName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Model: {d.deviceModel || 'Android'} • ID: {d.deviceId.substring(0, 12)}...
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      d.isOnline && Date.now() - d.lastSeen < 35000
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {d.isOnline && Date.now() - d.lastSeen < 35000 ? 'Online' : 'Offline'}
                  </span>
                  <button
                    onClick={() => handleRemoveDevice(d.deviceId, d.childName)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    title="Unpair Device"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Developer & Architecture Tools */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <h3 className="font-bold text-slate-900 text-sm">DEVELOPER & ANDROID STUDIO</h3>

        <div className="space-y-1">
          <button
            onClick={onOpenCodeInspector}
            className="w-full p-3 rounded-2xl hover:bg-purple-50/60 flex items-center justify-between text-left transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 group-hover:text-purple-700">
                  Android Studio Project & ZIP Download
                </div>
                <div className="text-[10px] text-slate-400">
                  Full Kotlin, Jetpack Compose, Manifest & Gradle source tree
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            onClick={onSwitchRole}
            className="w-full p-3 rounded-2xl hover:bg-purple-50/60 flex items-center justify-between text-left transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 group-hover:text-indigo-700">
                  Switch to Child Device Mode
                </div>
                <div className="text-[10px] text-slate-400">
                  Run as Child device or Dual Phone Runner
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Settings Menu Options */}
      <div className="bg-white rounded-3xl p-3 shadow-sm border border-slate-100 divide-y divide-slate-100 text-xs">
        <SettingItem icon={<Lock className="w-4 h-4 text-slate-600" />} label="Security & Cryptographic Pairing" desc="Firestore ABAC Zero-Trust Rules" />
        <SettingItem icon={<Eye className="w-4 h-4 text-slate-600" />} label="Privacy & Transparency" desc="No hidden surveillance mode" />
        <SettingItem icon={<Bell className="w-4 h-4 text-slate-600" />} label="Notifications & FCM" desc="Firebase Cloud Messaging channels" />
        <SettingItem icon={<HelpCircle className="w-4 h-4 text-slate-600" />} label="Help & Documentation" desc="Setup guide for 2 Android phones" />
        <SettingItem icon={<Info className="w-4 h-4 text-slate-600" />} label="About Guardian" desc="Version 1.0.0 (Build 34)" />
      </div>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-98"
      >
        <LogOut className="w-4 h-4" />
        Sign Out Guardian Account
      </button>
    </div>
  );
};

const SettingItem: React.FC<{ icon: React.ReactNode; label: string; desc: string }> = ({
  icon,
  label,
  desc,
}) => (
  <div className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <div className="font-semibold text-slate-800">{label}</div>
        <div className="text-[10px] text-slate-400">{desc}</div>
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300" />
  </div>
);
