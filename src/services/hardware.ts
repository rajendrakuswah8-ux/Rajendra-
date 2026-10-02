import { AppPermissionState, DeviceLocation } from '../types';
import {
  startFrameBroadcasting,
  stopFrameBroadcasting,
  startAudioBroadcasting,
  stopAudioBroadcasting,
} from './cameraStreamService';

export interface BatteryInfo {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
}

// Global active hardware tracks for clean teardown
let activeCameraStream: MediaStream | null = null;
let activeAudioStream: MediaStream | null = null;
let activeScreenStream: MediaStream | null = null;
let activeTorchTrack: MediaStreamTrack | null = null;

// Real Battery status
export async function getRealBatteryStatus(): Promise<BatteryInfo> {
  try {
    if ('getBattery' in navigator) {
      const nav = navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> };
      const battery = await nav.getBattery();
      return {
        supported: true,
        level: Math.round(battery.level * 100),
        charging: battery.charging,
      };
    }
    return {
      supported: false,
      level: null,
      charging: null,
    };
  } catch (err) {
    console.warn('Battery API unavailable:', err);
    return {
      supported: false,
      level: null,
      charging: null,
    };
  }
}

// Real Geolocation
export function getRealLocation(): Promise<DeviceLocation> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      setLocalPermissionStatus('location', 'denied');
      resolve({
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        permissionStatus: 'unavailable',
        errorMessage: 'Geolocation is not supported by this device hardware/browser.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalPermissionStatus('location', 'granted');
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: pos.timestamp,
          permissionStatus: 'granted',
        });
      },
      (err) => {
        let status: 'denied' | 'unavailable' = 'unavailable';
        if (err.code === err.PERMISSION_DENIED) {
          status = 'denied';
          setLocalPermissionStatus('location', 'denied');
        }
        resolve({
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          permissionStatus: status,
          errorMessage: err.message || 'Location unavailable',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  });
}

// Local runtime permission state cache with persistent memory
const localPermissionCache: AppPermissionState = {
  camera: (localStorage.getItem('guardian_perm_camera') as 'granted' | 'denied' | 'prompt') || 'prompt',
  microphone: (localStorage.getItem('guardian_perm_microphone') as 'granted' | 'denied' | 'prompt') || 'prompt',
  location: (localStorage.getItem('guardian_perm_location') as 'granted' | 'denied' | 'prompt') || 'prompt',
  notifications: (localStorage.getItem('guardian_perm_notifications') as 'granted' | 'denied' | 'prompt') || 'prompt',
  screenCapture: 'prompt',
};

export function setLocalPermissionStatus(
  name: keyof AppPermissionState,
  status: 'granted' | 'denied' | 'prompt' | 'unsupported'
) {
  localPermissionCache[name] = status;
  try {
    localStorage.setItem(`guardian_perm_${name}`, status);
  } catch {
    // ignore
  }
}

// Real Permission Center status checker - checks actual system status without triggering prompts
export async function checkSystemPermissions(): Promise<AppPermissionState> {
  const result: AppPermissionState = { ...localPermissionCache };

  // 1. Check Notifications (W3C standard)
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      result.notifications = 'granted';
      setLocalPermissionStatus('notifications', 'granted');
    } else if (Notification.permission === 'denied') {
      result.notifications = 'denied';
      setLocalPermissionStatus('notifications', 'denied');
    } else {
      result.notifications = 'prompt';
    }
  } else {
    result.notifications = 'unsupported';
  }

  // 2. Check Geolocation (Permissions API)
  if ('permissions' in navigator && navigator.permissions?.query) {
    try {
      const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
      result.location = geoPerm.state as 'granted' | 'denied' | 'prompt';
      setLocalPermissionStatus('location', result.location);
    } catch {
      // ignore
    }
  }

  // 3. Check Camera & Microphone via Permissions API where supported
  if ('permissions' in navigator && navigator.permissions?.query) {
    try {
      const camPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (camPerm?.state) {
        result.camera = camPerm.state as 'granted' | 'denied' | 'prompt';
        setLocalPermissionStatus('camera', result.camera);
      }
    } catch {
      // Some browsers do not support { name: 'camera' } in permissions.query
    }

    try {
      const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (micPerm?.state) {
        result.microphone = micPerm.state as 'granted' | 'denied' | 'prompt';
        setLocalPermissionStatus('microphone', result.microphone);
      }
    } catch {
      // Some browsers do not support { name: 'microphone' } in permissions.query
    }
  }

  // 4. Verify camera and microphone grant status by inspecting enumerateDevices()
  // Per W3C spec, device labels are only revealed if the origin has active camera/audio permission.
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const hasVideoLabel = deviceList.some(
        (d) => d.kind === 'videoinput' && d.label && d.label.length > 0
      );
      const hasAudioLabel = deviceList.some(
        (d) => d.kind === 'audioinput' && d.label && d.label.length > 0
      );

      if (hasVideoLabel) {
        result.camera = 'granted';
        setLocalPermissionStatus('camera', 'granted');
      } else if (result.camera === 'granted' && deviceList.some((d) => d.kind === 'videoinput')) {
        // Was previously granted, but devices no longer have labels -> revoked in settings
        result.camera = 'prompt';
        setLocalPermissionStatus('camera', 'prompt');
      }

      if (hasAudioLabel) {
        result.microphone = 'granted';
        setLocalPermissionStatus('microphone', 'granted');
      } else if (result.microphone === 'granted' && deviceList.some((d) => d.kind === 'audioinput')) {
        // Was previously granted, but audio devices no longer have labels -> revoked in settings
        result.microphone = 'prompt';
        setLocalPermissionStatus('microphone', 'prompt');
      }
    } catch {
      // ignore
    }
  }

  // 5. Screen capture availability
  if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
    if (result.screenCapture === 'unsupported') {
      result.screenCapture = 'prompt';
    }
  } else {
    result.screenCapture = 'unsupported';
  }

  return result;
}

