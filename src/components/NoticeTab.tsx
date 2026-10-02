import React from 'react';
import { Bell, ShieldAlert, BatteryLow, WifiOff, CheckCircle2, KeyRound, AlertTriangle } from 'lucide-react';
import { DeviceEvent } from '../types';

interface NoticeTabProps {
  events: DeviceEvent[];
  childName?: string;
}

export const NoticeTab: React.FC<NoticeTabProps> = ({ events, childName = 'Child Device' }) => {
  const getEventIcon = (type: DeviceEvent['type']) => {
    switch (type) {
      case 'OFFLINE':
      case 'PERMISSION_REVOKED':
        return <WifiOff className="w-5 h-5 text-rose-500" />;
      case 'LOW_BATTERY':
        return <BatteryLow className="w-5 h-5 text-amber-500" />;
      case 'LOCATION_UNAVAILABLE':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'ONLINE':
      case 'PING_PONG':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'PAIRING':
        return <KeyRound className="w-5 h-5 text-purple-600" />;
      default:
        return <Bell className="w-5 h-5 text-purple-600" />;
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">NOTICES & ALERTS</h2>
          <p className="text-xs text-slate-500">Live security and connection event logs</p>
        </div>
        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
          {events.length} Logged
        </span>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm space-y-3">
          <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto">
            <Bell className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">No Unread Notices</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Real notifications for child offline/online events, low battery alerts, and hardware permission changes will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((evt) => (
            <div
              key={evt.eventId}
              className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-start gap-3.5 hover:border-purple-200 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 mt-0.5 border border-slate-100">
                {getEventIcon(evt.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{evt.title}</h4>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{evt.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
