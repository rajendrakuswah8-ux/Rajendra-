/**
 * Guardian - Full-Featured Android Parental Control Application
 * Package: com.guardian.parentalcontrol
 */

import React, { useState, useEffect } from 'react';
import {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  User,
  firebaseSignOut,
} from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  subscribeToGuardianDevices,
  subscribeToDeviceEvents,
  getOrCreateLocalGuardianId,
} from './services/deviceService';
import { ChildDevice, DeviceEvent, DeviceRole, GuardianTab } from './types';
import { GuardianNavbar } from './components/GuardianNavbar';
import { GuardianDashboard } from './components/GuardianDashboard';
import { NoticeTab } from './components/NoticeTab';
import { MeTab } from './components/MeTab';
import { ChildDeviceView } from './components/ChildDeviceView';
import { PairingModal } from './components/PairingModal';
import { ConnectionTestModal } from './components/ConnectionTestModal';
import { AndroidProjectExplorer } from './components/AndroidProjectExplorer';
import { DualDeviceRunner } from './components/DualDeviceRunner';
import { QuotaNoticeBanner } from './components/QuotaNoticeBanner';
import {
  Smartphone,
  Shield,
  Layers,
  Code2,
  Loader2,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Mode / Role
  const [activeRole, setActiveRole] = useState<'GUARDIAN' | 'CHILD' | 'DUAL_RUNNER'>('GUARDIAN');
  const [guardianTab, setGuardianTab] = useState<GuardianTab>('DEVICE');

  // Firestore Live Data
  const [devices, setDevices] = useState<ChildDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<ChildDevice | null>(null);
  const [events, setEvents] = useState<DeviceEvent[]>([]);

  // Persistent Child Device ID for this client/browser
  const [localChildDeviceId] = useState(() => {
    let id = localStorage.getItem('guardian_local_child_device_id');
    if (!id) {
      id = `child_phone_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('guardian_local_child_device_id', id);
    }
    return id;
  });

  // Modals
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isConnectionTestOpen, setIsConnectionTestOpen] = useState(false);
  const [testTargetDevice, setTestTargetDevice] = useState<ChildDevice | null>(null);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);

  // Initialize Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          setUser(cred.user);
        } catch {
          // Fallback to persistent Guardian session
          const localId = getOrCreateLocalGuardianId();
          setUser({
            uid: localId,
            email: 'guardian@parent.account',
            displayName: 'Guardian Parent',
          } as unknown as User);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => unsub();
  }, []);

  // Subscribe to Guardian devices & events when authenticated
  useEffect(() => {
    if (!user) return;

    const unsubDevices = subscribeToGuardianDevices(user.uid, (devs) => {
      setDevices(devs);
      setSelectedDevice((prev) => {
        if (!prev && devs.length > 0) return devs[0];
        if (prev) {
          const updated = devs.find((d) => d.deviceId === prev.deviceId);
          return updated || devs[0] || null;
        }
        return null;
      });
    });

    const unsubEvents = subscribeToDeviceEvents(user.uid, (evts) => {
      setEvents(evts);
    });

    return () => {
      unsubDevices();
      unsubEvents();
    };
  }, [user]);

  const handleOpenTest = (device?: ChildDevice) => {
    setTestTargetDevice(device || selectedDevice);
    setIsConnectionTestOpen(true);
  };

  const handleChildPaired = async (childDeviceId: string) => {
    setIsPairingOpen(false);
    try {
      const snap = await getDoc(doc(db, 'childDevices', childDeviceId));
      if (snap.exists()) {
        const pairedDev = snap.data() as ChildDevice;
        setDevices((prev) => {
          const filtered = prev.filter((d) => d.deviceId !== childDeviceId);
          return [pairedDev, ...filtered];
        });
        setSelectedDevice(pairedDev);
      }
    } catch (e) {
      console.warn('Error fetching newly paired child device:', e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-3xl bg-purple-700 text-white flex items-center justify-center shadow-lg shadow-purple-300 animate-pulse mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-base font-bold text-slate-800">GUARDIAN</h2>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
          Connecting to Firebase cloud backend...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBFE] text-slate-900 font-sans selection:bg-purple-200">
      {/* Cloud Quota Notice Banner */}
      <QuotaNoticeBanner />

      {/* Top Application Switcher Bar */}
      <div className="bg-slate-900 text-white text-xs px-3 py-2 border-b border-slate-800 sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-purple-600 flex items-center justify-center font-bold text-[10px]">
            G
          </div>
          <span className="font-extrabold tracking-wide text-purple-200">GUARDIAN</span>
          <span className="text-slate-500">•</span>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            com.guardian.parentalcontrol
          </span>
        </div>

        {/* Role & Mode Switcher Buttons */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/60">
          <button
            onClick={() => setActiveRole('GUARDIAN')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              activeRole === 'GUARDIAN'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Guardian Phone
          </button>

          <button
            onClick={() => setActiveRole('CHILD')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              activeRole === 'CHILD'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Child Phone
          </button>

          <button
            onClick={() => setActiveRole('DUAL_RUNNER')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              activeRole === 'DUAL_RUNNER'
                ? 'bg-purple-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Dual Phone Runner
          </button>
        </div>

        {/* Android Studio Project Explorer button */}
        <button
          onClick={() => setIsExplorerOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/40 text-[11px] font-semibold transition-all"
        >
          <Code2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Android Studio Code & ZIP</span>
        </button>
      </div>

      {/* Main View Router */}
      {activeRole === 'GUARDIAN' && (
        <>
          <GuardianNavbar
            currentTab={guardianTab}
            onTabChange={setGuardianTab}
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            onOpenAddChild={() => setIsPairingOpen(true)}
            onOpenConnectionTest={() => handleOpenTest()}
            unreadNoticesCount={events.length}
          />

          <main>
            {guardianTab === 'DEVICE' && (
              <GuardianDashboard
                devices={devices}
                onOpenAddChild={() => setIsPairingOpen(true)}
                onOpenConnectionTest={handleOpenTest}
              />
            )}

            {guardianTab === 'NOTICE' && (
              <NoticeTab events={events} childName={selectedDevice?.childName} />
            )}

            {guardianTab === 'ME' && (
              <MeTab
                guardianEmail={user?.email || 'guardian@parent.account'}
                guardianName={user?.displayName || 'Guardian Parent'}
                devices={devices}
                onOpenAddChild={() => setIsPairingOpen(true)}
                onOpenCodeInspector={() => setIsExplorerOpen(true)}
                onLogout={() => firebaseSignOut(auth)}
                onSwitchRole={() => setActiveRole('CHILD')}
              />
            )}
          </main>
        </>
      )}

      {activeRole === 'CHILD' && (
        <ChildDeviceView
          deviceId={localChildDeviceId}
          onSwitchRole={() => setActiveRole('GUARDIAN')}
        />
      )}

      {activeRole === 'DUAL_RUNNER' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <DualDeviceRunner
            guardianUserId={user?.uid || ''}
            guardianEmail={user?.email || ''}
            devices={devices}
            onOpenAddChild={() => setIsPairingOpen(true)}
            onOpenConnectionTest={handleOpenTest}
          />
        </div>
      )}

      {/* Ephemeral 6-digit Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        onChildPaired={handleChildPaired}
        guardianName={user?.displayName || 'Guardian Parent'}
        guardianUserId={user?.uid}
      />

      {/* Mandatory PING/PONG Connection Test Modal */}
      {testTargetDevice && (
        <ConnectionTestModal
          isOpen={isConnectionTestOpen}
          onClose={() => setIsConnectionTestOpen(false)}
          device={testTargetDevice}
        />
      )}

      {/* Native Android Studio Project Inspector & ZIP Exporter */}
      <AndroidProjectExplorer
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
      />
    </div>
  );
}
