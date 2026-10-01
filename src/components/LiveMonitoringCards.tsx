import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Monitor,
  Mic,
  MicOff,
  Flashlight,
  AlertCircle,
  CheckCircle2,
  Volume2,
  VolumeX,
  RefreshCw,
  Square,
  Play,
  Loader2,
  Headphones,
  Radio,
} from 'lucide-react';
import {
  ChildDevice,
  CommandType,
  CommandAck,
  CameraServiceState,
  MicrophoneServiceState,
  FlashlightServiceState,
} from '../types';
import { getActiveCameraStream } from '../services/hardware';
import { closeParentPeerConnection } from '../services/webrtcService';
import {
  subscribeToHardwareAcks,
  subscribeToLiveCameraFrames,
  subscribeToLiveAudio,
  LiveAudioPlayer,
} from '../services/cameraStreamService';
import { PipelineDiagnosticsCard } from './PipelineDiagnosticsCard';

interface LiveMonitoringCardsProps {
  device: ChildDevice;
  onSendCommand: (type: CommandType, payload?: Record<string, unknown>) => Promise<void>;
  isLoadingCommand: string | null;
}

export const LiveMonitoringCards: React.FC<LiveMonitoringCardsProps> = ({
  device,
  onSendCommand,
  isLoadingCommand,
}) => {
  // Active Monitoring Mode: 'VIDEO' | 'VOICE' | 'SCREEN'
  const [activeMode, setActiveMode] = useState<'VIDEO' | 'VOICE' | 'SCREEN'>('VIDEO');

  // Speaker Volume control for Parent playback (0-100%)
  const [speakerVolume, setSpeakerVolume] = useState<number>(100);

  const handleVolumeChange = (vol: number) => {
    setSpeakerVolume(vol);
    audioPlayerRef.current.setVolume(vol / 100);
  };

  // Audio decibel analyzer and live audio player
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioPlayerRef = useRef<LiveAudioPlayer>(new LiveAudioPlayer());
  const audioAnimationRef = useRef<number | null>(null);

  // Video element ref to show local camera stream if available in same runner
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Live remote frame streaming state
  const [remoteFrameUrl, setRemoteFrameUrl] = useState<string | null>(null);
  const [remoteFacing, setRemoteFacing] = useState<'user' | 'environment'>('user');

  // Explicit Camera Service State: DISCONNECTED | CONNECTING | CONNECTED | STREAMING | ERROR
  const [cameraState, setCameraState] = useState<CameraServiceState>(() =>
    device.cameraState
      ? device.cameraState
      : device.cameraStreaming
      ? 'STREAMING'
      : 'DISCONNECTED'
  );

  // Explicit Microphone Service State: DISCONNECTED | CONNECTING | CONNECTED | LISTENING | ERROR
  const [audioState, setAudioState] = useState<MicrophoneServiceState>(() =>
    device.audioState
      ? device.audioState
      : device.audioStreaming
      ? 'LISTENING'
      : 'DISCONNECTED'
  );

  // Explicit Flashlight Service State: OFF | TURNING_ON | ON | TURNING_OFF | ERROR | UNSUPPORTED
  const [flashState, setFlashState] = useState<FlashlightServiceState>(() =>
    device.flashState
      ? device.flashState
      : device.flashlightState === 'ON'
      ? 'ON'
      : device.flashlightState === 'UNSUPPORTED'
      ? 'UNSUPPORTED'
      : 'OFF'
  );

  const [cameraStatusMessage, setCameraStatusMessage] = useState<string>('');
  const [micStatusMessage, setMicStatusMessage] = useState<string>('');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(8);
  const connectionTimeoutTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const cameraStoppedByUserRef = useRef<boolean>(false);

  // Flash status & notice
  const [flashNotice, setFlashNotice] = useState<string | null>(null);

  // Clear timeout timer helper
  const clearConnectionTimers = () => {
    if (connectionTimeoutTimerRef.current) {
      clearTimeout(connectionTimeoutTimerRef.current);
      connectionTimeoutTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // Sync with device camera streaming state
  useEffect(() => {
    if (device.cameraStreaming && cameraState !== 'STREAMING' && !cameraStoppedByUserRef.current) {
      setCameraState('STREAMING');
      setCameraStatusMessage(
        `${device.activeCameraFacing === 'environment' ? 'Rear' : 'Front'} Camera Live`
      );
      clearConnectionTimers();
    } else if (!device.cameraStreaming && cameraState === 'STREAMING') {
      setCameraState('DISCONNECTED');
      setCameraStatusMessage('Camera stopped');
      setRemoteFrameUrl(null);
    }
  }, [device.cameraStreaming, device.activeCameraFacing]);

  // Sync with device audio streaming state
  useEffect(() => {
    if (device.audioStreaming && audioState !== 'LISTENING') {
      setAudioState('LISTENING');
    } else if (!device.audioStreaming && audioState === 'LISTENING') {
      setAudioState('DISCONNECTED');
      audioPlayerRef.current.stop();
    }
  }, [device.audioStreaming]);

  // Sync with device flashlight state
  useEffect(() => {
    if (device.flashlightState === 'ON') {
      setFlashState('ON');
    } else if (device.flashlightState === 'UNSUPPORTED') {
      setFlashState('UNSUPPORTED');
    } else if (device.flashlightState === 'OFF' && flashState !== 'TURNING_ON') {
      setFlashState('OFF');
    }
  }, [device.flashlightState]);

  // Connect local camera stream to video tag if available
  useEffect(() => {
    if (cameraState === 'STREAMING' && videoRef.current) {
      const stream = getActiveCameraStream();
      if (stream && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [cameraState, device.activeCameraFacing]);

  // Subscribe to live camera frames (real image frames streaming from Child)
  useEffect(() => {
    const unsubFrames = subscribeToLiveCameraFrames(device.deviceId, (frameUrl, facing) => {
      // Do not accept or render frames if user pressed Stop Camera!
      if (cameraStoppedByUserRef.current) return;
      setRemoteFrameUrl(frameUrl);
      setRemoteFacing(facing);
      setCameraState('STREAMING');
      clearConnectionTimers();
    });
    return () => unsubFrames();
  }, [device.deviceId]);

  // Subscribe to live audio chunks & real speaker playback (PCM 16-bit Web Audio)
  useEffect(() => {
    const unsubAudio = subscribeToLiveAudio(
      device.deviceId,
      (pcmBase64: string, sampleRate: number, dB: number) => {
        if (audioState !== 'LISTENING') {
          setAudioState('LISTENING');
        }
        setAudioLevel(dB);
        // Play real audio through Parent speaker via Web Audio API buffer engine
        audioPlayerRef.current.playPcmChunk(pcmBase64, sampleRate);
      }
    );
    return () => {
      unsubAudio();
      audioPlayerRef.current.stop();
    };
  }, [device.deviceId, audioState]);

  // Real Audio decibel analyzer reading from live player AnalyserNode
  useEffect(() => {
    if (audioState === 'LISTENING') {
      const updateAudio = () => {
        const level = audioPlayerRef.current.getAudioLevel();
        setAudioLevel(level);
        audioAnimationRef.current = requestAnimationFrame(updateAudio);
      };
      audioAnimationRef.current = requestAnimationFrame(updateAudio);
    } else {
      setAudioLevel(0);
      if (audioAnimationRef.current) {
        cancelAnimationFrame(audioAnimationRef.current);
      }
    }
    return () => {
      if (audioAnimationRef.current) cancelAnimationFrame(audioAnimationRef.current);
    };
  }, [audioState]);

  // Subscribe to real-time Hardware Acknowledgements
  useEffect(() => {
    const unsubAcks = subscribeToHardwareAcks(device.deviceId, (ack: CommandAck) => {
      switch (ack.status) {
        case 'CAMERA_CONNECTING':
          if (cameraStoppedByUserRef.current) break;
          setCameraState('CONNECTING');
          setCameraStatusMessage(ack.message || 'Connecting to Android Camera...');
          break;

        case 'CAMERA_CONNECTED':
          if (cameraStoppedByUserRef.current) break;
          setCameraState('CONNECTED');
          setCameraStatusMessage(ack.message || 'Camera connected, awaiting first frames...');
          break;

        case 'CAMERA_STREAMING':
          if (cameraStoppedByUserRef.current) break;
          setCameraState('STREAMING');
          setCameraStatusMessage(ack.message || 'Camera live stream active');
          clearConnectionTimers();
          break;

        case 'CAMERA_FAILED':
          if (cameraStoppedByUserRef.current) {
            setCameraState('DISCONNECTED');
            setCameraStatusMessage('Camera stopped and resources released');
          } else {
            setCameraState('ERROR');
            setCameraStatusMessage(ack.message || 'Camera connection failed');
          }
          clearConnectionTimers();
          break;

        case 'CAMERA_STOPPED':
          cameraStoppedByUserRef.current = true;
          setCameraState('DISCONNECTED');
          setCameraStatusMessage('Camera stopped and resources released');
          setRemoteFrameUrl(null);
          clearConnectionTimers();
          break;

        case 'MIC_CONNECTING':
          setAudioState('CONNECTING');
          setMicStatusMessage(ack.message || 'Initializing Android AudioRecord...');
          break;

        case 'MIC_CONNECTED':
          setAudioState('CONNECTED');
          setMicStatusMessage(ack.message || 'Audio capture connected...');
          break;

        case 'MIC_LISTENING':
          setAudioState('LISTENING');
          setMicStatusMessage('Microphone audio live streaming');
          break;

        case 'MIC_FAILED':
          setAudioState('ERROR');
          setMicStatusMessage(ack.message || 'Microphone error or permission denied');
          audioPlayerRef.current.stop();
          break;

        case 'MIC_STOPPED':
          setAudioState('DISCONNECTED');
          setMicStatusMessage('Audio stream stopped');
          audioPlayerRef.current.stop();
          break;

        case 'FLASH_ON_SUCCESS':
        case 'FLASH_ON':
          setFlashState('ON');
          setFlashNotice('Flashlight turned ON');
          setTimeout(() => setFlashNotice(null), 3000);
          break;

        case 'FLASH_OFF_SUCCESS':
        case 'FLASH_OFF':
          setFlashState('OFF');
          setFlashNotice('Flashlight turned OFF');
          setTimeout(() => setFlashNotice(null), 3000);
          break;

        case 'FLASH_ERROR':
        case 'FLASH_FAILED':
          setFlashState('ERROR');
          setFlashNotice(ack.message || 'Flash unavailable on this device');
          setTimeout(() => setFlashNotice(null), 4000);
          break;
      }
    });

    return () => {
      unsubAcks();
      clearConnectionTimers();
    };
  }, [device.deviceId]);

  // Handle camera start with robust 8-second timeout
  const handleStartCamera = async (facingMode: 'user' | 'environment') => {
    cameraStoppedByUserRef.current = false;
    clearConnectionTimers();
    setFlashNotice(null);
    setCameraState('CONNECTING');
    setCameraStatusMessage(
      `Initiating Android ${facingMode === 'environment' ? 'Rear' : 'Front'} Camera & CaptureSession...`
    );
    setCountdownSeconds(8);

    // Countdown interval
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdownSeconds((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    // Hard 8-second timeout handler: Never leave parent stuck in "Connecting..."!
    connectionTimeoutTimerRef.current = window.setTimeout(() => {
      clearConnectionTimers();
      setCameraState('ERROR');
      setCameraStatusMessage(
        'Connection Timeout (8s): Child device did not deliver video frames. Ensure child phone is online and camera is not busy.'
      );
    }, 8000);

    try {
      await onSendCommand('START_CAMERA', { facingMode });
    } catch (err) {
      clearConnectionTimers();
      setCameraState('ERROR');
      setCameraStatusMessage(err instanceof Error ? err.message : 'Command dispatch failed');
    }
  };

  // Handle camera stop
  const handleStopCamera = async () => {
    cameraStoppedByUserRef.current = true;
    clearConnectionTimers();
    setCameraState('DISCONNECTED');
    setCameraStatusMessage('Camera stopped and resources released');
    setRemoteFrameUrl(null);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
    closeParentPeerConnection();
    try {
      await onSendCommand('STOP_CAMERA');
    } catch {
      // ignore
    }
  };

  // Handle Voice Start (initializes AudioContext under user click gesture)
  const handleStartAudio = async () => {
    setMicStatusMessage('Connecting to child microphone...');
    setAudioState('CONNECTING');
    // Initialize Web Audio playback engine during user click
    audioPlayerRef.current.init();

    try {
      await onSendCommand('START_AUDIO');
    } catch (err) {
      setAudioState('ERROR');
      setMicStatusMessage(err instanceof Error ? err.message : 'Failed to start microphone');
    }
  };

  // Handle Voice Stop
  const handleStopAudio = async () => {
    setAudioState('DISCONNECTED');
    setMicStatusMessage('Stopping audio...');
    audioPlayerRef.current.stop();
    try {
      await onSendCommand('STOP_AUDIO');
    } catch {
      // ignore
    }
  };

  // Handle Flashlight toggle
  const handleToggleFlashlight = async () => {
    setFlashNotice(null);

    // Safety rule: Flash only works with Rear Camera
    const activeFacing = device.activeCameraFacing || remoteFacing;
    if (cameraState === 'STREAMING' && activeFacing === 'user') {
      setFlashNotice('Flash is only available on Rear Camera. Please switch to Rear Camera first.');
      setTimeout(() => setFlashNotice(null), 4000);
      return;
    }

    if (flashState === 'ON') {
      setFlashState('TURNING_OFF');
      await onSendCommand('FLASHLIGHT_OFF');
    } else {
      setFlashState('TURNING_ON');
      await onSendCommand('FLASHLIGHT_ON');
    }
  };

  const renderPermissionBadge = (perm: string | undefined) => {
    if (perm === 'granted') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200/80">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Allowed
        </span>
      );
    }
    if (perm === 'denied') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full font-bold border border-rose-200/80">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          Denied
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold border border-amber-200/80">
        <AlertCircle className="w-3 h-3 text-amber-600" />
        Permission Required
      </span>
    );
  };

  const isCameraAllowed = device.permissions.camera === 'granted';
  const isAudioAllowed = device.permissions.microphone === 'granted';
  const isCameraStreaming = cameraState === 'STREAMING';
  const isCameraConnecting = cameraState === 'CONNECTING';
  const isAudioListening = audioState === 'LISTENING';
  const isAudioConnecting = audioState === 'CONNECTING';
  const currentFacing = device.activeCameraFacing || remoteFacing;

  return (
    <div className="space-y-4">
      {/* MODE SELECTOR HEADER: VIDEO MODE vs VOICE MODE vs SCREEN MIRROR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-3xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
          {/* 📹 VIDEO MODE TAB */}
          <button
            onClick={() => setActiveMode('VIDEO')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMode === 'VIDEO'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>VIDEO MODE</span>
            {isCameraStreaming && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* 🎙️ VOICE MODE TAB */}
          <button
            onClick={() => setActiveMode('VOICE')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMode === 'VOICE'
                ? 'bg-violet-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>VOICE MODE</span>
            {isAudioListening && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* 📱 SCREEN TAB */}
          <button
            onClick={() => setActiveMode('SCREEN')}
            className={`flex-1 sm:flex-initial py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeMode === 'SCREEN'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>SCREEN</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-right">
          <span className="text-[11px] font-medium text-slate-500">Active Service:</span>
          {activeMode === 'VIDEO' ? (
            <span
              className={`text-xs font-bold ${
                isCameraStreaming
                  ? 'text-emerald-600'
                  : isCameraConnecting
                  ? 'text-amber-600'
                  : 'text-slate-600'
              }`}
            >
              Camera {isCameraStreaming ? 'Live' : cameraState}
            </span>
          ) : activeMode === 'VOICE' ? (
            <span
              className={`text-xs font-bold ${
                isAudioListening
                  ? 'text-emerald-600'
                  : isAudioConnecting
                  ? 'text-amber-600'
                  : 'text-slate-600'
              }`}
            >
              Audio {isAudioListening ? 'Listening Active' : audioState}
            </span>
          ) : (
            <span className="text-xs font-bold text-indigo-600">Screen Projection</span>
          )}
        </div>
      </div>

      {/* ========================================================
          MODE 1: VIDEO MODE (Live Video + In-Screen Controls + Mic Toggle)
          ======================================================== */}
      {activeMode === 'VIDEO' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4 animate-in fade-in duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                  isCameraStreaming
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-200 animate-pulse'
                    : isCameraConnecting
                    ? 'bg-amber-500 text-white shadow-md animate-bounce'
                    : cameraState === 'ERROR'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-purple-50 text-purple-700'
                }`}
              >
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">VIDEO MONITORING</h4>
                <p className="text-xs text-slate-500">Live Camera Stream with Audio &amp; Flash Controls</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-medium mb-1">
                Camera:{' '}
                <span
                  className={
                    cameraState === 'STREAMING'
                      ? 'text-emerald-600 font-bold'
                      : cameraState === 'CONNECTED'
                      ? 'text-blue-600 font-bold'
                      : cameraState === 'CONNECTING'
                      ? 'text-amber-600 font-bold'
                      : cameraState === 'ERROR'
                      ? 'text-rose-600 font-bold'
                      : 'text-slate-500'
                  }
                >
                  {cameraState === 'STREAMING'
                    ? `STREAMING (${currentFacing === 'environment' ? 'REAR' : 'FRONT'})`
                    : cameraState === 'CONNECTED'
                    ? 'CONNECTED'
                    : cameraState === 'CONNECTING'
                    ? 'CONNECTING...'
                    : cameraState === 'ERROR'
                    ? 'ERROR'
                    : 'DISCONNECTED'}
                </span>
              </div>
              {renderPermissionBadge(device.permissions.camera)}
            </div>
          </div>

          {/* Flash Notice Banner if displayed */}
          {flashNotice && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 animate-in fade-in">
              <Flashlight className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{flashNotice}</span>
            </div>
          )}

          {/* LIVE VIDEO SCREEN CONTAINER */}
          <div className="h-72 sm:h-80 bg-slate-950 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center border border-slate-800 shadow-inner group">
            {/* If Connected & Video Active: Display Real Video Stream / Real Frames */}
            {isCameraStreaming ? (
              <>
                {/* Direct local video element if track is accessible in runner */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${
                    remoteFrameUrl ? 'hidden' : 'block'
                  }`}
                />

                {/* Real broadcasted frames from Child phone */}
                {remoteFrameUrl && (
                  <img
                    src={remoteFrameUrl}
                    alt="Live Child Camera Stream"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {/* Top Video Badges Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      LIVE STREAM
                    </div>
                    <span className="bg-slate-900/85 backdrop-blur-xs text-purple-200 text-[10px] font-mono px-2.5 py-1 rounded-full border border-purple-500/30">
                      {currentFacing === 'environment' ? '📷 Rear Camera' : '📷 Front Camera'}
                    </span>
                  </div>

                  {/* Audio Status pill on Video screen */}
                  {isAudioListening ? (
                    <div className="flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm animate-in fade-in">
                      <Volume2 className="w-3 h-3 animate-pulse" />
                      <span>MIC AUDIO ON (~{audioLevel} dB)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-xs text-slate-300 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-700/50">
                      <VolumeX className="w-3 h-3 text-slate-400" />
                      <span>Audio Muted</span>
                    </div>
                  )}
                </div>

                {/* Bottom Overlay Controls & Status */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
                  <span className="text-[10px] text-emerald-400 bg-slate-950/85 backdrop-blur-xs px-2.5 py-1 rounded-lg font-mono flex items-center gap-1 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Connected • 12 FPS
                  </span>

                  {/* Lens Switch button directly on preview */}
                  <button
                    onClick={() =>
                      handleStartCamera(currentFacing === 'environment' ? 'user' : 'environment')
                    }
                    className="text-[11px] font-bold bg-white/20 hover:bg-white/30 text-white backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Switch to {currentFacing === 'environment' ? 'Front' : 'Rear'}
                  </button>
                </div>
              </>
            ) : isCameraConnecting || cameraState === 'CONNECTED' ? (
              /* Connecting State with explicit Countdown timer */
              <div className="text-center p-4 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-purple-950 border border-purple-800 flex items-center justify-center mx-auto text-purple-300">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
                <div>
                  <p className="text-white text-xs font-bold">
                    {cameraState === 'CONNECTED'
                      ? 'Camera Open • Receiving Video Frames...'
                      : 'Connecting to Child Camera...'}
                  </p>
                  <p className="text-purple-300 text-[11px] mt-0.5">{cameraStatusMessage}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-purple-900/60 text-purple-200 text-[10px] font-mono border border-purple-700/50">
                    Timeout in {countdownSeconds}s
                  </span>
                </div>
              </div>
            ) : cameraState === 'ERROR' ? (
              /* Error State with actual message & Retry */
              <div className="text-center p-4 space-y-2 max-w-xs">
                <div className="w-12 h-12 rounded-2xl bg-rose-950 border border-rose-800 flex items-center justify-center mx-auto text-rose-400">
                  <AlertCircle className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <p className="text-rose-300 text-xs font-bold">Camera Connection Failed</p>
                  <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                    {cameraStatusMessage || 'Child device did not deliver video frames within timeout.'}
                  </p>
                </div>
                <button
                  onClick={() => handleStartCamera('user')}
                  className="mt-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-xs"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              /* Inactive / Disconnected State */
              <div className="text-center p-4 space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-slate-200 text-sm font-semibold">Video Stream Inactive</p>
                <p className="text-slate-400 text-xs max-w-xs mx-auto leading-relaxed">
                  Choose <strong>📷 Front Camera</strong> or <strong>📷 Rear Camera</strong> below to start live video stream with optional microphone audio.
                </p>
              </div>
            )}
          </div>

          {/* Permission Notice */}
          {!isCameraAllowed && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Camera Permission Required:</strong> The child phone must allow Camera permission before remote video streaming can begin.
              </span>
            </div>
          )}

          {/* VIDEO MODE CONTROLS:
              📷 Front Camera | 📷 Rear Camera | 🎤 Microphone ON/OFF | 🔦 Flash ON/OFF | ⏹ Stop Camera */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Video &amp; Hardware Controls
            </div>

            {/* Primary Row: Front & Rear Camera */}
            <div className="grid grid-cols-2 gap-2">
              {/* 📷 Front Camera */}
              <button
                onClick={() => handleStartCamera('user')}
                disabled={
                  isCameraConnecting ||
                  !device.isOnline ||
                  !isCameraAllowed ||
                  (isCameraStreaming && currentFacing === 'user')
                }
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isCameraStreaming && currentFacing === 'user'
                    ? 'bg-purple-800 text-white shadow-xs border border-purple-700'
                    : 'bg-purple-700 hover:bg-purple-800 active:scale-98 text-white shadow-xs'
                } disabled:opacity-40 disabled:pointer-events-none`}
              >
                <Camera className="w-4 h-4" />
                <span>
                  {isCameraConnecting && currentFacing === 'user'
                    ? 'Connecting...'
                    : '📷 Front Camera'}
                </span>
              </button>

              {/* 📷 Rear Camera */}
              <button
                onClick={() => handleStartCamera('environment')}
                disabled={
                  isCameraConnecting ||
                  !device.isOnline ||
                  !isCameraAllowed ||
                  (isCameraStreaming && currentFacing === 'environment')
                }
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isCameraStreaming && currentFacing === 'environment'
                    ? 'bg-indigo-800 text-white shadow-xs border border-indigo-700'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white shadow-xs'
                } disabled:opacity-40 disabled:pointer-events-none`}
              >
                <Camera className="w-4 h-4" />
                <span>
                  {isCameraConnecting && currentFacing === 'environment'
                    ? 'Connecting...'
                    : '📷 Rear Camera'}
                </span>
              </button>
            </div>

            {/* Secondary Row: Microphone ON/OFF | Flash ON/OFF | Stop Camera */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* 🎤 Microphone ON / OFF (Audio toggle during video) */}
              <button
                onClick={isAudioListening ? handleStopAudio : handleStartAudio}
                disabled={!device.isOnline || !isAudioAllowed}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                  isAudioListening
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                    : isAudioConnecting
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                } disabled:opacity-40 disabled:pointer-events-none`}
                title="Toggle Child microphone audio during video stream"
              >
                {isAudioListening ? (
                  <>
                    <Volume2 className="w-4 h-4 text-white animate-pulse" />
                    <span>🎤 Microphone ON (Tap to Mute)</span>
                  </>
                ) : isAudioConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    <span>Connecting Audio...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-slate-700" />
                    <span>🎤 Microphone OFF (Turn ON)</span>
                  </>
                )}
              </button>

              {/* 🔦 Flash ON / OFF */}
              <button
                onClick={handleToggleFlashlight}
                disabled={
                  flashState === 'TURNING_ON' ||
                  flashState === 'TURNING_OFF' ||
                  !device.isOnline ||
                  !isCameraAllowed
                }
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                  flashState === 'ON'
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs'
                    : flashState === 'UNSUPPORTED'
                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                    : flashState === 'ERROR'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                } disabled:opacity-40 disabled:pointer-events-none`}
              >
                <Flashlight className="w-4 h-4" />
                <span>
                  {flashState === 'TURNING_ON'
                    ? 'Turning ON...'
                    : flashState === 'TURNING_OFF'
                    ? 'Turning OFF...'
                    : flashState === 'ON'
                    ? '🔦 Flash ON'
                    : flashState === 'UNSUPPORTED'
                    ? 'Flash unavailable'
                    : flashState === 'ERROR'
                    ? '🔦 Flash Error'
                    : '🔦 Flash OFF'}
                </span>
              </button>

              {/* ⏹ Stop Camera */}
              <button
                onClick={handleStopCamera}
                disabled={cameraState === 'DISCONNECTED'}
                className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Square className="w-3.5 h-3.5 fill-slate-700" />
                <span>⏹ Stop Camera</span>
              </button>
            </div>
          </div>

          {/* 10-Step Failure Point & Hardware Diagnostics Pipeline */}
          <PipelineDiagnosticsCard
            mode="VIDEO"
            cameraState={cameraState}
            audioState={audioState}
            flashState={flashState}
            device={device}
            remoteFrameUrl={remoteFrameUrl}
            audioLevel={audioLevel}
            speakerVolume={speakerVolume}
            onVolumeChange={handleVolumeChange}
            cameraStatusMessage={cameraStatusMessage}
            micStatusMessage={micStatusMessage}
          />
        </div>
      )}

      {/* ========================================================
          MODE 2: VOICE / MICROPHONE MODE (Pure Audio - ZERO Video)
          ======================================================== */}
      {activeMode === 'VOICE' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6 animate-in fade-in duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  isAudioListening
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-200 animate-pulse'
                    : isAudioConnecting
                    ? 'bg-amber-500 text-white animate-bounce'
                    : 'bg-violet-50 text-violet-700'
                }`}
              >
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">VOICE / MICROPHONE</h4>
                <p className="text-xs text-slate-500">Live Audio Listening Station (Speaker Output)</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-medium mb-1">
                Audio Channel:{' '}
                <span
                  className={
                    audioState === 'LISTENING'
                      ? 'text-emerald-600 font-bold'
                      : audioState === 'CONNECTED'
                      ? 'text-blue-600 font-bold'
                      : audioState === 'CONNECTING'
                      ? 'text-amber-600 font-bold'
                      : audioState === 'ERROR'
                      ? 'text-rose-600 font-bold'
                      : 'text-slate-500'
                  }
                >
                  {audioState === 'LISTENING'
                    ? 'LISTENING'
                    : audioState === 'CONNECTED'
                    ? 'CONNECTED'
                    : audioState === 'CONNECTING'
                    ? 'CONNECTING...'
                    : audioState === 'ERROR'
                    ? 'ERROR'
                    : 'DISCONNECTED'}
                </span>
              </div>
              {renderPermissionBadge(device.permissions.microphone)}
            </div>
          </div>

          {/* BIG MICROPHONE LISTENING HERO STATION (ZERO Video Elements) */}
          <div className="py-8 px-4 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white border border-slate-800 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-inner">
            {/* Pulsing Acoustic Circles around Big Microphone Icon */}
            <div className="relative mb-5 flex items-center justify-center">
              {isAudioListening && (
                <>
                  <span className="absolute w-44 h-44 rounded-full bg-violet-600/15 animate-ping duration-1000" />
                  <span className="absolute w-36 h-36 rounded-full bg-violet-500/20 animate-pulse duration-700" />
                </>
              )}

              {/* Big Central Microphone Icon */}
              <div
                className={`w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 relative z-10 border-4 ${
                  isAudioListening
                    ? 'bg-gradient-to-tr from-violet-600 to-indigo-500 border-violet-400 text-white shadow-violet-500/40 scale-105'
                    : isAudioConnecting
                    ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                    : audioState === 'ERROR'
                    ? 'bg-rose-900 border-rose-600 text-rose-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {isAudioConnecting ? (
                  <Loader2 className="w-12 h-12 animate-spin text-white" />
                ) : isAudioListening ? (
                  <Mic className="w-12 h-12 text-white animate-pulse" />
                ) : audioState === 'ERROR' ? (
                  <AlertCircle className="w-12 h-12 text-rose-300" />
                ) : (
                  <Mic className="w-12 h-12 text-slate-400" />
                )}
              </div>
            </div>

            {/* Dynamic Real-time Audio Activity Waveform (Only when listening) */}
            {isAudioListening ? (
              <div className="space-y-3 w-full max-w-md animate-in fade-in">
                <div className="flex items-center justify-center gap-1.5 bg-violet-600/90 text-white text-xs font-bold px-3 py-1 rounded-full mx-auto shadow-sm w-fit">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  LIVE MICROPHONE STREAM ACTIVE
                </div>

                {/* 12-bar equalizer reacting to real sound */}
                <div className="flex items-center gap-1.5 h-16 w-full justify-center px-4">
                  {[20, 42, 60, 85, 95, 70, 45, 80, 90, 60, 35, 20].map((baseH, i) => (
                    <div
                      key={i}
                      className="w-2.5 bg-gradient-to-t from-violet-600 via-indigo-400 to-emerald-400 rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(10, (baseH * Math.max(audioLevel, 14)) / 100)}px`,
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-violet-300 font-medium">
                  <Volume2 className="w-4 h-4 animate-bounce text-violet-400" />
                  <span>
                    Sound Playing on Speaker • Volume: <strong>~{audioLevel} dB</strong>
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 font-mono">
                  AudioRecord • 48kHz PCM Opus • Low-Latency Stream
                </p>
              </div>
            ) : isAudioConnecting ? (
              <div className="space-y-1.5">
                <p className="text-white text-sm font-bold">Connecting to Child Microphone...</p>
                <p className="text-purple-300 text-xs">{micStatusMessage || 'Awaiting audio channel...'}</p>
              </div>
            ) : audioState === 'ERROR' ? (
              <div className="space-y-2 max-w-xs">
                <p className="text-rose-300 text-sm font-bold">Microphone Audio Failed</p>
                <p className="text-slate-400 text-xs">{micStatusMessage || 'Audio permission denied or device busy'}</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-w-xs">
                <p className="text-slate-200 text-sm font-semibold">Microphone is Disconnected</p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Tap <strong>Start Listening</strong> below to stream live audio from your child's phone to this device.
                </p>
              </div>
            )}
          </div>

          {/* Status & Connection Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-slate-400 text-[10px] font-medium">AUDIO STATUS</div>
              <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAudioListening
                      ? 'bg-emerald-500 animate-ping'
                      : isAudioConnecting
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span>{audioState}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-slate-400 text-[10px] font-medium">SPEAKER OUTPUT</div>
              <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-violet-600" />
                <span>{isAudioListening ? 'Playing (Speaker)' : 'Muted'}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
              <div className="text-slate-400 text-[10px] font-medium">MIC PERMISSION</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {isAudioAllowed ? (
                  <span className="text-emerald-700">✅ Allowed</span>
                ) : (
                  <span className="text-amber-700">❌ Required</span>
                )}
              </div>
            </div>
          </div>

          {/* Permission Notice */}
          {!isAudioAllowed && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Microphone Permission Required:</strong> The child phone must allow Microphone permission in the Permission Center before remote audio can be streamed.
              </span>
            </div>
          )}

          {/* Action Buttons: ▶ Start Listening | ⏹ Stop Listening */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={handleStartAudio}
              disabled={
                isAudioListening ||
                isAudioConnecting ||
                !device.isOnline ||
                !isAudioAllowed
              }
              className="py-3.5 px-4 rounded-2xl text-xs font-bold bg-violet-700 hover:bg-violet-800 active:scale-98 text-white transition-all flex items-center justify-center gap-2 shadow-md shadow-violet-200 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isAudioConnecting ? 'Connecting...' : '▶ Start Listening'}</span>
            </button>

            <button
              onClick={handleStopAudio}
              disabled={audioState === 'DISCONNECTED'}
              className="py-3.5 px-4 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Square className="w-4 h-4 fill-slate-700" />
              <span>⏹ Stop Listening</span>
            </button>
          </div>

          {/* 10-Step Failure Point & Hardware Diagnostics Pipeline */}
          <PipelineDiagnosticsCard
            mode="VOICE"
            cameraState={cameraState}
            audioState={audioState}
            flashState={flashState}
            device={device}
            remoteFrameUrl={remoteFrameUrl}
            audioLevel={audioLevel}
            speakerVolume={speakerVolume}
            onVolumeChange={handleVolumeChange}
            cameraStatusMessage={cameraStatusMessage}
            micStatusMessage={micStatusMessage}
          />
        </div>
      )}

      {/* ========================================================
          MODE 3: SCREEN MIRRORING (Android MediaProjection)
          ======================================================== */}
      {activeMode === 'SCREEN' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  device.screenStreaming
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 animate-pulse'
                    : 'bg-indigo-50 text-indigo-700'
                }`}
              >
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">SCREEN MIRRORING</h4>
                <p className="text-xs text-slate-500">Android MediaProjection Service</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium mb-1">
                Status:{' '}
                <span
                  className={
                    device.screenStreaming ? 'text-emerald-600 font-bold' : 'text-slate-500'
                  }
                >
                  {device.screenStreaming ? 'MIRRORING' : 'DISCONNECTED'}
                </span>
              </div>
              {renderPermissionBadge(device.permissions.screenCapture)}
            </div>
          </div>

          {/* Screen preview display */}
          <div className="h-52 bg-slate-950 rounded-2xl overflow-hidden relative flex items-center justify-center border border-slate-800">
            {device.screenStreaming ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-3 relative">
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-indigo-600/90 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  LIVE SCREEN
                </div>
                <div className="w-14 h-24 border-2 border-indigo-400 rounded-xl flex flex-col items-center justify-between p-1 bg-slate-900 shadow-inner">
                  <div className="w-4 h-0.5 bg-slate-700 rounded-full" />
                  <Monitor className="w-6 h-6 text-indigo-400 animate-pulse" />
                  <div className="w-2 h-2 rounded-full border border-slate-600" />
                </div>
                <p className="text-slate-300 text-xs font-semibold mt-2">
                  Child Screen Projection Active
                </p>
                <span className="text-[10px] text-slate-500">
                  Connection: Online • User Granted MediaProjection
                </span>
              </div>
            ) : (
              <div className="text-center p-4 space-y-1.5">
                <Monitor className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-xs font-medium">Screen capture is inactive</p>
                <p className="text-slate-600 text-[10px] max-w-xs mx-auto">
                  Requires user explicit Android system prompt consent on child phone.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => onSendCommand('START_SCREEN')}
              disabled={
                isLoadingCommand === 'START_SCREEN' ||
                device.screenStreaming ||
                !device.isOnline
              }
              className="py-2.5 px-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {isLoadingCommand === 'START_SCREEN' ? 'Requesting...' : 'Start Mirroring'}
            </button>
            <button
              onClick={() => onSendCommand('STOP_SCREEN')}
              disabled={isLoadingCommand === 'STOP_SCREEN' || !device.screenStreaming}
              className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {isLoadingCommand === 'STOP_SCREEN' ? 'Stopping...' : 'Stop Mirroring'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
