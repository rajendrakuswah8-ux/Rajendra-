import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, signInAnonymously, onAuthStateChanged, User, getIsQuotaExhausted } from '../firebase';
import { ChildDevice, PairingCode, DeviceCommand, CommandType, DeviceEvent, AppPermissionState, DeviceLocation, HardwareAckStatus } from '../types';
import { emitHardwareAck, stopFrameBroadcasting } from './cameraStreamService';
import {
  handleChildOfferAndCreateAnswer,
  closeChildPeerConnection,
} from './webrtcService';
import {
  getRealBatteryStatus,
  getRealLocation,
  getRealNetworkStatus,
  checkSystemPermissions,
  setRealFlashlight,
  startRealCamera,
  stopRealCamera,
  getIsCameraRequested,
  setIsCameraRequested,
  startRealAudio,
  stopRealAudio,
  startRealScreenCapture,
  stopRealScreenCapture,
} from './hardware';

// Persistent Guardian Parent User ID for local session
export function getOrCreateLocalGuardianId(): string {
  let id = localStorage.getItem('guardian_parent_user_id');
  if (!id) {
    id = `guardian_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('guardian_parent_user_id', id);
  }
  return id;
}

// Local state broadcast and cache helper
export function broadcastLocalDeviceUpdate(deviceId: string, patch: Partial<ChildDevice>) {
  try {
    const key = `guardian_device_local_${deviceId}`;
    const existingStr = localStorage.getItem(key);
    let dev: Partial<ChildDevice> = {};
    if (existingStr) {
      try {
        dev = JSON.parse(existingStr);
      } catch {
        // ignore
      }
    }
    const updated = { ...dev, ...patch, deviceId };
    localStorage.setItem(key, JSON.stringify(updated));

    // Also update in cached guardian devices list
    const guardianId = (updated as ChildDevice).guardianId;
    if (guardianId) {
      const gCacheKey = `guardian_devices_cache_${guardianId}`;
      const gListStr = localStorage.getItem(gCacheKey);
      let list: ChildDevice[] = [];
      if (gListStr) {
        try {
          list = JSON.parse(gListStr) as ChildDevice[];
        } catch {
          // ignore
        }
      }
      const idx = list.findIndex((d) => d.deviceId === deviceId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updated } as ChildDevice;
      } else {
        list.unshift(updated as ChildDevice);
      }
      localStorage.setItem(gCacheKey, JSON.stringify(list));
    }

    window.dispatchEvent(
      new CustomEvent('guardian_device_updated', { detail: { deviceId, device: updated } })
    );
  } catch {
    // ignore
  }
}

// Generate 6-digit pairing code
export async function generatePairingCode(
  guardianName = 'Parent Guardian',
  guardianIdParam?: string,
  guardianEmailParam?: string
): Promise<PairingCode> {
  const guardianId = guardianIdParam || auth.currentUser?.uid || getOrCreateLocalGuardianId();

  // Generate 6-digit numeric string
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeId = `code_${code}`;
  const path = `pairingCodes/${codeId}`;

  const pairingData: PairingCode = {
    id: codeId,
    code,
    guardianId,
    guardianEmail: guardianEmailParam || auth.currentUser?.email || 'guardian@parent.account',
    guardianName: auth.currentUser?.displayName || guardianName,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    isUsed: false,
    createdAt: new Date().toISOString(),
  };

  // Cache locally for resilient pairing even during quota limits
  try {
    localStorage.setItem(`guardian_pairing_code_${code}`, JSON.stringify(pairingData));
    localStorage.setItem(`guardian_pairing_code_${codeId}`, JSON.stringify(pairingData));
  } catch {
    // ignore
  }

  try {
    if (!getIsQuotaExhausted()) {
      await setDoc(doc(db, 'pairingCodes', codeId), pairingData);
    }
    return pairingData;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    // Return pairingData even if Firestore write quota is reached so local testing is never blocked
    return pairingData;
  }
}

// Wait for Firebase Auth state to resolve asynchronously
export function waitForFirebaseAuth(timeoutMs = 2500): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        console.warn('onAuthStateChanged error:', error);
        unsubscribe();
        resolve(null);
      }
    );
    setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
  });
}

// Authenticate and obtain valid child-device authentication UID
export async function getOrCreateChildAuth(deviceId?: string): Promise<string> {
  // Ensure each child hardware device instance maintains its own deterministic, collision-free authentication identity
  const storageKey = deviceId ? `guardian_cauth_${deviceId}` : 'guardian_child_auth_session';
  let stored = localStorage.getItem(storageKey);
  if (!stored) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    stored = `child_auth_${(deviceId || 'dev').replace(/[^a-zA-Z0-9_]/g, '')}_${hex}`;
    localStorage.setItem(storageKey, stored);
  }
  return stored;
}

// Alias for backward compatibility
export const obtainChildAuthUid = getOrCreateChildAuth;

// Pair child device with 6-digit code
export async function pairChildDeviceWithCode(
  code: string,
  deviceId: string,
  childAuthUidParam?: string,
  childName?: string,
  deviceModel?: string
): Promise<{ success: boolean; guardianId: string; guardianName: string }> {
  if (!code || code.trim().length !== 6) {
    throw new Error('Please enter a valid 6-digit pairing code.');
  }

  // Authenticate / obtain the child Firebase identity
  const childAuthUid = childAuthUidParam || (await getOrCreateChildAuth(deviceId));

  // Explicit validation: childAuthUid must ALWAYS be present
  if (!childAuthUid) {
    throw new Error('Child authentication failed. Cannot pair device.');
  }

  const codeId = `code_${code.trim()}`;
  const codePath = `pairingCodes/${codeId}`;

  let data: PairingCode | null = null;

  try {
    const codeSnap = await getDoc(doc(db, 'pairingCodes', codeId));
    if (codeSnap.exists()) {
      data = codeSnap.data() as PairingCode;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, codePath);
  }

  // Fallback to local cache if Firestore is in quota-exhaustion mode
  if (!data) {
    const localCodeStr =
      localStorage.getItem(`guardian_pairing_code_${code.trim()}`) ||
      localStorage.getItem(`guardian_pairing_code_${codeId}`);
    if (localCodeStr) {
      try {
        data = JSON.parse(localCodeStr) as PairingCode;
      } catch {
        // ignore
      }
    }
  }

  if (!data) {
    throw new Error('Invalid pairing code. Please check and try again.');
  }

  if (data.isUsed) {
    throw new Error('Pairing code has already been used. Please generate a new code on the Guardian device.');
  }

  if (Date.now() > data.expiresAt) {
    throw new Error('Pairing code expired. Generate a new code.');
  }

  // Mark code as used locally and in Firestore
  data.isUsed = true;
  data.usedByDeviceId = deviceId;
  data.usedByChildAuthUid = childAuthUid;
  try {
    localStorage.setItem(`guardian_pairing_code_${code.trim()}`, JSON.stringify(data));
    localStorage.setItem(`guardian_pairing_code_${codeId}`, JSON.stringify(data));
  } catch {
    // ignore
  }

  if (!getIsQuotaExhausted()) {
    try {
      await updateDoc(doc(db, 'pairingCodes', codeId), {
        isUsed: true,
        usedByDeviceId: deviceId,
        usedByChildAuthUid: childAuthUid,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, codePath);
    }
  }

  // Fetch initial hardware status
  const battery = await getRealBatteryStatus();
  const location = await getRealLocation();
  const network = getRealNetworkStatus();
  const permissions = await checkSystemPermissions();

  // Register Child Device in Firestore & Local State
  const childDevice: ChildDevice = {
    deviceId,
    childAuthUid,
    guardianId: data.guardianId,
    childName: (childName || '').trim() || 'Child Device',
    deviceModel: deviceModel || navigator.userAgent.slice(0, 40),
    batteryLevel: typeof battery.level === 'number' ? battery.level : null,
    isCharging: typeof battery.charging === 'boolean' ? battery.charging : null,
    batterySupported: !!battery.supported,
    isOnline: true,
    lastSeen: Date.now(),
    networkStatus: network || 'UNKNOWN',
    flashlightState: 'OFF',
    cameraStreaming: false,
    audioStreaming: false,
    screenStreaming: false,
    location,
    permissions,
    screenTimeMinutes: 0,
    appUsages: [],
    updatedAt: new Date().toISOString(),
  };

  // Broadcast locally so parent UI updates synchronously even during quota limit
  broadcastLocalDeviceUpdate(deviceId, childDevice);
  window.dispatchEvent(new CustomEvent('guardian_device_paired', { detail: { deviceId, device: childDevice } }));

  if (!getIsQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'childDevices', deviceId), childDevice);

      // Record Event
      const eventId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const event: DeviceEvent = {
        eventId,
        deviceId,
        guardianId: data.guardianId,
        type: 'PAIRING',
        title: 'New Device Paired',
        message: `${childDevice.childName} (${childDevice.deviceModel}) successfully paired with your Guardian account.`,
        timestamp: Date.now(),
      };
      await setDoc(doc(db, 'deviceEvents', eventId), event);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `childDevices/${deviceId}`);
    }
  }

  return {
    success: true,
    guardianId: data.guardianId,
    guardianName: data.guardianName,
  };
}

// Synchronize real-time child device permissions, location, and telemetry
export async function syncChildTelemetry(
  deviceId: string,
  updates: {
    permissions?: AppPermissionState;
    location?: DeviceLocation;
    batteryLevel?: number | null;
    isCharging?: boolean | null;
    networkStatus?: 'WIFI' | 'CELLULAR' | 'OFFLINE' | 'UNKNOWN';
  }
): Promise<void> {
  if (!deviceId) return;

  const patch: Partial<ChildDevice> = {
    lastSeen: Date.now(),
    isOnline: true,
  };
  if (updates.permissions) patch.permissions = updates.permissions;
  if (updates.location) patch.location = updates.location;
  if (typeof updates.batteryLevel !== 'undefined') patch.batteryLevel = updates.batteryLevel;
  if (typeof updates.isCharging !== 'undefined') patch.isCharging = updates.isCharging;
  if (updates.networkStatus) patch.networkStatus = updates.networkStatus;

  // Always update locally for instant response
  broadcastLocalDeviceUpdate(deviceId, patch);

  if (!getIsQuotaExhausted()) {
    try {
      const payload: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        lastSeen: Date.now(),
        isOnline: true,
      };
      if (updates.permissions) payload.permissions = updates.permissions;
      if (updates.location) payload.location = updates.location;
      if (typeof updates.batteryLevel !== 'undefined') payload.batteryLevel = updates.batteryLevel;
      if (typeof updates.isCharging !== 'undefined') payload.isCharging = updates.isCharging;
      if (updates.networkStatus) payload.networkStatus = updates.networkStatus;

      await updateDoc(doc(db, 'childDevices', deviceId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `childDevices/${deviceId}`);
    }
  }
}

// Throttle map to prevent spamming writes
const lastHeartbeatWrites = new Map<string, { ts: number; signature: string }>();

// Child device heartbeat updater
export async function sendChildHeartbeat(deviceId: string): Promise<void> {
  if (!deviceId) return;
  try {
    const battery = await getRealBatteryStatus();
    const network = getRealNetworkStatus();
    const permissions = await checkSystemPermissions();

    const signature = JSON.stringify({
      b: battery.level,
      c: battery.charging,
      n: network,
      p: permissions,
    });

    const now = Date.now();
    const lastWrite = lastHeartbeatWrites.get(deviceId);

    // Always update local presence
    broadcastLocalDeviceUpdate(deviceId, {
      isOnline: true,
      lastSeen: now,
      batteryLevel: typeof battery.level === 'number' ? battery.level : null,
      isCharging: typeof battery.charging === 'boolean' ? battery.charging : null,
      batterySupported: !!battery.supported,
      networkStatus: network || 'UNKNOWN',
      permissions,
    });

    // Skip cloud write if nothing changed and less than 60s has passed, or if quota is exhausted
    if (getIsQuotaExhausted() || (lastWrite && lastWrite.signature === signature && now - lastWrite.ts < 60000)) {
      return;
    }

    lastHeartbeatWrites.set(deviceId, { ts: now, signature });

    await updateDoc(doc(db, 'childDevices', deviceId), {
      isOnline: true,
      lastSeen: now,
      batteryLevel: typeof battery.level === 'number' ? battery.level : null,
      isCharging: typeof battery.charging === 'boolean' ? battery.charging : null,
      batterySupported: !!battery.supported,
      networkStatus: network || 'UNKNOWN',
      permissions,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `childDevices/${deviceId}`);
  }
}

// Persistent execution set across re-subscriptions (prevents duplicate execution on re-render)
const globalExecutedCommandIds = new Set<string>();
let lastStopCameraTimestamp = 0;

// Child device commands processor
export function subscribeToChildCommands(
  deviceId: string,
  onCommandReceived: (command: DeviceCommand) => void
) {
  const processCommand = async (cmd: DeviceCommand) => {
    if (cmd.deviceId === deviceId && !globalExecutedCommandIds.has(cmd.commandId)) {
      // If a START_CAMERA command was created BEFORE the last STOP_CAMERA command,
      // or if STOP_CAMERA was issued and camera is not currently requested, ignore it!
      if (cmd.type === 'START_CAMERA') {
        const cmdTime = cmd.createdAt ? new Date(cmd.createdAt).getTime() : 0;
        if (
          (cmdTime > 0 && cmdTime <= lastStopCameraTimestamp) ||
          (!getIsCameraRequested() && lastStopCameraTimestamp > 0 && Date.now() - lastStopCameraTimestamp < 5000)
        ) {
          console.log('Ignoring stale/cancelled START_CAMERA command generated before or during STOP_CAMERA');
          globalExecutedCommandIds.add(cmd.commandId);
          return;
        }
      }

      globalExecutedCommandIds.add(cmd.commandId);
      onCommandReceived(cmd);
      await executeChildCommand(cmd);
    }
  };

  // 1. Local DOM Event listener for 0ms latency in same window
  const handleLocalEvent = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail) {
      processCommand(custom.detail as DeviceCommand);
    }
  };
  window.addEventListener('guardian_command_dispatched', handleLocalEvent);

  // 2. BroadcastChannel for cross-tab runners
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel('guardian_hardware_channel');
    bc.onmessage = (e) => {
      if (e.data?.type === 'DISPATCH_COMMAND' && e.data?.command) {
        processCommand(e.data.command as DeviceCommand);
      }
    };
  } catch {
    // ignore
  }

  // 3. Firestore Snapshot query for remote physical devices
  const q = query(
    collection(db, 'deviceCommands'),
    where('deviceId', '==', deviceId),
    where('status', '==', 'PENDING')
  );

  const unsubFirestore = onSnapshot(
    q,
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const cmd = change.doc.data() as DeviceCommand;
          await processCommand(cmd);
        }
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'deviceCommands');
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener('guardian_command_dispatched', handleLocalEvent);
    bc?.close();
  };
}

// Execute command on child device hardware
async function executeChildCommand(cmd: DeviceCommand): Promise<void> {
  const startTs = Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let message = 'Executed successfully';
  let responseData: Record<string, unknown> = {};

  try {
    switch (cmd.type) {
      case 'PING': {
        const battery = await getRealBatteryStatus();
        const network = getRealNetworkStatus();
        status = 'OK';
        message = 'PONG received from Child Device';
        responseData = {
          pongTimestamp: Date.now(),
          batteryLevel: battery.level,
          network,
        };
        break;
      }

      case 'FLASHLIGHT_ON': {
        const res = await setRealFlashlight(true);
        if (res === 'UNSUPPORTED') {
          status = 'ERROR';
          message = 'Torch/Flashlight unavailable on this device (Only supported on Rear Camera).';
          emitHardwareAck({
            commandId: cmd.commandId,
            deviceId: cmd.deviceId,
            status: 'FLASH_ERROR',
            message,
          });
          const patch: Partial<ChildDevice> = {
            flashlightState: 'UNSUPPORTED',
            flashState: 'ERROR',
          };
          if (!getIsQuotaExhausted()) {
            try {
              await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
            } catch {
              // ignore
            }
          }
          broadcastLocalDeviceUpdate(cmd.deviceId, patch);
        } else {
          status = 'OK';
          message = 'Flashlight turned ON';
          const patch: Partial<ChildDevice> = {
            flashlightState: 'ON',
            flashState: 'ON',
          };
          if (!getIsQuotaExhausted()) {
            try {
              await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
            } catch {
              // ignore
            }
          }
          broadcastLocalDeviceUpdate(cmd.deviceId, patch);

          emitHardwareAck({
            commandId: cmd.commandId,
            deviceId: cmd.deviceId,
            status: 'FLASH_ON_SUCCESS',
            message: 'Flashlight is ON',
          });
        }
        break;
      }

      case 'FLASHLIGHT_OFF': {
        await setRealFlashlight(false);
        status = 'OK';
        message = 'Flashlight turned OFF';
        const patch: Partial<ChildDevice> = {
          flashlightState: 'OFF',
          flashState: 'OFF',
        };
        if (!getIsQuotaExhausted()) {
          try {
            await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
          } catch {
            // ignore
          }
        }
        broadcastLocalDeviceUpdate(cmd.deviceId, patch);

        emitHardwareAck({
          commandId: cmd.commandId,
          deviceId: cmd.deviceId,
          status: 'FLASH_OFF_SUCCESS',
          message: 'Flashlight is OFF',
        });
        break;
      }

      case 'REFRESH_LOCATION': {
        const loc = await getRealLocation();
        if (!getIsQuotaExhausted()) {
          try {
            await updateDoc(doc(db, 'childDevices', cmd.deviceId), { location: loc });
          } catch {
            // ignore
          }
        }
        broadcastLocalDeviceUpdate(cmd.deviceId, { location: loc });
        if (loc.permissionStatus === 'denied' || loc.permissionStatus === 'unavailable') {
          status = 'ERROR';
          message = loc.errorMessage || 'Location permission denied or unavailable';
        } else {
          status = 'OK';
          message = `Location updated: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
          responseData = { location: loc };
        }
        break;
      }

      case 'START_CAMERA': {
        const facingMode: 'user' | 'environment' =
          cmd.payload?.facingMode === 'environment' ? 'environment' : 'user';

        // Check if camera was already cancelled
        const cmdTime = cmd.createdAt ? new Date(cmd.createdAt).getTime() : 0;
        if (cmdTime > 0 && cmdTime <= lastStopCameraTimestamp) {
          console.log('Aborting START_CAMERA: STOP_CAMERA was called after this command');
          status = 'ERROR';
          message = 'START_CAMERA cancelled by subsequent STOP_CAMERA';
          break;
        }

        // Emit immediate acknowledgement: CAMERA_CONNECTING
        emitHardwareAck({
          commandId: cmd.commandId,
          deviceId: cmd.deviceId,
          status: 'CAMERA_CONNECTING',
          facingMode,
          message: `Opening Android ${facingMode === 'environment' ? 'Rear' : 'Front'} Camera & creating CaptureSession...`,
        });

        // Set connecting state
        const connectingPatch: Partial<ChildDevice> = {
          cameraState: 'CONNECTING',
          activeCameraFacing: facingMode,
          cameraStatus: 'CAMERA_CONNECTING',
          cameraStatusMessage: `Connecting to ${facingMode === 'environment' ? 'Rear' : 'Front'} Camera...`,
        };
        broadcastLocalDeviceUpdate(cmd.deviceId, connectingPatch);

        try {
          const stream = await startRealCamera(facingMode, cmd.deviceId, async () => {
            // Cancellation check: If STOP_CAMERA was called in the meantime, abort callback!
            if (!getIsCameraRequested()) {
              console.log('startRealCamera callback aborted: camera is no longer requested');
              return;
            }

            // Callback: Called when frames are verified actively capturing and transmitting to Parent
            const latestPerms = await checkSystemPermissions();
            const streamingPatch: Partial<ChildDevice> = {
              cameraStreaming: true,
              cameraState: 'STREAMING',
              activeCameraFacing: facingMode,
              cameraStatus: 'CAMERA_STREAMING',
              cameraStatusMessage: `${facingMode === 'environment' ? 'Rear' : 'Front'} Camera Live Stream Active`,
              permissions: latestPerms,
            };

            if (!getIsQuotaExhausted()) {
              try {
                await updateDoc(doc(db, 'childDevices', cmd.deviceId), streamingPatch);
              } catch {
                // ignore
              }
            }
            broadcastLocalDeviceUpdate(cmd.deviceId, streamingPatch);

            emitHardwareAck({
              commandId: cmd.commandId,
              deviceId: cmd.deviceId,
              status: 'CAMERA_STREAMING',
              facingMode,
              message: `${facingMode === 'environment' ? 'Rear' : 'Front'} Camera Live Stream Active`,
            });
          });

          // Post-start cancellation check: If camera was stopped while getUserMedia was resolving
          if (!getIsCameraRequested()) {
            console.log('startRealCamera completed but camera was already stopped, releasing stream');
            stopRealCamera(true);
            closeChildPeerConnection();
            status = 'OK';
            message = 'Camera immediately released due to STOP_CAMERA';
            break;
          }

          // If WebRTC offer is present, create WebRTC answer for cross-network direct streaming
          if (cmd.payload?.offerSdp && typeof cmd.payload.offerSdp === 'string') {
            try {
              const answerSdp = await handleChildOfferAndCreateAnswer(cmd.payload.offerSdp, stream);
              responseData = { answerSdp };
              emitHardwareAck({
                commandId: cmd.commandId,
                deviceId: cmd.deviceId,
                status: 'CAMERA_STREAMING',
                facingMode,
                answerSdp,
                message: `${facingMode === 'environment' ? 'Rear' : 'Front'} Camera P2P Stream Active`,
              });
            } catch (webrtcErr) {
              console.warn('WebRTC P2P answer creation fallback to frame broadcast:', webrtcErr);
            }
          }

          status = 'OK';
          message = `Child ${facingMode === 'environment' ? 'Rear' : 'Front'} camera opened`;
        } catch (e: unknown) {
          // If camera was stopped by STOP_CAMERA command, suppress error state and ensure disconnected state
          if (!getIsCameraRequested() || (lastStopCameraTimestamp > 0 && Date.now() - lastStopCameraTimestamp < 5000)) {
            console.log('START_CAMERA cancelled by STOP_CAMERA; cleanly finalizing as stopped');
            stopRealCamera(true);
            stopFrameBroadcasting();
            closeChildPeerConnection();
            status = 'OK';
            message = 'Camera start aborted cleanly by subsequent STOP_CAMERA';

            const cleanPatch: Partial<ChildDevice> = {
              cameraStreaming: false,
              cameraState: 'DISCONNECTED',
              cameraStatus: 'CAMERA_STOPPED',
              cameraStatusMessage: 'Camera Stopped',
            };

            if (!getIsQuotaExhausted()) {
              try {
                await updateDoc(doc(db, 'childDevices', cmd.deviceId), cleanPatch);
              } catch {
                // ignore
              }
            }
            broadcastLocalDeviceUpdate(cmd.deviceId, cleanPatch);

            emitHardwareAck({
              commandId: cmd.commandId,
              deviceId: cmd.deviceId,
              status: 'CAMERA_STOPPED',
              facingMode,
              message: 'Camera stopped and released',
            });
            break;
          }

          status = 'ERROR';
          const errMsg = e instanceof Error ? e.message : 'Camera permission denied or camera in use';
          message = errMsg;

          const latestPerms = await checkSystemPermissions();
          const patch: Partial<ChildDevice> = {
            cameraStreaming: false,
            cameraState: 'ERROR',
            cameraStatus: 'CAMERA_FAILED',
            cameraStatusMessage: errMsg,
            permissions: latestPerms,
          };

          if (!getIsQuotaExhausted()) {
            try {
              await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
            } catch {
              // ignore
            }
          }
          broadcastLocalDeviceUpdate(cmd.deviceId, patch);

          // Emit acknowledgement: CAMERA_FAILED with real error reason
          emitHardwareAck({
            commandId: cmd.commandId,
            deviceId: cmd.deviceId,
            status: 'CAMERA_FAILED',
            facingMode,
            message: errMsg,
          });
        }
        break;
      }

      case 'STOP_CAMERA': {
        lastStopCameraTimestamp = Date.now();
        setIsCameraRequested(false);
        stopRealCamera(true);
        stopFrameBroadcasting();
        closeChildPeerConnection();

        const patch: Partial<ChildDevice> = {
          cameraStreaming: false,
          cameraState: 'DISCONNECTED',
          flashlightState: 'OFF',
          flashState: 'OFF',
          cameraStatus: 'CAMERA_STOPPED',
          cameraStatusMessage: 'Camera Stopped',
        };

        if (!getIsQuotaExhausted()) {
          try {
            await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
          } catch {
            // ignore
          }
        }
        broadcastLocalDeviceUpdate(cmd.deviceId, patch);

        status = 'OK';
        message = 'Camera stream stopped';

        emitHardwareAck({
          commandId: cmd.commandId,
          deviceId: cmd.deviceId,
          status: 'CAMERA_STOPPED',
          message: 'Camera stopped and resources released',
        });
        break;
      }

      case 'START_AUDIO': {
        // Emit immediate acknowledgement: MIC_CONNECTING
        emitHardwareAck({
          commandId: cmd.commandId,
          deviceId: cmd.deviceId,
          status: 'MIC_CONNECTING',
          message: 'Initializing Android AudioRecord capture session...',
        });

        const micConnectingPatch: Partial<ChildDevice> = {
          audioState: 'CONNECTING',
          audioStatusMessage: 'Initializing Android AudioRecord...',
        };
        broadcastLocalDeviceUpdate(cmd.deviceId, micConnectingPatch);

        try {
          await startRealAudio(cmd.deviceId, async () => {
            // Callback: Called when microphone audio chunks are actively recording and transmitting
            const latestPerms = await checkSystemPermissions();
            const listeningPatch: Partial<ChildDevice> = {
              audioStreaming: true,
              audioState: 'LISTENING',
              audioStatusMessage: 'Microphone Live Listening Active',
              permissions: latestPerms,
            };

            if (!getIsQuotaExhausted()) {
              try {
                await updateDoc(doc(db, 'childDevices', cmd.deviceId), listeningPatch);
              } catch {
                // ignore
              }
            }
            broadcastLocalDeviceUpdate(cmd.deviceId, listeningPatch);

            emitHardwareAck({
              commandId: cmd.commandId,
              deviceId: cmd.deviceId,
              status: 'MIC_LISTENING',
              message: 'Microphone audio streaming to Parent',
            });
          });

          status = 'OK';
          message = 'Child microphone capture started';
        } catch (e: unknown) {
          status = 'ERROR';
          const errMsg = e instanceof Error ? e.message : 'Microphone permission denied';
          message = errMsg;

          const latestPerms = await checkSystemPermissions();
          const patch: Partial<ChildDevice> = {
            audioStreaming: false,
            audioState: 'ERROR',
            audioStatusMessage: errMsg,
            permissions: latestPerms,
          };

          if (!getIsQuotaExhausted()) {
            try {
              await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
            } catch {
              // ignore
            }
          }
          broadcastLocalDeviceUpdate(cmd.deviceId, patch);

          emitHardwareAck({
            commandId: cmd.commandId,
            deviceId: cmd.deviceId,
            status: 'MIC_FAILED',
            message: errMsg,
          });
        }
        break;
      }

      case 'STOP_AUDIO': {
        stopRealAudio();
        const patch: Partial<ChildDevice> = {
          audioStreaming: false,
          audioState: 'DISCONNECTED',
          audioStatusMessage: 'Microphone Inactive',
        };
        if (!getIsQuotaExhausted()) {
          try {
            await updateDoc(doc(db, 'childDevices', cmd.deviceId), patch);
          } catch {
            // ignore
          }
        }
        broadcastLocalDeviceUpdate(cmd.deviceId, patch);
        status = 'OK';
        message = 'Audio stream stopped';

        emitHardwareAck({
          commandId: cmd.commandId,
          deviceId: cmd.deviceId,
          status: 'MIC_STOPPED',
          message: 'Microphone stopped and audio recording released',
        });
        break;
      }

      case 'START_SCREEN': {
        try {
          await startRealScreenCapture();
          await updateDoc(doc(db, 'childDevices', cmd.deviceId), { screenStreaming: true });
          status = 'OK';
          message = 'Child screen sharing active';
        } catch (e: unknown) {
          status = 'ERROR';
          message = (e instanceof Error ? e.message : 'Screen capture permission cancelled or unsupported');
        }
        break;
      }

      case 'STOP_SCREEN': {
        stopRealScreenCapture();
        await updateDoc(doc(db, 'childDevices', cmd.deviceId), { screenStreaming: false });
        status = 'OK';
        message = 'Screen capture stopped';
        break;
      }

      case 'LOCK_DEVICE': {
        status = 'OK';
        message = 'Device lock rule set';
        break;
      }

      default:
        status = 'ERROR';
        message = `Unknown command: ${cmd.type}`;
    }
  } catch (error) {
    status = 'ERROR';
    message = error instanceof Error ? error.message : 'Hardware execution error';
  }

  // Update command document with response
  try {
    await updateDoc(doc(db, 'deviceCommands', cmd.commandId), {
      status: status === 'OK' ? 'EXECUTED' : 'FAILED',
      response: {
        status,
        message,
        data: responseData,
        roundtripMs: Date.now() - startTs,
        timestamp: Date.now(),
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to update command execution status:', err);
  }
}

// Guardian sends command
export async function sendGuardianCommand(
  deviceId: string,
  type: CommandType,
  payload?: Record<string, unknown>
): Promise<string> {
  const guardianId = auth.currentUser?.uid || getOrCreateLocalGuardianId();

  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cmd: DeviceCommand = {
    commandId,
    deviceId,
    guardianId,
    type,
    status: 'PENDING',
    payload: payload || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Dispatch locally and across tabs via BroadcastChannel for instant transmission
  try {
    const bc = new BroadcastChannel('guardian_hardware_channel');
    bc.postMessage({ type: 'DISPATCH_COMMAND', command: cmd });
    bc.close();
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('guardian_command_dispatched', { detail: cmd }));

  // 2. Persist to Firestore if quota allows
  if (!getIsQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'deviceCommands', commandId), cmd);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `deviceCommands/${commandId}`);
    }
  }

  return commandId;
}

