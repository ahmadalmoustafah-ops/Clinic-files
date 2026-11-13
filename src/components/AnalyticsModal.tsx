import React from 'react';
import { X, BarChart3, TrendingUp, Users, Calendar, Award } from 'lucide-react';
import { PatientRecord } from '../types';
import { ClinicAnalytics } from './ClinicAnalytics';
import { useLanguage } from '../context/LanguageContext';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: PatientRecord[];
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  patients,
}) => {
  const { t, isRTL } = useLanguage();

  if (!isOpen) return null;

  // Quick summary counts
  const totalFollowUps = patients.reduce(
    (acc, p) => acc + (p.followUps ? p.followUps.length : 0),
    0
  );
  const totalImages = patients.reduce(
    (acc, p) =>
      acc +
      (p.images ? p.images.length : 0) +
      (p.followUps
        ? p.followUps.reduce((fAcc, f) => fAcc + (f.images ? f.images.length : 0), 0)
        : 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-700 to-teal-700 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                {t.analyticsIcon}
              </h2>
              <p className="text-xs text-sky-100">
                {t.analyticsModalSubtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title={t.closeAnalytics}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Quick Metrics Bar inside Analytics Modal */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-sky-50 dark:bg-sky-950/50 border border-sky-100 dark:border-sky-900/60 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-sky-600 text-white rounded-xl">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.totalPatients}
                </span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {patients.length}
                </span>
              </div>
            </div>

            <div className="bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900/60 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-teal-600 text-white rounded-xl">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.followUpsStat}
                </span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {totalFollowUps}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900/60 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-amber-600 text-white rounded-xl">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.imagesStat}
                </span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {totalImages}
                </span>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-100 dark:border-purple-900/60 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-purple-600 text-white rounded-xl">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.steadyGrowth}
                </span>
                <span className="text-base font-bold text-purple-600 dark:text-purple-300 font-mono">
                  +18%
                </span>
              </div>
            </div>
          </div>

          {/* Growth Chart & Demographics Donut Chart */}
          <ClinicAnalytics patients={patients} />
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>{t.analyticsDataLocalNotice}</span>
          </p>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
