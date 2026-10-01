import React, { useState } from 'react';
import { Smartphone, Zap, ArrowLeftRight, ExternalLink, QrCode, X } from 'lucide-react';
import { GuardianDashboard } from './GuardianDashboard';
import { ChildDeviceView } from './ChildDeviceView';
import { ChildDevice } from '../types';

interface DualDeviceRunnerProps {
  guardianUserId: string;
  guardianEmail: string;
  devices: ChildDevice[];
  onOpenAddChild: () => void;
  onOpenConnectionTest: (device: ChildDevice) => void;
}

export const DualDeviceRunner: React.FC<DualDeviceRunnerProps> = ({
  guardianUserId,
  guardianEmail,
  devices,
  onOpenAddChild,
  onOpenConnectionTest,
}) => {
  const [activeChildDeviceId] = useState(() => {
    let id = localStorage.getItem('guardian_test_child_device_id');
    if (!id) {
      id = `child_phone_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('guardian_test_child_device_id', id);
    }
    return id;
  });

  const [showQrModal, setShowQrModal] = useState(false);
  const currentAppUrl = window.location.href;

  return (
    <div className="space-y-4">
      {/* Top Banner explaining the Dual Phone Test Environment */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h3 className="font-bold text-base">TWO-DEVICE LIVE INTERCONNECT RUNNER</h3>
          </div>
          <p className="text-xs text-purple-200 max-w-xl">
            Simulates Phone A (Guardian Parent) and Phone B (Child Phone) running concurrently over the live Firebase Firestore backend. Both communicate via real cloud sync, heartbeats, and commands.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-xs border border-white/20"
          >
            <QrCode className="w-4 h-4" />
            Test on Physical Phone
          </button>
        </div>
      </div>

      {/* Two Phones Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PHONE A: GUARDIAN */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] p-3 shadow-xl border-4 border-slate-800 relative">
            {/* Phone Speaker Notch */}
            <div className="w-28 h-4 bg-slate-800 rounded-b-xl mx-auto mb-2 flex items-center justify-center">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>

            <div className="text-center pb-2 border-b border-slate-100 flex items-center justify-between px-3">
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                PHONE A: GUARDIAN
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Role: Parent</span>
            </div>

            {/* Embedded Guardian Screen */}
            <div className="h-[750px] overflow-y-auto rounded-2xl bg-slate-50/70 p-2">
              <GuardianDashboard
                devices={devices}
                onOpenAddChild={onOpenAddChild}
                onOpenConnectionTest={onOpenConnectionTest}
                embeddedMode
              />
            </div>
          </div>
        </div>

        {/* PHONE B: CHILD */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] p-3 shadow-xl border-4 border-slate-800 relative">
            {/* Phone Speaker Notch */}
            <div className="w-28 h-4 bg-slate-800 rounded-b-xl mx-auto mb-2 flex items-center justify-center">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>

            <div className="text-center pb-2 border-b border-slate-100 flex items-center justify-between px-3">
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                PHONE B: CHILD DEVICE
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Role: Child</span>
            </div>

            {/* Embedded Child Screen */}
            <div className="h-[750px] overflow-y-auto rounded-2xl bg-slate-50/70 p-2">
              <ChildDeviceView
                deviceId={activeChildDeviceId}
                onSwitchRole={() => {}}
              />
            </div>
          </div>
        </div>
      </div>

      {/* QR Code / Mobile Link Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Open on Real Android Phone</h3>
            <p className="text-xs text-slate-500">
              Scan this URL on your second physical phone to test the real camera, microphone, GPS, and flashlight between two separate real devices!
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 break-all text-xs font-mono text-purple-900 select-all">
              {currentAppUrl}
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-purple-700 text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