let currentCameraFacing: 'user' | 'environment' = 'user';

export function getActiveCameraFacing(): 'user' | 'environment' {
  return currentCameraFacing;
}

export function getActiveCameraStream(): MediaStream | null {
  return activeCameraStream;
}

export function getActiveAudioStream(): MediaStream | null {
  return activeAudioStream;
}

// Check if a specific permission is already granted in the system
export async function isPermissionGranted(name: keyof AppPermissionState): Promise<boolean> {
  const current = await checkSystemPermissions();
  return current[name] === 'granted';
}

// Check if a specific permission is denied in Android Settings
export async function isPermissionDenied(name: keyof AppPermissionState): Promise<boolean> {
  const current = await checkSystemPermissions();
  return current[name] === 'denied';
}

// Real Flashlight / Torch
export async function setRealFlashlight(on: boolean): Promise<'ON' | 'OFF' | 'UNSUPPORTED'> {
  // Flash is strictly a rear camera feature. If active camera is Front ('user'), torch cannot be activated.
  if (activeCameraStream && currentCameraFacing === 'user') {
    return 'UNSUPPORTED';
  }

  // 1. If active rear camera stream is already running, toggle torch directly on its video track
  if (activeCameraStream && currentCameraFacing === 'environment') {
    const track = activeCameraStream.getVideoTracks()[0];
    if (track) {
      try {
        await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ torch: on }],
        });
        return on ? 'ON' : 'OFF';
      } catch (err) {
        console.warn('Direct rear camera track torch constraint failed or unsupported:', err);
        return 'UNSUPPORTED';
      }
    }
  }

  // 2. Standalone torch track handling (when camera is not streaming or fallback)
  try {
    if (on) {
      if (!activeTorchTrack) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        const track = stream.getVideoTracks()[0];
        try {
          await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
            advanced: [{ torch: true }],
          });
          activeTorchTrack = track;
          return 'ON';
        } catch {
          track.stop();
          return 'UNSUPPORTED';
        }
      } else {
        await (activeTorchTrack as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ torch: true }],
        });
        return 'ON';
      }
    } else {
      // Turn OFF
      if (activeCameraStream && currentCameraFacing === 'environment') {
        const camTrack = activeCameraStream.getVideoTracks()[0];
        if (camTrack) {
          try {
            await (camTrack as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
              advanced: [{ torch: false }],
            });
          } catch {
            // ignore
          }
        }
      }
      if (activeTorchTrack) {
        try {
          await (activeTorchTrack as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
            advanced: [{ torch: false }],
          });
        } catch {
          // ignore
        }
        activeTorchTrack.stop();
        activeTorchTrack = null;
      }
      return 'OFF';
    }
  } catch (error) {
    console.warn('Flashlight error or unsupported on this device:', error);
    if (activeTorchTrack) {
      activeTorchTrack.stop();
      activeTorchTrack = null;
    }
    return 'UNSUPPORTED';
  }
}

// Camera requested cancellation state token
let isCameraRequested = false;

export function getIsCameraRequested(): boolean {
  return isCameraRequested;
}

export function setIsCameraRequested(requested: boolean): void {
  isCameraRequested = requested;
  if (!requested) {
    stopRealCamera(true);
  }
}

