import React, { useState } from 'react';
import { Shield, Check, Ban, AlertTriangle, Info } from 'lucide-react';
import { ChildDevice } from '../types';

interface AppManagementCardProps {
  device: ChildDevice;
}

export const AppManagementCard: React.FC<AppManagementCardProps> = ({ device }) => {
  const [appStates, setAppStates] = useState<Record<string, 'allowed' | 'blocked' | 'restricted'>>({
    'com.google.android.youtube': 'allowed',
    'com.google.android.apps.messaging': 'allowed',
    'com.duolingo': 'allowed',
    'com.zhiliaoapp.musically': 'restricted',
    'com.roblox.client': 'restricted',
  });

  const appCatalog = [
    { name: 'YouTube Kids', pkg: 'com.google.android.youtube', cat: 'Entertainment' },
    { name: 'Messages & SMS', pkg: 'com.google.android.apps.messaging', cat: 'Communication' },
    { name: 'Duolingo Language', pkg: 'com.duolingo', cat: 'Education' },
    { name: 'TikTok', pkg: 'com.zhiliaoapp.musically', cat: 'Social Media' },
    { name: 'Roblox', pkg: 'com.roblox.client', cat: 'Games' },
  ];

  const handleSetStatus = (pkg: string, status: 'allowed' | 'blocked' | 'restricted') => {
    setAppStates((prev) => ({ ...prev, [pkg]: status }));
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">APP MANAGEMENT</h3>
            <p className="text-xs text-slate-500">Access Policies & Content Filtering</p>
          </div>
        </div>
        <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
          {Object.values(appStates).filter((s) => s === 'blocked').length} Blocked
        </span>
      </div>

      <div className="space-y-2.5">
        {appCatalog.map((app) => {
          const current = appStates[app.pkg] || 'allowed';
          return (
            <div
              key={app.pkg}
              className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-xs font-semibold text-slate-900">{app.name}</div>
                <div className="text-[10px] text-slate-400 font-mono">{app.pkg}</div>
              </div>

              {/* Status toggles */}
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-xs">
                <button
                  onClick={() => handleSetStatus(app.pkg, 'allowed')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                    current === 'allowed'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Check className="w-3 h-3" />
                  Allow
                </button>
                <button
                  onClick={() => handleSetStatus(app.pkg, 'restricted')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                    current === 'restricted'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Limit
                </button>
                <button
                  onClick={() => handleSetStatus(app.pkg, 'blocked')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                    current === 'blocked'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Ban className="w-3 h-3" />
                  Block
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Android DevicePolicyManager explanation note */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-600 text-[11px] space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Info className="w-3.5 h-3.5 text-purple-700" />
          Android Supported Enforcement Mechanisms
        </div>
        <p>
          Standard non-root Android apps cannot force-stop or hide arbitrary third-party apps without system privilege. Guardian enforces application limits via Android's official <strong>DevicePolicyManager</strong> (Device Admin / Device Owner profile) and <strong>AccessibilityService overlay blocking</strong>.
        </p>
      </div>
    </div>
  );
};
