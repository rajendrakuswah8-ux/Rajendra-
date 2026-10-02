import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clock, Smartphone, ShieldCheck, Loader2 } from 'lucide-react';
import { generatePairingCode } from '../services/deviceService';
import { PairingCode } from '../types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChildPaired: (childDeviceId: string) => void;
  guardianName?: string;
  guardianUserId?: string;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  onChildPaired,
  guardianName,
  guardianUserId,
}) => {
  const [pairingData, setPairingData] = useState<PairingCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(600); // 10 minutes

  // Auto-generate code when opened
  useEffect(() => {
    if (isOpen) {
      handleGenerateCode();
    } else {
      setPairingData(null);
    }
  }, [isOpen]);

  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const code = await generatePairingCode(guardianName, guardianUserId);
      setPairingData(code);
      setSecondsRemaining(Math.max(0, Math.floor((code.expiresAt - Date.now()) / 1000)));
    } catch (err) {
      console.error('Failed to generate pairing code:', err);
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (!pairingData) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((pairingData.expiresAt - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingData]);

  // Listen in real-time to the pairing code document and local paired events
  useEffect(() => {
    if (!pairingData?.id) return;

    const handleLocalPaired = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.deviceId) {
        onChildPaired(custom.detail.deviceId);
      }
    };
    window.addEventListener('guardian_device_paired', handleLocalPaired);

    const unsubscribe = onSnapshot(doc(db, 'pairingCodes', pairingData.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PairingCode;
        if (data.isUsed && data.usedByDeviceId) {
          onChildPaired(data.usedByDeviceId);
        }
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('guardian_device_paired', handleLocalPaired);
    };
  }, [pairingData?.id, onChildPaired]);

  if (!isOpen) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyCode = () => {
    if (!pairingData) return;
    navigator.clipboard.writeText(pairingData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-purple-700 to-indigo-800 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Pair Child Device</h3>
              <p className="text-purple-200 text-xs">Temporary 6-Digit Verification Code</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-700">Generating secure pairing token...</p>
            </div>
          ) : pairingData ? (
            <>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-3">
                  Open <strong>Guardian</strong> on your child's phone, select <strong>CHILD DEVICE</strong>, and enter this code:
                </p>

                {/* 6-Digit Code Display */}
                <div className="bg-purple-50/70 border-2 border-purple-200 rounded-2xl p-5 relative group flex items-center justify-center">
                  <span className="text-4xl font-extrabold tracking-[0.35em] text-purple-900 font-mono select-all">
                    {pairingData.code}
                  </span>
                  <button
                    onClick={copyCode}
                    className="absolute right-3 p-2 rounded-xl bg-white shadow-xs border border-purple-100 hover:bg-purple-100/50 text-purple-700 transition-all"
                    title="Copy code"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expiry countdown */}
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {secondsRemaining > 0 ? (
                    <span>
                      Expires in <strong className="text-purple-700 font-mono">{formatTimer(secondsRemaining)}</strong>
                    </span>
                  ) : (
                    <span className="text-rose-600 font-medium">Code expired. Please generate a new code.</span>
                  )}
                </div>
              </div>

              {/* Security badges */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Single-use, expires automatically in 10 minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Never stored as a permanent password</span>
                </div>
              </div>

              {/* Waiting status pill */}
              <div className="flex items-center justify-center gap-2 text-xs text-purple-700 font-medium bg-purple-50 py-2.5 px-4 rounded-xl border border-purple-100/60 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                Waiting for child phone to connect...
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateCode}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all text-center"
                >
                  Generate New Code
                </button>
                <button
                  onClick={onClose}
                  className="py-2.5 px-5 rounded-xl text-xs font-semibold bg-purple-700 hover:bg-purple-800 text-white transition-all text-center"
                >
                  Done
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