// Real Camera Stream with Facing Mode (user = Front Camera, environment = Rear Camera)
export async function startRealCamera(
  facingMode: 'user' | 'environment' = 'user',
  deviceId?: string,
  onFramesCapturing?: () => void
): Promise<MediaStream> {
  // Set explicit requested token
  isCameraRequested = true;

  // 1. Properly close previous session, tracks, and torch first to release Android Camera resources
  stopRealCamera(false); // don't flip requested token to false during restart
  isCameraRequested = true;
  currentCameraFacing = facingMode;

  const denied = await isPermissionDenied('camera');
  if (denied) {
    isCameraRequested = false;
    throw new Error('Camera permission is blocked in Android Settings. Please allow it in App Settings.');
  }

  // Allow hardware 80ms to finish closing previous CameraCaptureSession
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Cancellation check: If STOP_CAMERA was called during the delay, abort immediately!
  if (!isCameraRequested) {
    throw new Error('Camera start cancelled by STOP_CAMERA command');
  }

  try {
    let stream: MediaStream;
    try {
      // First attempt with exact facing mode constraint
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch {
      // Fallback with ideal facing mode constraint
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    }

    // Cancellation check: If STOP_CAMERA was called while getUserMedia was acquiring hardware, abort!
    if (!isCameraRequested) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Camera start aborted: STOP_CAMERA was received during hardware initialization');
    }

    activeCameraStream = stream;
    setLocalPermissionStatus('camera', 'granted');

    // Start broadcasting frames to parent preview
    if (deviceId) {
      startFrameBroadcasting(stream, deviceId, facingMode, () => {
        if (isCameraRequested && onFramesCapturing) {
          onFramesCapturing();
        }
      });
    } else if (onFramesCapturing && isCameraRequested) {
      onFramesCapturing();
    }

    return activeCameraStream;
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      setLocalPermissionStatus('camera', 'denied');
    }
    isCameraRequested = false;
    throw err;
  }
}

export function stopRealCamera(resetRequestedFlag = true): void {
  if (resetRequestedFlag) {
    isCameraRequested = false;
  }

  // Turn off and release torch immediately when camera stops
  if (activeTorchTrack) {
    try {
      (activeTorchTrack as unknown as { applyConstraints: (c: unknown) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: false }] })
        .catch(() => {});
      activeTorchTrack.stop();
    } catch {
      // ignore
    }
    activeTorchTrack = null;
  }

  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => {
      try {
        (track as unknown as { applyConstraints: (c: unknown) => Promise<void> })
          .applyConstraints({ advanced: [{ torch: false }] })
          .catch(() => {});
        track.stop();
      } catch {
        // ignore
      }
    });
    activeCameraStream = null;
  }

  stopFrameBroadcasting();
}

// Real Audio Stream (Android AudioRecord capture)
export async function startRealAudio(
  deviceId?: string,
  onAudioCapturing?: () => void
): Promise<MediaStream> {
  stopRealAudio();

  const denied = await isPermissionDenied('microphone');
  if (denied) {
    throw new Error('Microphone permission is blocked in Android Settings. Please allow it in App Settings.');
  }

  try {
    activeAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    setLocalPermissionStatus('microphone', 'granted');

    if (deviceId) {
      startAudioBroadcasting(activeAudioStream, deviceId, onAudioCapturing);
    } else if (onAudioCapturing) {
      onAudioCapturing();
    }

    return activeAudioStream;
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      setLocalPermissionStatus('microphone', 'denied');
    }
    throw err;
  }
}

export function stopRealAudio(): void {
  stopAudioBroadcasting();
  if (activeAudioStream) {
    activeAudioStream.getTracks().forEach((track) => track.stop());
    activeAudioStream = null;
  }
}

// Real Screen Mirroring
export async function startRealScreenCapture(): Promise<MediaStream> {
  stopRealScreenCapture();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setLocalPermissionStatus('screenCapture', 'denied');
    throw new Error('Screen capture (getDisplayMedia / MediaProjection) is not supported by this browser/OS.');
  }
  try {
    activeScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    setLocalPermissionStatus('screenCapture', 'granted');
    return activeScreenStream;
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      setLocalPermissionStatus('screenCapture', 'denied');
    }
    throw err;
  }
}

export function stopRealScreenCapture(): void {
  if (activeScreenStream) {
    activeScreenStream.getTracks().forEach((track) => track.stop());
    activeScreenStream = null;
  }
}

// Network status
export function getRealNetworkStatus(): 'WIFI' | 'CELLULAR' | 'OFFLINE' | 'UNKNOWN' {
  if (!navigator.onLine) return 'OFFLINE';
  const nav = navigator as unknown as { connection?: { type?: string; effectiveType?: string } };
  if (nav.connection?.type) {
    if (nav.connection.type === 'wifi') return 'WIFI';
    if (nav.connection.type === 'cellular') return 'CELLULAR';
  }
  if (nav.connection?.effectiveType) {
    return 'CELLULAR';
  }
  return 'WIFI';
}
