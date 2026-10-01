import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Camera,
  Mic,
  MapPin,
  Bell,
  Monitor,
  Battery,
  BatteryCharging,
  Wifi,
  Radio,
  ArrowRight,
  Loader2,
  RefreshCw,
  LogOut,
  Sliders,
  Settings,
  X,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  pairChildDeviceWithCode,
  sendChildHeartbeat,
  subscribeToChildCommands,
  subscribeToChildDevice,
  getOrCreateChildAuth,
  syncChildTelemetry,
  unpairChildDevice,
} from '../services/deviceService';
import {
  checkSystemPermissions,
  getRealBatteryStatus,
  getRealLocation,
  getRealNetworkStatus,
  startRealCamera,
  stopRealCamera,
  startRealAudio,
  stopRealAudio,
  startRealScreenCapture,
  stopRealScreenCapture,
} from '../services/hardware';
import { ChildDevice, AppPermissionState, DeviceCommand, DeviceLocation } from '../types';

interface ChildDeviceViewProps {
  onSwitchRole: () => void;
  deviceId: string;
}

export const ChildDeviceView: React.FC<ChildDeviceViewProps> = ({ onSwitchRole, deviceId }) => {
  // State
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [childNameInput, setChildNameInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const [device, setDevice] = useState<ChildDevice | null>(null);
  const [permissions, setPermissions] = useState<AppPermissionState>({
    camera: 'prompt',
    microphone: 'prompt',
    location: 'prompt',
    notifications: 'prompt',
    screenCapture: 'prompt',
  });
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [networkStatus, setNetworkStatus] = useState<string>('WIFI');
  const [recentCommand, setRecentCommand] = useState<DeviceCommand | null>(null);
  const [requestingPerm, setRequestingPerm] = useState<string | null>(null);
  const [childAuthUid, setChildAuthUid] = useState<string>('');
  const [settingsGuideTarget, setSettingsGuideTarget] = useState<string | null>(null);
  const [isGrantingAll, setIsGrantingAll] = useState(false);

  // Authenticate as independent Child Identity on boot
  useEffect(() => {
    let isMounted = true;
    getOrCreateChildAuth(deviceId).then((uid) => {
      if (isMounted) setChildAuthUid(uid);
    });
    return () => {
      isMounted = false;
    };
  }, [deviceId]);

  // Subscribe to Child Device document in Firestore
  useEffect(() => {
    const unsub = subscribeToChildDevice(deviceId, (dev) => {
      setDevice(dev);
      if (dev?.permissions) {
        setPermissions(dev.permissions);
      }
    });
    return () => unsub();
  }, [deviceId]);

  // Hardware Status refresh - checks real Android status without triggering popups
  const refreshHardware = async () => {
    const [perms, batt] = await Promise.all([
      checkSystemPermissions(),
      getRealBatteryStatus(),
    ]);

    setPermissions(perms);
    setBatteryLevel(batt.level);
    setIsCharging(batt.charging);
    const net = getRealNetworkStatus();
    setNetworkStatus(net);

    // Sync to Firestore if device is enrolled
    if (device) {
      await syncChildTelemetry(deviceId, {
        permissions: perms,
        batteryLevel: batt.level,
        isCharging: batt.charging,
        networkStatus: net,
      });
    }
  };

  useEffect(() => {
    refreshHardware();

    // Listen for network connectivity changes
    const handleNetChange = () => {
      refreshHardware();
    };
    window.addEventListener('online', handleNetChange);
    window.addEventListener('offline', handleNetChange);

    // Safety: ensure hardware streams, torch and camera resources are released when closing
    const handleUnload = () => {
      stopRealCamera();
      stopRealAudio();
      stopRealScreenCapture();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('online', handleNetChange);
      window.removeEventListener('offline', handleNetChange);
      window.removeEventListener('beforeunload', handleUnload);
      stopRealCamera();
      stopRealAudio();
      stopRealScreenCapture();
    };
  }, [deviceId]);

  // Heartbeat loop when paired
  useEffect(() => {
    if (!device) return;

    // Send immediately
    sendChildHeartbeat(deviceId);

    // Interval every 30 seconds (reduces unnecessary write units)
    const interval = setInterval(() => {
      sendChildHeartbeat(deviceId);
    }, 30000);

    return () => clearInterval(interval);
  }, [device?.deviceId, deviceId]);

  // Subscribe to incoming commands from Guardian (only re-subscribe if deviceId changes)
  useEffect(() => {
    if (!deviceId) return;

    const unsub = subscribeToChildCommands(deviceId, (cmd) => {
      setRecentCommand(cmd);
      // Auto-clear notification after 4 seconds
      setTimeout(() => setRecentCommand(null), 4000);
    });

    return () => unsub();
  }, [deviceId]);

  // Handle Pairing code submission
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairError(null);
    setIsPairing(true);

    try {
      let uid = childAuthUid;
      if (!uid) {
        uid = await getOrCreateChildAuth(deviceId);
        setChildAuthUid(uid);
      }

      if (!uid) {
        throw new Error('Child authentication failed. Cannot pair device.');
      }

      await pairChildDeviceWithCode(
        pairingCodeInput,
        deviceId,
        uid,
        childNameInput || 'Alex (Galaxy S24)',
        navigator.userAgent.slice(0, 30)
      );
      await refreshHardware();
    } catch (err: unknown) {
      setPairError(err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      setIsPairing(false);
    }
  };

  // Permission Request Handlers
  const [deniedNotice, setDeniedNotice] = useState<string | null>(null);

  const handleRequestPermission = async (type: keyof AppPermissionState) => {
    setDeniedNotice(null);

    // Rule 1: If already granted, do NOT prompt or run requestPermission() again
    if (permissions[type] === 'granted') {
      return;
    }

    // Rule 2: If revoked / denied in Android settings, open clear Settings guide modal
    if (permissions[type] === 'denied') {
      const label =
        type === 'camera'
          ? 'Camera'
          : type === 'microphone'
          ? 'Microphone'
          : type === 'location'
          ? 'Location'
          : type === 'notifications'
          ? 'Notifications'
          : 'Screen Capture';
      setSettingsGuideTarget(label);
      return;
    }

    setRequestingPerm(type);
    try {
      let updatedLocation: DeviceLocation | undefined = undefined;

      if (type === 'camera') {
        const stream = await startRealCamera('user');
        stopRealCamera();
      } else if (type === 'microphone') {
        const stream = await startRealAudio();
        stopRealAudio();
      } else if (type === 'location') {
        updatedLocation = await getRealLocation();
      } else if (type === 'notifications') {
        if ('Notification' in window) {
          await Notification.requestPermission();
        }
      } else if (type === 'screenCapture') {
        const stream = await startRealScreenCapture();
        stopRealScreenCapture();
      }

      // Check current real permissions right now
      const latestPerms = await checkSystemPermissions();
      setPermissions(latestPerms);

      // Sync immediately to Firestore so Guardian gets real-time update
      await syncChildTelemetry(deviceId, {
        permissions: latestPerms,
        location: updatedLocation,
      });

      await refreshHardware();
    } catch (err) {
      console.warn(`Permission request for ${type} failed or denied:`, err);
      const latestPerms = await checkSystemPermissions();
      setPermissions(latestPerms);
      await syncChildTelemetry(deviceId, { permissions: latestPerms });
    } finally {
      setRequestingPerm(null);
    }
  };

  // Batch clear consent handler for first-time permissions setup
  const handleGrantAllMissingConsent = async () => {
    setIsGrantingAll(true);
    setDeniedNotice(null);
    try {
      // 1. Camera
      if (permissions.camera !== 'granted' && permissions.camera !== 'denied') {
        try {
          const s = await startRealCamera('user');
          stopRealCamera();
        } catch {
          // ignore
        }
      }
      // 2. Microphone
      if (permissions.microphone !== 'granted' && permissions.microphone !== 'denied') {
        try {
          const s = await startRealAudio();
          stopRealAudio();
        } catch {
          // ignore
        }
      }
      // 3. Location
      if (permissions.location !== 'granted' && permissions.location !== 'denied') {
        try {
          await getRealLocation();
        } catch {
          // ignore
        }
      }
      // 4. Notifications
      if (permissions.notifications !== 'granted' && permissions.notifications !== 'denied') {
        if ('Notification' in window) {
          try {
            await Notification.requestPermission();
          } catch {
            // ignore
          }
        }
      }

      const latest = await checkSystemPermissions();
      setPermissions(latest);
      if (device) {
        await syncChildTelemetry(deviceId, { permissions: latest });
      }
      await refreshHardware();
    } finally {
      setIsGrantingAll(false);
    }
  };

  const hasMissingKeyPermissions =
    permissions.camera !== 'granted' ||
    permissions.microphone !== 'granted' ||
    permissions.location !== 'granted';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Banner */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold shadow-xs">
              G
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight">Guardian</h1>
              <span className="text-[11px] text-purple-700 font-medium">Child Device Client</span>
            </div>
          </div>
          <button
            onClick={onSwitchRole}
            className="text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-all"
          >
            Switch Role
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* If NOT paired yet: Show Pairing Code Input Screen */}
        {!device ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto shadow-xs">
                <Smartphone className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">CONNECT TO GUARDIAN</h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Enter the 6-digit code displayed on the Guardian Parent phone to link this device.
              </p>
            </div>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Child Device Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex's Phone"
                  value={childNameInput}
                  onChange={(e) => setChildNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  6-Digit Pairing Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="482731"
                  value={pairingCodeInput}
                  onChange={(e) => setPairingCodeInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 text-center text-2xl font-mono tracking-[0.4em] font-extrabold text-purple-900 focus:outline-none focus:border-purple-600 bg-purple-50/30"
                  required
                />
              </div>

              {pairError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{pairError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isPairing || pairingCodeInput.length !== 6}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-purple-700 hover:bg-purple-800 active:scale-98 text-white shadow-md shadow-purple-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPairing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying Code with Backend...
                  </>
                ) : (
                  <>
                    CONNECT
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* PAIRED SCREEN */
          <div className="space-y-4">
            {/* Enrollment & Protection Status Banner */}
            <div className="bg-gradient-to-br from-purple-700 to-indigo-800 rounded-3xl p-5 text-white shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Connected to Guardian
                </span>
                <span className="text-[11px] text-purple-200 font-mono">30s Heartbeat Active</span>
              </div>

              <div>
                <h2 className="text-xl font-extrabold">{device.childName}</h2>
                <p className="text-xs text-purple-200">
                  Enrolled under Guardian Account: <strong>{device.guardianId.substring(0, 10)}...</strong>
                </p>
              </div>

              <div className="pt-2 border-t border-purple-500/40 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-purple-100">
                  {batteryLevel !== null ? (
                    <>
                      {isCharging ? <BatteryCharging className="w-4 h-4 text-emerald-300" /> : <Battery className="w-4 h-4" />}
                      <span>{batteryLevel}% {isCharging ? '(Charging)' : ''}</span>
                    </>
                  ) : (
                    <span>No battery data</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-purple-100">
                  <Wifi className="w-4 h-4 text-purple-300" />
                  <span>Network: {networkStatus}</span>
                </div>
              </div>
            </div>

            {/* Real-time Hardware Activity Transparency Banner */}
            {(device.cameraStreaming || device.audioStreaming || device.screenStreaming || device.flashlightState === 'ON') && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300 text-amber-900 text-xs space-y-1.5 shadow-sm">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  ACTIVE HARDWARE SERVICE
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {device.cameraStreaming && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-200 text-purple-800 font-semibold">
                      📷 Camera Streaming ({device.activeCameraFacing === 'environment' ? 'Rear' : 'Front'})
                    </span>
                  )}
                  {device.audioStreaming && (
                    <span className="px-2 py-0.5 rounded-md bg-violet-200 text-violet-800 font-semibold">
                      🎤 Audio Listening Active
                    </span>
                  )}
                  {device.screenStreaming && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-200 text-indigo-800 font-semibold">
                      📱 Screen Mirroring
                    </span>
                  )}
                  {device.flashlightState === 'ON' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-800 font-semibold">
                      🔦 Flashlight Active
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Recent Command Toast */}
            {recentCommand && (
              <div className="p-3 rounded-2xl bg-purple-900 text-white text-xs flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    Received command: <strong>{recentCommand.type}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-purple-300 font-mono">Executed</span>
              </div>
            )}
          </div>
        )}

        {/* INITIAL PERMISSIONS & EXPLICIT CONSENT CARD (Shown when permissions missing) */}
        {hasMissingKeyPermissions && (
          <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white rounded-3xl p-5 shadow-md space-y-3 border border-purple-500/30">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600/80 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-purple-200" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Initial Permissions & Clear Consent</h3>
                <p className="text-[11px] text-purple-200">Required once for Guardian protection features</p>
              </div>
            </div>

            <p className="text-xs text-purple-100/90 leading-relaxed">
              To protect this device and allow Guardian monitoring, Camera, Microphone, and Location permissions must be granted once. After granting, Android securely remembers your choice and will <strong>never prompt again</strong> on feature usage.
            </p>

            <button
              onClick={handleGrantAllMissingConsent}
              disabled={isGrantingAll}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-white text-purple-950 hover:bg-purple-50 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isGrantingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-700" />
                  Requesting Clear Permissions...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-purple-700" />
                  Grant Missing Permissions with Consent
                </>
              )}
            </button>
          </div>
        )}

        {/* DEDICATED PERMISSIONS STATUS SECTION (Formatted as requested: ✅ Allowed / ❌ Not Allowed) */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-700" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">PERMISSIONS STATUS</h3>
                <p className="text-[11px] text-slate-500">Android System & Runtime Authorizations</p>
              </div>
            </div>
            <button
              onClick={refreshHardware}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-all flex items-center gap-1 border border-slate-200"
              title="Re-verify actual Android permissions"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Verify</span>
            </button>
          </div>

          {/* List of Permissions with exact ✅ / ❌ status */}
          <div className="space-y-3">
            <PermissionStatusItem
              name="Camera"
              status={permissions.camera}
              icon={<Camera className="w-4 h-4" />}
              description="Required for remote child safety video stream (Front & Rear)"
              onRequest={() => handleRequestPermission('camera')}
              onOpenSettings={() => setSettingsGuideTarget('Camera')}
              isLoading={requestingPerm === 'camera'}
            />
            <PermissionStatusItem
              name="Microphone"
              status={permissions.microphone}
              icon={<Mic className="w-4 h-4" />}
              description="Required for one-way emergency audio listening stream"
              onRequest={() => handleRequestPermission('microphone')}
              onOpenSettings={() => setSettingsGuideTarget('Microphone')}
              isLoading={requestingPerm === 'microphone'}
            />
            <PermissionStatusItem
              name="Location"
              status={permissions.location}
              icon={<MapPin className="w-4 h-4" />}
              description="Required for real-time GPS location tracking and geofencing"
              onRequest={() => handleRequestPermission('location')}
              onOpenSettings={() => setSettingsGuideTarget('Location')}
              isLoading={requestingPerm === 'location'}
            />
            <PermissionStatusItem
              name="Notifications"
              status={permissions.notifications}
              icon={<Bell className="w-4 h-4" />}
              description="Required for receiving Guardian notices & safety alerts"
              onRequest={() => handleRequestPermission('notifications')}
              onOpenSettings={() => setSettingsGuideTarget('Notifications')}
              isLoading={requestingPerm === 'notifications'}
            />
            <PermissionStatusItem
              name="Screen Capture"
              status={permissions.screenCapture}
              icon={<Monitor className="w-4 h-4" />}
              description="Android MediaProjection consent for remote screen assistance"
              onRequest={() => handleRequestPermission('screenCapture')}
              onOpenSettings={() => setSettingsGuideTarget('Screen Capture')}
              isLoading={requestingPerm === 'screenCapture'}
            />
          </div>
        </div>

        {/* Android Compliance Notice */}
        <div className="p-4 rounded-2xl bg-slate-100 text-slate-600 text-[11px] space-y-1">
          <p className="font-bold text-slate-800">No Hidden Surveillance Mode</p>
          <p>
            In compliance with Android platform standards, this application prominently displays its connection status, active permissions, and running foreground service without bypassing OS security.
          </p>
        </div>

        {/* Unpair Button for Testing / Device Reset (when paired) */}
        {device && (
          <div className="pt-2 text-center">
            <button
              onClick={async () => {
                await unpairChildDevice(deviceId);
                setDevice(null);
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all border border-rose-200/60"
            >
              Unpair &amp; Reset Pairing Code
            </button>
          </div>
        )}
      </main>

      {/* ANDROID SYSTEM SETTINGS GUIDANCE MODAL */}
      {settingsGuideTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Settings className="w-5 h-5 text-purple-700" />
                <span>Android Settings Guide: {settingsGuideTarget}</span>
              </div>
              <button
                onClick={() => setSettingsGuideTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                Android requires permanently blocked permissions to be re-enabled through device settings:
              </p>

              <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 font-medium">
                <li>Open your phone's <strong>Settings</strong> app.</li>
                <li>Tap <strong>Apps & notifications</strong> (or App Manager).</li>
                <li>Find and select <strong>Guardian</strong> (or this browser).</li>
                <li>Tap <strong>Permissions</strong>.</li>
                <li>Tap <strong>{settingsGuideTarget}</strong> and set to <strong>"Allow while using app"</strong>.</li>
                <li>Return here and tap <strong>Re-check Permissions</strong> below.</li>
              </ol>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={async () => {
                  await refreshHardware();
                  setSettingsGuideTarget(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-check Permissions Now
              </button>
              <button
                onClick={() => setSettingsGuideTarget(null)}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PermissionStatusItemProps {
  name: string;
  status: 'granted' | 'denied' | 'prompt' | 'unsupported';
  icon: React.ReactNode;
  description: string;
  onRequest: () => void;
  onOpenSettings: () => void;
  isLoading: boolean;
}

const PermissionStatusItem: React.FC<PermissionStatusItemProps> = ({
  name,
  status,
  icon,
  description,
  onRequest,
  onOpenSettings,
  isLoading,
}) => {
  const isAllowed = status === 'granted';
  const isDenied = status === 'denied';

  return (
    <div
      className={`p-3.5 rounded-2xl border transition-all ${
        isAllowed
          ? 'bg-emerald-50/40 border-emerald-200/80'
          : isDenied
          ? 'bg-rose-50/40 border-rose-200/80'
          : 'bg-slate-50 border-slate-200/80'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-xs border ${
              isAllowed
                ? 'bg-emerald-600 text-white border-emerald-600'
                : isDenied
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            {icon}
          </div>
          <div>
            {/* Title formatted as explicitly requested: ✅ Name: Allowed OR ❌ Name: Required */}
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>{isAllowed ? '✅' : '❌'}</span>
              <span>{name}:</span>
              <span
                className={
                  isAllowed
                    ? 'text-emerald-700'
                    : isDenied
                    ? 'text-rose-700'
                    : 'text-amber-800'
                }
              >
                {isAllowed ? 'Allowed' : isDenied ? 'Required (Blocked in Settings)' : 'Required'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Action Button / Active State */}
        <div className="shrink-0 mt-0.5">
          {isAllowed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white border border-emerald-300 px-2.5 py-1 rounded-lg shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Allowed
            </span>
          ) : isDenied ? (
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-white hover:bg-rose-100 border border-rose-300 px-3 py-1.5 rounded-xl shadow-2xs active:scale-95 transition-all"
            >
              <Settings className="w-3.5 h-3.5 text-rose-600" />
              Settings
            </button>
          ) : status !== 'unsupported' ? (
            <button
              onClick={onRequest}
              disabled={isLoading}
              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 active:scale-95 px-3 py-1.5 rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Asking...
                </>
              ) : (
                'Allow'
              )}
            </button>
          ) : (
            <span className="text-[10px] text-slate-400">Unsupported</span>
          )}
        </div>
      </div>
    </div>
  );
};
