import React, { useState } from 'react';
import { WifiOff, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useLanguage } from '../context/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  // If user is offline, show reassurance that app is 100% functional locally
  if (!isOnline && !dismissed) {
    return (
      <div className="fixed top-3 left-4 right-4 sm:left-auto sm:right-4 z-50 max-w-sm bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-3 rounded-2xl shadow-xl border border-emerald-400/40 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 no-print">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-xl">
            <WifiOff className="w-4 h-4 text-white" />
          </div>
          <div className="text-xs">
            <p className="font-bold flex items-center gap-1">
              <span>{t.offlineWorkingTitle}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
            </p>
            <p className="text-[11px] text-emerald-100 mt-0.5 leading-tight">
              {t.offlineWorkingDesc}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-emerald-100 hover:text-white rounded-lg transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
};

export const OfflineBadge: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold"
      title={t.offlineFeatureTooltip}
    >
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>{t.offlineFeatureBadge}</span>
    </div>
  );
};