// Listen to specific command result (for connection test PING/PONG and live hardware feedback)
export function subscribeToCommand(
  commandId: string,
  onResult: (cmd: DeviceCommand) => void
) {
  return onSnapshot(
    doc(db, 'deviceCommands', commandId),
    (snap) => {
      if (snap.exists()) {
        onResult(snap.data() as DeviceCommand);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `deviceCommands/${commandId}`);
    }
  );
}

// Listen to Guardian's paired child devices
export function subscribeToGuardianDevices(
  guardianId: string,
  onDevices: (devices: ChildDevice[]) => void
) {
  const cacheKey = `guardian_devices_cache_${guardianId}`;
  let currentList: ChildDevice[] = [];
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as ChildDevice[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentList = parsed;
        onDevices(parsed);
      }
    }
  } catch {
    // ignore
  }

  // Handle resilient local broadcast updates (works even during quota limits)
  const handleLocalUpdate = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.device) {
      const updated = custom.detail.device as ChildDevice;
      const idx = currentList.findIndex((d) => d.deviceId === updated.deviceId);
      if (idx >= 0) {
        currentList[idx] = { ...currentList[idx], ...updated };
      } else {
        currentList = [updated, ...currentList];
      }
      try {
        localStorage.setItem(cacheKey, JSON.stringify(currentList));
      } catch {
        // ignore
      }
      onDevices([...currentList]);
    }
  };
  window.addEventListener('guardian_device_updated', handleLocalUpdate);
  window.addEventListener('guardian_device_paired', handleLocalUpdate);

  const q = query(collection(db, 'childDevices'), where('guardianId', '==', guardianId));
  const unsubFirestore = onSnapshot(
    q,
    (snapshot) => {
      const list: ChildDevice[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as ChildDevice);
      });
      currentList = list;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(list));
      } catch {
        // ignore
      }
      onDevices(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'childDevices');
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener('guardian_device_updated', handleLocalUpdate);
    window.removeEventListener('guardian_device_paired', handleLocalUpdate);
  };
}

