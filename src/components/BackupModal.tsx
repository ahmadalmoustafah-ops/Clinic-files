import React, { useRef, useState, useEffect } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  Database,
  Check,
  AlertTriangle,
  X,
  Clock,
  FileCheck2,
  HardDrive,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../context/LanguageContext';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
  isFullScreenView?: boolean;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
}) => {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [stats, setStats] = useState({
    patientCount: 0,
    followUpCount: 0,
    imageCount: 0,
    appointmentCount: 0,
    lastBackupDate: null as string | null,
  });

  const [importPreview, setImportPreview] = useState<{
    rawJson: string;
    exportDate?: string;
    patientCount: number;
    appointmentCount: number;
    appName?: string;
  } | null>(null);

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isProcessing, setIsProcessing] = useState(false);
  const [localDbInfo, setLocalDbInfo] = useState<{
    connected: boolean;
    driver: string;
    patientsCount: number;
    appointmentsCount: number;
    sizeFormatted: string;
    storagePath: string;
    lastUpdated: string;
  } | null>(null);

  const [autoBackupInfo, setAutoBackupInfo] = useState({
    enabled: false,
    lastAutoBackupDate: null as string | null,
    count: 0,
    hasSnapshot: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    try {
      const s = await StorageService.getBackupStats();
      setStats(s);
      const dbInfo = StorageService.getLocalDatabaseInfo();
      setLocalDbInfo(dbInfo);
      setAutoBackupInfo(StorageService.getAutoBackupInfo());
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAutoBackup = () => {
    const next = !autoBackupInfo.enabled;
    StorageService.setAutoBackupEnabled(next);
    setAutoBackupInfo(StorageService.getAutoBackupInfo());
    window.dispatchEvent(new CustomEvent('easy-clinic-autobackup-changed'));
  };

  const handleDownloadLatestAutoSnapshot = () => {
    const json = StorageService.getLastAutoBackupSnapshot();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    a.href = url;
    a.download = `Easy_clinic_auto_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsSuccess(true);
    setStatus(t.toastBackupExportSuccess);
  };

  const handleForceSync = async () => {
    try {
      setIsProcessing(true);
      await StorageService.syncCurrentUserStorage();
      await loadStats();
      setIsSuccess(true);
      setStatus(t.syncSuccessToast);
    } catch {
      setIsSuccess(false);
      setStatus('Failed to sync local storage');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStats();
      setStatus(null);
      setImportPreview(null);

      const onAutoBackupCompleted = () => {
        loadStats();
      };
      window.addEventListener('easy-clinic-autobackup-completed', onAutoBackupCompleted);
      return () => {
        window.removeEventListener('easy-clinic-autobackup-completed', onAutoBackupCompleted);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      const json = await StorageService.exportBackup();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${now.getHours()}-${now.getMinutes()}`;
      a.href = url;
      a.download = `Easy_clinic_backup_${dateStr}_${timeStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsSuccess(true);
      setStatus(t.toastBackupExportSuccess);
      await loadStats();
    } catch {
      setIsSuccess(false);
      setStatus(language === 'ar' ? 'حدث خطأ أثناء إنشاء وتنزيل النسخة الاحتياطية.' : 'Error generating backup file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.patients || !Array.isArray(parsed.patients)) {
          setIsSuccess(false);
          setStatus(
            language === 'ar'
              ? 'الملف المحدد غير صالح أو لا يحتوي على سجلات مرضى خاصة بتطبيق Easy clinic.'
              : 'Invalid backup file for Easy clinic.'
          );
          setImportPreview(null);
          return;
        }

        setImportPreview({
          rawJson: content,
          exportDate: parsed.exportDate,
          patientCount: parsed.patients.length,
          appointmentCount: Array.isArray(parsed.appointments) ? parsed.appointments.length : 0,
          appName: parsed.app || 'Easy clinic',
        });
        setStatus(null);
      } catch {
        setIsSuccess(false);
        setStatus(
          language === 'ar'
            ? 'تعذر قراءة الملف. تأكد من أنه ملف JSON سليم تم تصديره سابقاً من التطبيق.'
            : 'Could not read file. Ensure it is a valid Easy clinic JSON backup.'
        );
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;

    if (
      importMode === 'replace' &&
      !window.confirm(
        language === 'ar'
          ? 'تنبيه مهم: وضع "الاستبدال الكامل" سيقوم بحذف كافة السجلات الحالية على هذا الجهاز واستبدالها بالنسخة المسترجعة. هل أنت متأكد؟'
          : 'Warning: Replace mode will wipe all current local records and overwrite with this backup. Proceed?'
      )
    ) {
      return;
    }

    try {
      setIsProcessing(true);
      const res = await StorageService.importBackup(importPreview.rawJson, importMode);
      if (res.success) {
        setIsSuccess(true);
        setStatus(
          language === 'ar'
            ? `تمت استعادة النسخة الاحتياطية بنجاح! تم استرجاع (${res.importedPatients}) ملف مريض، و(${res.importedAppointments}) موعد.`
            : `Backup restored successfully! Migrated (${res.importedPatients}) patients and (${res.importedAppointments}) visits.`
        );
        setImportPreview(null);
        await loadStats();
        onDataRestored();
      } else {
        setIsSuccess(false);
        setStatus(res.message || 'Failed to restore backup.');
      }
    } catch (e: any) {
      setIsSuccess(false);
      setStatus(e.message || 'Error restoring data.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return t.neverBackedUp;
    const d = new Date(iso);
    return `${d.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')} - ${d.toLocaleTimeString(
      language === 'ar' ? 'ar-EG' : 'en-US',
      { hour: '2-digit', minute: '2-digit' }
    )}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150 my-auto text-slate-900 dark:text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-300 rounded-2xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {t.backupModalTitle}
              </h2>
              <p className="text-xs text-slate-400">{t.backupModalSubtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Local Storage Database Active Status Box */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-300 dark:border-emerald-800 rounded-3xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  {t.localDatabaseTitle}
                </h3>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{t.localDbConnectedBadge}</span>
                </p>
              </div>
            </div>

            <button
              onClick={handleForceSync}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
              title={t.forceSyncBtn}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{t.forceSyncBtn}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
            <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
              <span className="text-[10px] text-slate-400 block">{t.localDbEngineLabel}</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">Local storage & IndexedDB</span>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
              <span className="text-[10px] text-slate-400 block">{t.localDbSizeLabel}</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                {localDbInfo?.sizeFormatted || '12.4 KB'}
              </span>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-400 block">{t.lastBackupTime}</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                {localDbInfo?.lastUpdated || 'الآن'}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 px-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t.localDbPrivacyBadge}</span>
          </div>
        </div>


        {/* Current Database Stats */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-3.5 mb-4">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
            {t.currentDbContents}
          </span>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400 block">{t.patientsStat}</span>
              <span className="text-sm font-bold font-mono text-sky-600">
                {stats.patientCount}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400 block">{t.followUpsStat}</span>
              <span className="text-sm font-bold font-mono text-teal-600">
                {stats.followUpCount}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400 block">{t.imagesStat}</span>
              <span className="text-sm font-bold font-mono text-amber-600">
                {stats.imageCount}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400 block">{t.appointmentsStat}</span>
              <span className="text-sm font-bold font-mono text-purple-600">
                {stats.appointmentCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2.5 px-1">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {t.lastBackupTime} {formatDateTime(stats.lastBackupDate)}
            </span>
          </div>
        </div>

        {/* Status Toast/Alert */}
        {status && (
          <div
            className={`p-3.5 rounded-2xl mb-4 text-xs font-semibold flex items-start gap-2.5 leading-relaxed ${
              isSuccess
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
            }`}
          >
            {isSuccess ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">{status}</div>
          </div>
        )}

        {/* Action 0: Auto-Backup Setting (النسخ الاحتياطي التلقائي) */}
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border transition-colors ${
              autoBackupInfo.enabled
                ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    autoBackupInfo.enabled
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      {t.autoBackupTitle}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        autoBackupInfo.enabled
                          ? 'bg-teal-100 dark:bg-teal-900/70 text-teal-800 dark:text-teal-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {autoBackupInfo.enabled ? t.autoBackupEnabledBadge : t.autoBackupDisabledBadge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {t.autoBackupDesc}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={autoBackupInfo.enabled}
                onClick={handleToggleAutoBackup}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoBackupInfo.enabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                dir="ltr"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                    autoBackupInfo.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {(autoBackupInfo.enabled || autoBackupInfo.count > 0) && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    {t.lastAutoBackupLabel}{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {autoBackupInfo.lastAutoBackupDate
                        ? formatDateTime(autoBackupInfo.lastAutoBackupDate)
                        : t.noAutoBackupYet}
                    </strong>
                  </span>
                  {autoBackupInfo.count > 0 && (
                    <span className="font-mono text-teal-700 dark:text-teal-300 font-semibold">
                      ({t.autoBackupCountLabel} {autoBackupInfo.count})
                    </span>
                  )}
                </div>

                {autoBackupInfo.hasSnapshot && (
                  <button
                    type="button"
                    onClick={handleDownloadLatestAutoSnapshot}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t.downloadLatestAutoBackup}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action 1: Export Complete Backup */}
          <div className="p-4 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold text-sky-950 dark:text-sky-200">
                  {t.exportStepTitle}
                </h3>
              </div>
              <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-1">
                {t.exportStepDesc}
              </p>
            </div>

            <button
              onClick={handleExport}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isProcessing ? t.downloading : t.downloadJsonBtn}</span>
            </button>
          </div>

          {/* Action 2: Restore from Backup File */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {t.restoreStepTitle}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t.restoreStepDesc}
              </p>
            </div>

            {!importPreview ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500 rounded-xl text-center text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/80 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <HardDrive className="w-4 h-4 text-sky-600" />
                <span>{t.selectBackupFileBtn}</span>
              </button>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 rounded-xl p-3.5 space-y-3 animate-in fade-in-50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <FileCheck2 className="w-4 h-4 text-emerald-600" />
                    <span>{t.fileRecognizedSuccess}</span>
                  </div>
                  <button
                    onClick={() => setImportPreview(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                  >
                    {t.chooseAnotherFile}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">{t.backupDateLabel}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {importPreview.exportDate
                        ? new Date(importPreview.exportDate).toLocaleDateString(
                            language === 'ar' ? 'ar-EG' : 'en-US'
                          )
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">{t.fileContentsLabel}</span>
                    <span className="font-semibold text-sky-600">
                      {importPreview.patientCount} {t.patientsStat} · {importPreview.appointmentCount}{' '}
                      {t.appointmentsStat}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    {t.restoreMethodLabel}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('merge')}
                      className={`p-2.5 rounded-xl border text-right transition-all text-xs cursor-pointer ${
                        importMode === 'merge'
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="block font-bold">{t.mergeModeTitle}</span>
                      <span className="text-[10px] opacity-75">{t.mergeModeDesc}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportMode('replace')}
                      className={`p-2.5 rounded-xl border text-right transition-all text-xs cursor-pointer ${
                        importMode === 'replace'
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="block font-bold">{t.replaceModeTitle}</span>
                      <span className="text-[10px] opacity-75">{t.replaceModeDesc}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setImportPreview(null)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>{isProcessing ? t.restoring : t.confirmRestoreBtn}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            {t.encryptedAndPrivate}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
