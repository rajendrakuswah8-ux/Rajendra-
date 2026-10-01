export type DeviceRole = 'GUARDIAN' | 'CHILD';

export type GuardianTab = 'NOTICE' | 'DEVICE' | 'ME';

export interface AppPermissionState {
  camera: 'granted' | 'denied' | 'prompt' | 'unsupported';
  microphone: 'granted' | 'denied' | 'prompt' | 'unsupported';
  location: 'granted' | 'denied' | 'prompt' | 'unsupported';
  notifications: 'granted' | 'denied' | 'prompt' | 'unsupported';
  screenCapture: 'granted' | 'denied' | 'prompt' | 'unsupported';
}

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unavailable';
  errorMessage?: string;
}

export interface AppUsageItem {
  packageName: string;
  appName: string;
  minutesUsed: number;
  category: 'social' | 'games' | 'education' | 'entertainment' | 'system';
  status: 'allowed' | 'blocked' | 'restricted';
}

export type CameraServiceState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'STREAMING'
  | 'ERROR';

export type MicrophoneServiceState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'LISTENING'
  | 'ERROR';

export type FlashlightServiceState =
  | 'OFF'
  | 'TURNING_ON'
  | 'ON'
  | 'TURNING_OFF'
  | 'ERROR'
  | 'UNSUPPORTED';

export interface ChildDevice {
  deviceId: string;
  childAuthUid: string;
  guardianId: string;
  childName: string;
  deviceModel: string;
  batteryLevel: number | null; // Real percentage 0-100 or null if not supported
  isCharging: boolean | null; // Real charging status or null
  batterySupported: boolean;
  isOnline: boolean;
  lastSeen: number; // UTC ms timestamp
  networkStatus: 'WIFI' | 'CELLULAR' | 'OFFLINE' | 'UNKNOWN';
  flashlightState: 'ON' | 'OFF' | 'UNSUPPORTED';
  flashState?: FlashlightServiceState;
  cameraStreaming: boolean;
  cameraState?: CameraServiceState;
  activeCameraFacing?: 'user' | 'environment';
  cameraStatus?: HardwareAckStatus;
  cameraStatusMessage?: string;
  audioStreaming: boolean;
  audioState?: MicrophoneServiceState;
  audioStatusMessage?: string;
  screenStreaming: boolean;
  location: DeviceLocation | null;
  permissions: AppPermissionState;
  screenTimeMinutes: number;
  appUsages?: AppUsageItem[];
  updatedAt: string;
}

export interface PairingCode {
  id?: string;
  code: string;
  guardianId: string;
  guardianEmail: string;
  guardianName: string;
  expiresAt: number;
  isUsed: boolean;
  usedByDeviceId?: string;
  usedByChildAuthUid?: string;
  createdAt: string;
}

export type CommandType =
  | 'PING'
  | 'FLASHLIGHT_ON'
  | 'FLASHLIGHT_OFF'
  | 'START_CAMERA'
  | 'STOP_CAMERA'
  | 'START_AUDIO'
  | 'STOP_AUDIO'
  | 'START_SCREEN'
  | 'STOP_SCREEN'
  | 'REFRESH_LOCATION'
  | 'LOCK_DEVICE';

export type HardwareAckStatus =
  | 'CAMERA_CONNECTING'
  | 'CAMERA_CONNECTED'
  | 'CAMERA_STREAMING'
  | 'CAMERA_FAILED'
  | 'CAMERA_STOPPED'
  | 'MIC_CONNECTING'
  | 'MIC_CONNECTED'
  | 'MIC_LISTENING'
  | 'MIC_FAILED'
  | 'MIC_STOPPED'
  | 'FLASH_ON_SUCCESS'
  | 'FLASH_OFF_SUCCESS'
  | 'FLASH_ERROR'
  | 'FLASH_ON'
  | 'FLASH_OFF'
  | 'FLASH_FAILED';

export interface CommandAck {
  ackId: string;
  commandId: string;
  deviceId: string;
  status: HardwareAckStatus;
  message: string;
  facingMode?: 'user' | 'environment';
  offerSdp?: string;
  answerSdp?: string;
  timestamp: number;
}

export interface DeviceCommand {
  commandId: string;
  deviceId: string;
  guardianId: string;
  type: CommandType;
  status: 'PENDING' | 'DELIVERED' | 'EXECUTED' | 'FAILED';
  payload?: Record<string, unknown>;
  response?: {
    status: 'OK' | 'ERROR';
    message?: string;
    data?: Record<string, unknown>;
    roundtripMs?: number;
    timestamp: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DeviceEvent {
  eventId: string;
  deviceId: string;
  guardianId: string;
  type:
    | 'ONLINE'
    | 'OFFLINE'
    | 'LOW_BATTERY'
    | 'PING_PONG'
    | 'PERMISSION_REVOKED'
    | 'LOCATION_UNAVAILABLE'
    | 'COMMAND_EXECUTED'
    | 'PAIRING';
  title: string;
  message: string;
  timestamp: number;
}

export interface PipelineStepStatus {
  step: number;
  name: string;
  status: 'IDLE' | 'PENDING' | 'SUCCESS' | 'FAILED';
  detail?: string;
  error?: string;
  timestamp?: number;
}

export interface ServicePipelineDiagnostics {
  service: 'VOICE' | 'VIDEO' | 'FLASH';
  lastUpdated: number;
  overallStatus: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'ERROR';
  failedAtStep?: number;
  errorMessage?: string;
  steps: PipelineStepStatus[];
}
