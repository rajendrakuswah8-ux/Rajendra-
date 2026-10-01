import React, { useState } from 'react';
import { Hourglass, Moon, Sliders, Calendar } from 'lucide-react';
import { ChildDevice } from '../types';

interface ScreenTimeCardProps {
  device: ChildDevice;
}

export const ScreenTimeCard: React.FC<ScreenTimeCardProps> = ({ device }) => {
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState(150); // 2h 30m
  const [bedtimeStart, setBedtimeStart] = useState('21:00');
  const [bedtimeEnd, setBedtimeEnd] = useState('07:00');
  const [downtimeActive, setDowntimeActive] = useState(false);

  const formatHoursMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m > 0 ? `${m}m` : ''}`;
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Hourglass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">SCREEN TIME & SCHEDULES</h3>
            <p className="text-xs text-slate-500">Daily Limits & Downtime Schedules</p>
          </div>
        </div>
      </div>

      {/* Daily limit slider */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Sliders className="w-3.5 h-3.5 text-purple-600" />
            Daily Allowance
          </div>
          <span className="text-sm font-bold text-purple-900 font-mono">
            {formatHoursMins(dailyLimitMinutes)}
          </span>
        </div>
        <input
          type="range"
          min="30"
          max="360"
          step="15"
          value={dailyLimitMinutes}
          onChange={(e) => setDailyLimitMinutes(Number(e.target.value))}
          className="w-full accent-purple-700 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>30 mins</span>
          <span>3 hours</span>
          <span>6 hours</span>
        </div>
      </div>

      {/* Bedtime & Downtime Schedule */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Moon className="w-4 h-4 text-indigo-600" />
            Bedtime Mode
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="time"
              value={bedtimeStart}
              onChange={(e) => setBedtimeStart(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
            />
            <span>to</span>
            <input
              type="time"
              value={bedtimeEnd}
              onChange={(e) => setBedtimeEnd(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
            />
          </div>
          <p className="text-[10px] text-slate-400">Device locks automatically during sleep hours</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Calendar className="w-4 h-4 text-purple-600" />
              Instant Downtime
            </div>
            <button
              onClick={() => setDowntimeActive(!downtimeActive)}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                downtimeActive ? 'bg-purple-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  downtimeActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            {downtimeActive
              ? 'Downtime ACTIVE - Non-essential child device apps currently paused.'
              : 'Pause all non-essential applications immediately.'}
          </p>
        </div>
      </div>
    </div>
  );
};
