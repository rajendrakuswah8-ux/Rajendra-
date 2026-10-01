import { CommandAck, ServicePipelineDiagnostics } from '../types';
import { getIsCameraRequested } from './hardware';

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('guardian_hardware_channel');
  }
} catch {
  // ignore
}

// -------------------------------------------------------------
// Command Acknowledgement Broadcaster
// -------------------------------------------------------------
export function emitHardwareAck(ack: Omit<CommandAck, 'ackId' | 'timestamp'>): CommandAck {
  const fullAck: CommandAck = {
    ...ack,
    ackId: `ack_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
  };

  // 1. Dispatch custom DOM event in same window
  window.dispatchEvent(new CustomEvent('guardian_cmd_ack', { detail: fullAck }));

  // 2. Broadcast to other tabs/runners via BroadcastChannel
  try {
    broadcastChannel?.postMessage({ type: 'HARDWARE_ACK', ack: fullAck });
  } catch {
    // ignore
  }

  // 3. Save to localStorage for cross-tab persistence
  try {
    localStorage.setItem(`guardian_last_ack_${ack.deviceId}`, JSON.stringify(fullAck));
    localStorage.setItem(`guardian_cmd_ack_${ack.commandId}`, JSON.stringify(fullAck));
  } catch {
    // ignore
  }

  return fullAck;
}

// Subscribe to Command Acknowledgements (Parent side)
export function subscribeToHardwareAcks(
  deviceId: string,
  onAck: (ack: CommandAck) => void
): () => void {
  // Check latest cached ack first
  try {
    const cached = localStorage.getItem(`guardian_last_ack_${deviceId}`);
    if (cached) {
      const parsed = JSON.parse(cached) as CommandAck;
      if (Date.now() - parsed.timestamp < 10000) {
        onAck(parsed);
      }
    }
  } catch {
    // ignore
  }

  const handleDomEvent = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail && (custom.detail.deviceId === deviceId || !deviceId)) {
      onAck(custom.detail as CommandAck);
    }
  };

  const handleChannelMsg = (e: MessageEvent) => {
    if (e.data?.type === 'HARDWARE_ACK' && e.data?.ack) {
      const ack = e.data.ack as CommandAck;
      if (ack.deviceId === deviceId || !deviceId) {
        onAck(ack);
      }
    }
  };

  window.addEventListener('guardian_cmd_ack', handleDomEvent);
  broadcastChannel?.addEventListener('message', handleChannelMsg);

  return () => {
    window.removeEventListener('guardian_cmd_ack', handleDomEvent);
    broadcastChannel?.removeEventListener('message', handleChannelMsg);
  };
}

// -------------------------------------------------------------
// Live Camera Video Frame Broadcaster
// Streams real video frames from Child camera to Parent preview
// -------------------------------------------------------------
let frameBroadcastInterval: number | null = null;
let captureCanvas: HTMLCanvasElement | null = null;
let captureVideoEl: HTMLVideoElement | null = null;
let isBroadcastingActive = false;
let currentActiveDeviceId: string | null = null;

export function startFrameBroadcasting(
  stream: MediaStream,
  deviceId: string,
  facingMode: 'user' | 'environment',
  onFramesCapturing?: () => void
): void {
  stopFrameBroadcasting();
  isBroadcastingActive = true;
  currentActiveDeviceId = deviceId;

  if (!captureCanvas) {
    captureCanvas = document.createElement('canvas');
  }

  // To ensure the browser engine actually renders video frames into memory,
  // the video element must be placed in the DOM (hidden offscreen).
  if (!captureVideoEl) {
    captureVideoEl = document.createElement('video');
    captureVideoEl.id = 'guardian_capture_video_el';
    captureVideoEl.muted = true;
    captureVideoEl.playsInline = true;
    captureVideoEl.autoplay = true;
    captureVideoEl.setAttribute('playsinline', '');
    captureVideoEl.setAttribute('webkit-playsinline', '');
    captureVideoEl.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-1;';
  }

  if (!captureVideoEl.parentNode && document.body) {
    document.body.appendChild(captureVideoEl);
  }

  captureVideoEl.srcObject = stream;
  captureVideoEl.onloadedmetadata = () => {
    captureVideoEl?.play().catch(() => {});
  };
  captureVideoEl.play().catch(() => {});

  let verifiedFrames = false;

  // Broadcast frame snapshots at ~12 FPS (every 85ms)
  frameBroadcastInterval = window.setInterval(() => {
    // Immediate cancellation check: If camera was stopped, immediately abort loop
    if (!isBroadcastingActive || !getIsCameraRequested()) {
      stopFrameBroadcasting();
      return;
    }

    if (!captureVideoEl || !captureCanvas) return;

    const vWidth = captureVideoEl.videoWidth || 640;
    const vHeight = captureVideoEl.videoHeight || 480;

    // Scale to standard mobile preview resolution (480x360 or aspect)
    const targetW = 480;
    const targetH = Math.round((vHeight / vWidth) * targetW) || 360;

    if (captureCanvas.width !== targetW || captureCanvas.height !== targetH) {
      captureCanvas.width = targetW;
      captureCanvas.height = targetH;
    }

    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.drawImage(captureVideoEl, 0, 0, targetW, targetH);
      const frameDataUrl = captureCanvas.toDataURL('image/jpeg', 0.65);

      if (frameDataUrl && frameDataUrl.length > 500) {
        if (!verifiedFrames) {
          verifiedFrames = true;
          onFramesCapturing?.();
        }

        const framePayload = {
          type: 'CAMERA_FRAME',
          deviceId,
          facingMode,
          frame: frameDataUrl,
          timestamp: Date.now(),
        };

        // Cache last frame for instant parent preview
        try {
          localStorage.setItem(`guardian_last_frame_${deviceId}`, frameDataUrl);
        } catch {
          // ignore
        }

        window.dispatchEvent(new CustomEvent('guardian_camera_frame', { detail: framePayload }));
        broadcastChannel?.postMessage(framePayload);
      }
    } catch {
      // ignore transient capture errors
    }
  }, 85);
}

export function stopFrameBroadcasting(): void {
  isBroadcastingActive = false;
  if (frameBroadcastInterval) {
    clearInterval(frameBroadcastInterval);
    frameBroadcastInterval = null;
  }
  if (captureVideoEl) {
    try {
      captureVideoEl.pause();
      captureVideoEl.srcObject = null;
      if (captureVideoEl.parentNode) {
        captureVideoEl.parentNode.removeChild(captureVideoEl);
      }
    } catch {
      // ignore
    }
    captureVideoEl = null;
  }

  // Clear cached last frame so stop is permanent and doesn't re-trigger streaming
  if (currentActiveDeviceId) {
    try {
      localStorage.removeItem(`guardian_last_frame_${currentActiveDeviceId}`);
    } catch {
      // ignore
    }
    currentActiveDeviceId = null;
  }
}

// Subscribe to Live Camera Frames (Parent side)
export function subscribeToLiveCameraFrames(
  deviceId: string,
  onFrame: (frameDataUrl: string, facingMode: 'user' | 'environment') => void
): () => void {
  const handleFrameEvent = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.deviceId === deviceId && custom.detail.frame) {
      onFrame(custom.detail.frame, custom.detail.facingMode || 'user');
    }
  };

  const handleChannelMsg = (e: MessageEvent) => {
    if (e.data?.type === 'CAMERA_FRAME' && e.data?.deviceId === deviceId && e.data.frame) {
      onFrame(e.data.frame, e.data.facingMode || 'user');
    }
  };

  window.addEventListener('guardian_camera_frame', handleFrameEvent);
  broadcastChannel?.addEventListener('message', handleChannelMsg);

  return () => {
    window.removeEventListener('guardian_camera_frame', handleFrameEvent);
    broadcastChannel?.removeEventListener('message', handleChannelMsg);
  };
}

// -------------------------------------------------------------
// Live Audio Broadcaster (Child side)
// Real-time PCM Audio Capture via Web Audio API
// Encodes raw 16-bit PCM speech chunks (-32768 to 32767)
// Eliminates MediaRecorder WebM container header decode bugs!
// -------------------------------------------------------------
let childAudioCtx: AudioContext | null = null;
let childAudioSource: MediaStreamAudioSourceNode | null = null;
let childAudioProcessor: ScriptProcessorNode | null = null;
let childMuteGain: GainNode | null = null;

export function startAudioBroadcasting(
  stream: MediaStream,
  deviceId: string,
  onAudioCapturing?: () => void
): void {
  stopAudioBroadcasting();

  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) {
      console.warn('Web Audio API not supported in this environment');
      return;
    }

    childAudioCtx = new AudioCtxClass();
    if (childAudioCtx.state === 'suspended') {
      childAudioCtx.resume().catch(() => {});
    }

    const sampleRate = childAudioCtx.sampleRate || 44100;
    childAudioSource = childAudioCtx.createMediaStreamSource(stream);

    // 2048 buffer size gives ~46ms chunks at 44.1kHz / ~42ms at 48kHz for ultra low latency
    const bufferSize = 2048;
    childAudioProcessor = childAudioCtx.createScriptProcessor(bufferSize, 1, 1);

    // Muted Gain node prevents microphone echo on child device while keeping audio graph running
    childMuteGain = childAudioCtx.createGain();
    childMuteGain.gain.value = 0;

    let verifiedAudio = false;

    childAudioProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const len = inputData.length;

      // 1. Calculate real RMS & Decibel volume level from true PCM samples
      let sum = 0;
      for (let i = 0; i < len; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / len);
      const dB = Math.min(100, Math.max(0, Math.round(20 * Math.log10(rms + 1e-4) + 85)));

      // 2. Convert Float32Array to 16-bit PCM (Int16Array)
      const pcm16 = new Int16Array(len);
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // 3. Convert Int16Array to Base64
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      const byteLen = bytes.byteLength;
      for (let i = 0; i < byteLen; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pcmBase64 = btoa(binary);

      if (!verifiedAudio && pcmBase64) {
        verifiedAudio = true;
        onAudioCapturing?.();
      }

      const audioPayload = {
        type: 'AUDIO_CHUNK_PCM',
        deviceId,
        pcmBase64,
        sampleRate,
        dB,
        timestamp: Date.now(),
      };

      window.dispatchEvent(new CustomEvent('guardian_audio_chunk', { detail: audioPayload }));
      broadcastChannel?.postMessage(audioPayload);
    };

    childAudioSource.connect(childAudioProcessor);
    childAudioProcessor.connect(childMuteGain);
    childMuteGain.connect(childAudioCtx.destination);
  } catch (err) {
    console.warn('Failed to start PCM audio broadcasting:', err);
  }
}

export function stopAudioBroadcasting(): void {
  if (childAudioProcessor) {
    try {
      childAudioProcessor.disconnect();
    } catch {
      // ignore
    }
    childAudioProcessor = null;
  }
  if (childAudioSource) {
    try {
      childAudioSource.disconnect();
    } catch {
      // ignore
    }
    childAudioSource = null;
  }
  if (childMuteGain) {
    try {
      childMuteGain.disconnect();
    } catch {
      // ignore
    }
    childMuteGain = null;
  }
  if (childAudioCtx) {
    try {
      childAudioCtx.close().catch(() => {});
    } catch {
      // ignore
    }
    childAudioCtx = null;
  }
}

// Subscribe to Live Audio Chunks (Parent side)
export function subscribeToLiveAudio(
  deviceId: string,
  onAudioChunk: (pcmBase64: string, sampleRate: number, dB: number) => void
): () => void {
  const handleAudioEvent = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.deviceId === deviceId && custom.detail.pcmBase64) {
      onAudioChunk(
        custom.detail.pcmBase64,
        custom.detail.sampleRate || 44100,
        custom.detail.dB || 0
      );
    }
  };

  const handleChannelMsg = (e: MessageEvent) => {
    if (e.data?.type === 'AUDIO_CHUNK_PCM' && e.data?.deviceId === deviceId && e.data.pcmBase64) {
      onAudioChunk(e.data.pcmBase64, e.data.sampleRate || 44100, e.data.dB || 0);
    }
  };

  window.addEventListener('guardian_audio_chunk', handleAudioEvent);
  broadcastChannel?.addEventListener('message', handleChannelMsg);

  return () => {
    window.removeEventListener('guardian_audio_chunk', handleAudioEvent);
    broadcastChannel?.removeEventListener('message', handleChannelMsg);
  };
}

// -------------------------------------------------------------
// Real Audio Player & Sound Output Engine (Parent side)
// Decodes raw PCM samples directly into AudioBuffers
// Guarantees zero decode errors and plays real sound out of speaker
// -------------------------------------------------------------
export class LiveAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private nextPlayTime = 0;
  private currentVolume = 1.0;

  public init(): void {
    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = this.currentVolume;

        this.analyser.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.currentVolume;
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  // Play real PCM chunk through Parent speaker
  public async playPcmChunk(pcmBase64: string, sampleRate: number): Promise<void> {
    try {
      this.init();
      if (!this.audioCtx) return;

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // 1. Decode Base64 to 16-bit PCM bytes
      const binary = atob(pcmBase64);
      const byteLen = binary.length;
      const bytes = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const sampleCount = pcm16.length;
      if (sampleCount === 0) return;

      // 2. Convert 16-bit integer PCM to Float32 [-1.0, 1.0]
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }

      // 3. Allocate AudioBuffer directly in Web Audio engine (100% reliable, zero format issues)
      const buffer = this.audioCtx.createBuffer(1, sampleCount, sampleRate || this.audioCtx.sampleRate);
      buffer.getChannelData(0).set(float32);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;

      // Connect source -> AnalyserNode -> Master Gain -> Speakers
      if (this.analyser) {
        source.connect(this.analyser);
      } else if (this.masterGain) {
        source.connect(this.masterGain);
      } else {
        source.connect(this.audioCtx.destination);
      }

      // Schedule seamless audio playback with 40ms jitter buffer
      const now = this.audioCtx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.04;
      }
      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
    } catch (err) {
      console.warn('LiveAudioPlayer error playing PCM chunk:', err);
    }
  }

  public getAudioLevel(): number {
    if (!this.analyser) return 0;
    try {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / (dataArray.length || 1);
      return Math.min(100, Math.round((avg / 255) * 100));
    } catch {
      return 0;
    }
  }

  public stop(): void {
    if (this.audioCtx) {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {
        // ignore
      }
      this.audioCtx = null;
      this.analyser = null;
      this.masterGain = null;
      this.nextPlayTime = 0;
    }
  }
}

// -------------------------------------------------------------
// 10-Step Pipeline Diagnostics Broadcaster & Subscriber
// -------------------------------------------------------------
export function emitPipelineDiagnostics(diag: ServicePipelineDiagnostics): void {
  window.dispatchEvent(new CustomEvent('guardian_pipeline_diag', { detail: diag }));
  try {
    broadcastChannel?.postMessage({ type: 'PIPELINE_DIAG', diag });
  } catch {
    // ignore
  }
}

export function subscribeToPipelineDiagnostics(
  service: 'VOICE' | 'VIDEO' | 'FLASH',
  onDiag: (diag: ServicePipelineDiagnostics) => void
): () => void {
  const handleEvent = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.service === service) {
      onDiag(custom.detail as ServicePipelineDiagnostics);
    }
  };

  const handleChannel = (e: MessageEvent) => {
    if (e.data?.type === 'PIPELINE_DIAG' && e.data?.diag?.service === service) {
      onDiag(e.data.diag as ServicePipelineDiagnostics);
    }
  };

  window.addEventListener('guardian_pipeline_diag', handleEvent);
  broadcastChannel?.addEventListener('message', handleChannel);

  return () => {
    window.removeEventListener('guardian_pipeline_diag', handleEvent);
    broadcastChannel?.removeEventListener('message', handleChannel);
  };
}
