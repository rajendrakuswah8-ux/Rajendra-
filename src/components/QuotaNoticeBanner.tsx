import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { subscribeQuotaState, FIRESTORE_UPGRADE_URL } from '../firebase';

export const QuotaNoticeBanner: React.FC = () => {
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = subscribeQuotaState((exhausted) => {
      setIsQuotaExhausted(exhausted);
    });
    return () => unsub();
  }, []);

  if (!isQuotaExhausted || dismissed) return null;

  return (
    <aside aria-label="Database Quota Notice" className="bg-amber-500 text-slate-950 px-4 py-2 text-xs border-b border-amber-600 shadow-xs flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-slate-950 font-bold" />
        <span>
          <strong>Firestore Daily Free Write Quota Reached:</strong> The free tier limit (20,000 writes/day on Spark plan) has been reached. Guardian has automatically switched to <strong>Resilient Local Sync Mode</strong> so you can continue testing pairing and device controls without disruption. Quota will reset tomorrow at 00:00 UTC.
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <a
          href={FIRESTORE_UPGRADE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold underline hover:text-slate-800"
        >
          <span>Upgrade in Firebase Console</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-amber-600/30 rounded-md transition-all"
          title="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
