import React from 'react';
import { Clock, Smartphone, AlertCircle, ShieldAlert } from 'lucide-react';
import { ChildDevice } from '../types';

interface UsageReportCardProps {
  device: ChildDevice;
}

export const UsageReportCard: React.FC<UsageReportCardProps> = ({ device }) => {
  const apps = device.appUsages || [];
  const totalMinutes = device.screenTimeMinutes || 0;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hasUsageData = totalMinutes > 0 || apps.length > 0;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">USAGE REPORT</h3>
            <p className="text-xs text-slate-500">Android UsageStatsManager Data</p>
          </div>
        </div>
        <div className="text-right">
          {hasUsageData ? (
            <>
              <span className="text-xl font-extrabold text-purple-900 font-mono">
                {hours > 0 ? `${hours}h ` : ''}{mins}m
              </span>
              <p className="text-[10px] text-slate-400 font-medium">TODAY'S USAGE</p>
            </>
          ) : (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              No Data Recorded
            </span>
          )}
        </div>
      </div>

      {hasUsageData ? (
        <>
          {/* Most-Used Apps */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
              Recorded Applications
            </h4>
            <div className="space-y-2.5">
              {apps.map((app) => {
                const appMins = app.minutesUsed;
                const appPct = totalMinutes > 0 ? Math.round((appMins / totalMinutes) * 100) : 0;
                return (
                  <div key={app.packageName} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100/80">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-xs font-bold text-purple-700">
                          <Smartphone className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{app.appName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{app.packageName}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700 font-mono">{appMins}m</span>
                        <span className="text-[10px] text-slate-400 block">{appPct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 rounded-full"
                        style={{ width: `${appPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
          <h4 className="text-xs font-bold text-slate-700">Usage Access Permission Required</h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
            Android restricts background app-time tracking unless the user grants <strong>Usage Access</strong> in Android Settings. No mock or estimated statistics are generated.
          </p>
          <div className="text-[10px] text-purple-700 font-mono bg-purple-50 px-2 py-1 rounded-md inline-block">
            Settings &gt; Apps &gt; Special app access &gt; Usage access &gt; Guardian
          </div>
        </div>
      )}

      {/* Android Native API Info */}
      <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100 flex items-start gap-2 text-[11px] text-purple-800">
        <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
        <div>
          Screen time is calculated using Android's system <strong>UsageStatsManager</strong>. Statistics update automatically when foreground app sessions conclude.
        </div>
      </div>
    </div>
  );
};