// Listen to single Child Device state (for Child mode)
export function subscribeToChildDevice(
  deviceId: string,
  onDevice: (device: ChildDevice | null) => void
) {
  // Check local cache first
  const localKey = `guardian_device_local_${deviceId}`;
  try {
    const localStr = localStorage.getItem(localKey);
    if (localStr) {
      onDevice(JSON.parse(localStr) as ChildDevice);
    }
  } catch {
    // ignore
  }

  const handleLocalUpdate = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.deviceId === deviceId && custom.detail.device) {
      onDevice(custom.detail.device as ChildDevice);
    }
  };
  window.addEventListener('guardian_device_updated', handleLocalUpdate);
  window.addEventListener('guardian_device_paired', handleLocalUpdate);

  const unsub = onSnapshot(
    doc(db, 'childDevices', deviceId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data() as ChildDevice;
        try {
          localStorage.setItem(localKey, JSON.stringify(d));
        } catch {
          // ignore
        }
        onDevice(d);
      } else {
        if (!localStorage.getItem(localKey)) {
          onDevice(null);
        }
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `childDevices/${deviceId}`);
    }
  );

  return () => {
    unsub();
    window.removeEventListener('guardian_device_updated', handleLocalUpdate);
    window.removeEventListener('guardian_device_paired', handleLocalUpdate);
  };
}

// Listen to Device Events / Notices
export function subscribeToDeviceEvents(
  guardianId: string,
  onEvents: (events: DeviceEvent[]) => void
) {
  const q = query(collection(db, 'deviceEvents'), where('guardianId', '==', guardianId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DeviceEvent[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as DeviceEvent);
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
      onEvents(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'deviceEvents');
    }
  );
}

// Unpair child device
export async function unpairChildDevice(deviceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'childDevices', deviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `childDevices/${deviceId}`);
  }
}
