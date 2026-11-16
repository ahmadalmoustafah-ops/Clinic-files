import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserPlus,
  Calendar,
  Users,
  Bell,
  Database,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  PlusCircle,
  FileEdit,
  Languages,
  BarChart3,
  MoreVertical,
  CheckCircle2,
  CalendarDays,
  Award,
  X,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { PatientRecord, Appointment, ViewMode, UserSession } from './types';
import { StorageService } from './services/storageService';
import { AuthService } from './services/authService';
import { SmartSearchBar } from './components/SmartSearchBar';
import { PatientForm, PatientSaveMeta } from './components/PatientForm';
import { AppointmentsCalendar } from './components/AppointmentsCalendar';
import { AndroidFrame } from './components/AndroidFrame';
import { BackupModal } from './components/BackupModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { OfflineIndicator, OfflineBadge } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AuthScreen } from './components/AuthScreen';
import { useLanguage } from './context/LanguageContext';
import { useAppUpdate } from './hooks/useAppUpdate';

export default function App() {
  const { t, isRTL, toggleLanguage } = useLanguage();
  const {
    hasUpdate,
    isChecking: isCheckingUpdate,
    isUpdating,
    checkForUpdates,
    applyUpdate,
  } = useAppUpdate();

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    const existing = AuthService.getCurrentSession();
    StorageService.setActiveUser(existing ? existing.id : null);
    return existing;
  });

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // View Routing State
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [activePatient, setActivePatient] = useState<PatientRecord | null>(null);
  const [autoAddFollowUp, setAutoAddFollowUp] = useState(false);

  // Modals & Menus
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isAboutDesignerOpen, setIsAboutDesignerOpen] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  // Full Day Patient Filter
  const [selectedDayFilter, setSelectedDayFilter] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [customDayDate, setCustomDayDate] = useState<string>('');
  const [appToast, setAppToast] = useState<string | null>(null);

  const showAppToast = (msg: string) => {
    setAppToast(msg);
    setTimeout(() => setAppToast(null), 3800);
  };

  const handleAppUpdateClick = async () => {
    if (isUpdating || isCheckingUpdate) return;
    if (hasUpdate) {
      setIsOptionsMenuOpen(false);
      showAppToast(t.updateAppUpdating);
      await applyUpdate();
      return;
    }

    const result = await checkForUpdates();
    if (result === 'update-available') {
      setIsOptionsMenuOpen(false);
      showAppToast(t.updateAppUpdating);
      await applyUpdate();
    } else if (result === 'offline') {
      setIsOptionsMenuOpen(false);
      showAppToast(t.updateAppOfflineToast);
    } else {
      setIsOptionsMenuOpen(false);
      showAppToast(t.updateAppUpToDateToast);
    }
  };

  // Load strictly isolated data for the active user
  const refreshData = async () => {
    if (!StorageService.getActiveUser()) {
      setPatients([]);
      setAppointments([]);
      setLoading(false);
      return;
    }

    try {
      StorageService.getAppFirstUsedDate();
      const pList = await StorageService.getAllPatients();
      const aList = await StorageService.getAllAppointments();
      setPatients(pList);
      setAppointments(aList);
    } catch (e) {
      console.error('Data load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      StorageService.setActiveUser(currentUser.id);
      refreshData();
    } else {
      StorageService.setActiveUser(null);
      setPatients([]);
      setAppointments([]);
      setLoading(false);
    }
  }, [currentUser?.id]);

  const handleAuthenticated = (session: UserSession) => {
    StorageService.setActiveUser(session.id);
    setViewMode('home');
    setActivePatient(null);
    setSelectedDayFilter('today');
    setCurrentUser(session);
  };

  const handleLogout = () => {
    AuthService.logout();
    StorageService.setActiveUser(null);
    setIsOptionsMenuOpen(false);
    setIsBackupOpen(false);
    setIsAnalyticsOpen(false);
    setIsAboutDesignerOpen(false);
    setActivePatient(null);
    setViewMode('home');
    setPatients([]);
    setAppointments([]);
    setCurrentUser(null);
  };

  // Tomorrow's appointments check for advance reminder notification
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const activeDate = selectedDayFilter === 'today'
    ? todayStr
    : selectedDayFilter === 'yesterday'
      ? yesterdayStr
      : customDayDate || todayStr;

  // Compute Full Day Patients list
  const dayPatients = useMemo(() => {
    if (selectedDayFilter === 'all') {
      return patients.map((p) => ({
        patient: p,
        isNewExamOnDay: false,
        isFollowUpOnDay: false,
        followUpCountOnDay: 0,
      }));
    }

    return patients
      .map((p) => {
        const isNewExamOnDay =
          p.examDate === activeDate ||
          (p.createdAt ? p.createdAt.startsWith(activeDate) : false);
        const matchingFollowUps = (p.followUps || []).filter(
          (f) => f.date === activeDate || (f.date && f.date.includes(activeDate))
        );
        const isFollowUpOnDay = matchingFollowUps.length > 0;
        return {
          patient: p,
          isNewExamOnDay,
          isFollowUpOnDay,
          followUpCountOnDay: matchingFollowUps.length,
        };
      })
      .filter((item) => item.isNewExamOnDay || item.isFollowUpOnDay);
  }, [patients, selectedDayFilter, activeDate]);

  // Today's Patients count for quick stats card
  const todayPatientsCount = useMemo(() => {
    return patients.filter((p) => {
      const isNewToday =
        p.examDate === todayStr ||
        (p.createdAt ? p.createdAt.startsWith(todayStr) : false);
      const hasFollowUpToday = (p.followUps || []).some(
        (f) => f.date === todayStr || (f.date && f.date.includes(todayStr))
      );
      return isNewToday || hasFollowUpToday;
    }).length;
  }, [patients, todayStr]);

  const tomorrowAppointments = appointments.filter(
    (a) => a.date === tomorrowStr && a.status !== 'cancelled'
  );
  const todayAppointments = appointments.filter(
    (a) => a.date === todayStr && a.status !== 'cancelled'
  );

  // Patient Actions
  const handleOpenPatient = (
    patientId: string,
    action: 'view' | 'add-followup' | 'new-consultation' = 'view'
  ) => {
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setActivePatient(found);
      setAutoAddFollowUp(action === 'add-followup');
      setViewMode('patient-form');
    }
  };

  const handleNewPatient = () => {
    setActivePatient(null);
    setAutoAddFollowUp(false);
    setViewMode('patient-form');
  };

  const triggerJsonDownload = (json: string, fileName: string) => {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSavePatient = async (savedPatient: PatientRecord, meta?: PatientSaveMeta) => {
    const isNewCreation =
      meta?.isNewCreation ?? !patients.some((p) => p.id === savedPatient.id);

    await StorageService.savePatient(savedPatient);
    await refreshData();
    setActivePatient(savedPatient);

    const autoBackupEnabled = StorageService.isAutoBackupEnabled();

    if (isNewCreation && autoBackupEnabled) {
      try {
        const backupResult = await StorageService.performAutoBackup();
        const delayMs = meta?.source === 'save' ? 450 : 50;
        setTimeout(() => {
          triggerJsonDownload(backupResult.json, backupResult.fileName);
        }, delayMs);

        if (meta?.source === 'back') {
          showAppToast(`${t.toastAutoSavedOnBack} · ${t.toastAutoBackupSuccess}`);
        } else {
          showAppToast(t.toastAutoBackupSuccess);
        }
        return;
      } catch (err) {
        console.error('Auto-backup failed:', err);
      }
    }

    if (meta?.source === 'back') {
      showAppToast(t.toastAutoSavedOnBack);
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    await StorageService.deletePatient(patientId);
    await refreshData();
    setViewMode('home');
    setActivePatient(null);
  };

  // Appointment Actions
  const handleSaveAppointment = async (app: Appointment) => {
    await StorageService.saveAppointment(app);
    await refreshData();
  };

  const handleDeleteAppointment = async (id: string) => {
    await StorageService.deleteAppointment(id);
    await refreshData();
  };

  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  if (!currentUser) {
    return (
      <AndroidFrame>
        <OfflineIndicator />
        <AuthScreen onAuthenticated={handleAuthenticated} />
      </AndroidFrame>
    );
  }

  return (
    <AndroidFrame>
      {/* Offline Toast Reassurance */}
      <OfflineIndicator />

      {/* App Auto-Save / Auto-Backup Toast */}
      {appToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200 max-w-[90%] text-center">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{appToast}</span>
        </div>
      )}

      {/* View Router */}
      {viewMode === 'patient-form' && (
        <PatientForm
          initialPatient={activePatient}
          onSave={handleSavePatient}
          onDelete={handleDeletePatient}
          onBack={() => setViewMode('home')}
          autoAddFollowUp={autoAddFollowUp}
        />
      )}

      {viewMode === 'calendar' && (
        <AppointmentsCalendar
          appointments={appointments}
          patients={patients}
          onSaveAppointment={handleSaveAppointment}
          onDeleteAppointment={handleDeleteAppointment}
          onBack={() => setViewMode('home')}
          onOpenPatient={(pId) => handleOpenPatient(pId, 'view')}
        />
      )}

      {viewMode === 'home' && (
        <div className="flex flex-col min-h-full pb-20 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          {/* Main Top Header - Android App Bar with 3-Dots Menu in Top-Left Corner */}
          <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-xs">
            {/* Clinic Brand & Title */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight font-sans">
                    {t.appName}
                  </h1>
                  <OfflineBadge />
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                  {currentUser.fullName} · {t.appSubtitle}
                </p>
              </div>
            </div>

            {/* Top-Left Corner: 3-Dots Overflow Menu (خيارات مختصرة بثلاث نقط في الزاوية اليسرى) */}
            <div className="relative" ref={optionsMenuRef}>
              <button
                onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                className="relative p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs active:scale-95"
                title={t.moreOptionsMenu}
                aria-label={t.moreOptionsMenu}
              >
                <MoreVertical className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                {hasUpdate && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"
                    aria-label={t.updateAppAvailableBadge}
                  />
                )}
              </button>

              {/* Condensed 3-Dots Dropdown Options Menu */}
              {isOptionsMenuOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOptionsMenuOpen(false)}
                  />

                  <div
                    className={`absolute top-full mt-2 ${
                      isRTL ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
                    } z-50 w-64 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2 animate-in fade-in zoom-in-95 duration-150 overflow-hidden`}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {t.optionsMenuTitle}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-full">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          {t.authPrivateVaultLabel}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1">
                        {currentUser.fullName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate" dir="ltr">
                        {currentUser.displayIdentifier}
                      </p>
                    </div>

                    {/* Option 1: Statistics (الإحصائية) */}
                    <button
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        setIsAnalyticsOpen(true);
                      }}
                      className="w-full px-4 py-3 text-xs text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-3 transition-colors cursor-pointer text-start"
                    >
                      <div className="p-1.5 bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 rounded-xl">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold block">{t.analyticsIcon}</span>
                        <span className="text-[10px] text-slate-400 block">{t.liveAnalysis}</span>
                      </div>
                    </button>

                    {/* Option 2: Local Storage Database & Backup (قاعدة البيانات المحلية) */}
                    <button
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        setIsBackupOpen(true);
                      }}
                      className="w-full px-4 py-3 text-xs text-slate-800 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/60 hover:text-teal-600 dark:hover:text-teal-400 flex items-center gap-3 transition-colors cursor-pointer text-start border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <div className="p-1.5 bg-teal-100 dark:bg-teal-900/60 text-teal-600 dark:text-teal-400 rounded-xl">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold block">{t.localDatabaseTitle}</span>
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 block font-semibold">{t.localDbConnectedBadge}</span>
                      </div>
                    </button>

                    {/* Option 3: Language Toggle (العربية / English) */}
                    <button
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        toggleLanguage();
                      }}
                      className="w-full px-4 py-3 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors cursor-pointer text-start border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl">
                        <Languages className="w-4 h-4 text-sky-600" />
                      </div>
                      <div>
                        <span className="font-bold block">{t.toggleLanguage}</span>
                        <span className="text-[10px] text-slate-400 block">Switch / تبديل اللغة</span>
                      </div>
                    </button>

                    {/* Option 4: App Live Update Button (تحديث التطبيق) */}
                    <button
                      onClick={handleAppUpdateClick}
                      disabled={isCheckingUpdate || isUpdating}
                      className={`w-full px-4 py-3 text-xs flex items-center gap-3 transition-colors cursor-pointer text-start border-t border-slate-100 dark:border-slate-800/60 disabled:opacity-60 ${
                        hasUpdate
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                          : 'text-slate-800 dark:text-slate-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40'
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-xl shrink-0 ${
                          hasUpdate
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${
                            isCheckingUpdate || isUpdating ? 'animate-spin' : ''
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold block">{t.updateAppTitle}</span>
                          {hasUpdate && (
                            <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
                              {t.updateAppAvailableBadge}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] block leading-snug ${
                            hasUpdate
                              ? 'text-emerald-700 dark:text-emerald-300 font-semibold'
                              : 'text-slate-400'
                          }`}
                        >
                          {isUpdating
                            ? t.updateAppUpdating
                            : isCheckingUpdate
                            ? t.updateAppChecking
                            : hasUpdate
                            ? t.updateAppAvailableDesc
                            : t.updateAppCheckDesc}
                        </span>
                      </div>
                    </button>

                    {/* Option 5: PWA Install Button */}
                    <div className="px-3">
                      <PWAInstallButton />
                    </div>

                    {/* Option 6: Sign Out / Switch Account */}
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-3 transition-colors cursor-pointer text-start border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <div className="p-1.5 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold block truncate">{t.logoutTitle}</span>
                        <span className="text-[10px] text-rose-500/80 dark:text-rose-400/80 block truncate">
                          {t.logoutDesc}
                        </span>
                      </div>
                    </button>

                    {/* Option 7 (End of menu): About the Designer (لمحة عن المصمم) */}
                    <button
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        setIsAboutDesignerOpen(true);
                      }}
                      className="w-full px-4 py-3 text-xs bg-gradient-to-r from-sky-50/80 to-teal-50/80 dark:from-sky-950/40 dark:to-teal-950/40 hover:from-sky-100 hover:to-teal-100 dark:hover:from-sky-900/50 dark:hover:to-teal-900/50 text-slate-800 dark:text-slate-200 flex items-center gap-3 transition-colors cursor-pointer text-start border-t border-slate-200/80 dark:border-slate-800 mt-1"
                    >
                      <div className="p-1.5 bg-gradient-to-br from-sky-600 to-teal-600 text-white rounded-xl shadow-xs shrink-0">
                        <Award className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 block">
                          {t.aboutDesignerLabel}
                        </span>
                        <span className="font-bold block text-slate-900 dark:text-white truncate">
                          {t.designerName}
                        </span>
                        <span className="text-[10px] text-teal-700 dark:text-teal-300 font-semibold block truncate">
                          {t.designerSpecialty}
                        </span>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>

          <main className="p-4 space-y-4 max-w-4xl mx-auto w-full flex-1">
            {/* 1. TOP SMART SEARCH BAR */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 px-1">
                {t.searchResults}
              </label>
              <SmartSearchBar
                patients={patients}
                onOpenPatient={handleOpenPatient}
                onNewPatient={handleNewPatient}
              />
            </div>

            {/* 2. ADVANCE REMINDER BANNER FOR TOMORROW'S APPOINTMENTS */}
            {tomorrowAppointments.length > 0 && (
              <div
                onClick={() => setViewMode('calendar')}
                className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/60 transition-colors shadow-xs animate-in fade-in-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/70 text-amber-700 dark:text-amber-300 rounded-xl">
                    <Bell className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                      {t.reminderAlertTitle.replace('{count}', String(tomorrowAppointments.length))}
                    </h3>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                      {t.reminderAlertDesc}
                    </p>
                  </div>
                </div>
                <ChevronIcon className="w-4 h-4 text-amber-600" />
              </div>
            )}

            {/* 3. PRIMARY CLINIC TASKS GRID */}
            <div className="grid grid-cols-2 gap-3">
              {/* Task 1: New Patient File */}
              <button
                onClick={handleNewPatient}
                className={`group relative flex flex-col items-start justify-between p-4 bg-gradient-to-br from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-3xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
                  isRTL ? 'text-right' : 'text-left'
                } cursor-pointer min-h-[120px]`}
              >
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs group-hover:scale-110 transition-transform">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="mt-2">
                  <h2 className="text-sm font-bold">{t.newPatient}</h2>
                  <p className="text-[11px] text-sky-100 mt-0.5 line-clamp-1">
                    {t.newPatientDesc}
                  </p>
                </div>
              </button>

              {/* Task 2: Appointments & Calendar */}
              <button
                onClick={() => setViewMode('calendar')}
                className={`group relative flex flex-col items-start justify-between p-4 bg-gradient-to-br from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white rounded-3xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
                  isRTL ? 'text-right' : 'text-left'
                } cursor-pointer min-h-[120px]`}
              >
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs group-hover:scale-110 transition-transform">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-bold">{t.appointments}</h2>
                    {todayAppointments.length > 0 && (
                      <span className="text-[10px] bg-white text-teal-800 px-1.5 py-0.2 rounded-full font-bold">
                        {todayAppointments.length} {t.todayBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-teal-100 mt-0.5 line-clamp-1">
                    {t.appointmentsDesc}
                  </p>
                </div>
              </button>
            </div>

            {/* 4. CLINIC DAILY QUICK STATS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
              <div
                onClick={() => setSelectedDayFilter('all')}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center shadow-xs cursor-pointer hover:border-sky-300 transition-colors"
                title={t.filterAllPatients}
              >
                <span className="text-[11px] text-slate-400 block">{t.totalPatients}</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                  {patients.length}
                </span>
              </div>

              <div
                onClick={() => setSelectedDayFilter('today')}
                className="bg-sky-50/70 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-2xl p-3 text-center shadow-xs cursor-pointer hover:bg-sky-100/70 transition-colors"
                title={t.filterToday}
              >
                <span className="text-[11px] text-sky-700 dark:text-sky-300 font-bold block">{t.todayPatientsCount}</span>
                <span className="text-lg font-bold text-sky-600 dark:text-sky-400 font-mono">
                  {todayPatientsCount}
                </span>
              </div>

              <div
                onClick={() => setViewMode('calendar')}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center shadow-xs cursor-pointer hover:border-teal-300 transition-colors"
                title={t.appointments}
              >
                <span className="text-[11px] text-slate-400 block">{t.todayAppointments}</span>
                <span className="text-lg font-bold text-teal-600 dark:text-teal-400 font-mono">
                  {todayAppointments.length}
                </span>
              </div>

              <div
                onClick={() => setViewMode('calendar')}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center shadow-xs cursor-pointer hover:border-amber-300 transition-colors"
                title={t.appointments}
              >
                <span className="text-[11px] text-slate-400 block">{t.tomorrowAppointments}</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {tomorrowAppointments.length}
                </span>
              </div>
            </div>

            {/* 5. FULL DAY PATIENTS SECTION (مرضى اليوم الكامل) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
              {/* Section Header & Day Filters */}
              <div className="flex flex-col gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-100 dark:bg-sky-950 text-sky-600 rounded-xl">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        {t.fullDayPatientsTitle}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {selectedDayFilter === 'all'
                          ? t.registeredFiles
                          : `${t.fullDayPatientsSubtitle} (${activeDate})`}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 rounded-xl border border-sky-200 dark:border-sky-800">
                    {dayPatients.length} {t.patientsOnSelectedDay}
                  </span>
                </div>

                {/* Day Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    onClick={() => setSelectedDayFilter('today')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedDayFilter === 'today'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t.filterToday} ({todayStr})
                  </button>

                  <button
                    onClick={() => setSelectedDayFilter('yesterday')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedDayFilter === 'yesterday'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t.filterYesterday}
                  </button>

                  <label
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      selectedDayFilter === 'custom'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>{selectedDayFilter === 'custom' ? customDayDate : t.filterSelectDay}</span>
                    <input
                      type="date"
                      className="sr-only"
                      value={customDayDate}
                      onChange={(e) => {
                        if (e.target.value) {
                          setCustomDayDate(e.target.value);
                          setSelectedDayFilter('custom');
                        }
                      }}
                    />
                  </label>

                  <button
                    onClick={() => setSelectedDayFilter('all')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selectedDayFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {t.filterAllPatients}
                  </button>
                </div>
              </div>

              {/* Day Patients List */}
              {dayPatients.length === 0 ? (
                <div className="text-center py-8 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <HeartPulse className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-600 mb-2 stroke-[1.2]" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t.noPatientsOnDay.replace('{date}', activeDate)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t.switchDayToView}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                    {selectedDayFilter !== 'yesterday' && (
                      <button
                        onClick={() => setSelectedDayFilter('yesterday')}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-300 transition"
                      >
                        {t.filterYesterday} ({yesterdayStr})
                      </button>
                    )}
                    <button
                      onClick={handleNewPatient}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t.newPatient}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {dayPatients.map(({ patient: p, isNewExamOnDay, isFollowUpOnDay, followUpCountOnDay }) => (
                    <div
                      key={p.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2.5 rounded-2xl transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {p.name}
                          </span>
                          {p.age && (
                            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {p.age}
                            </span>
                          )}

                          {/* Visit Badges on this Day */}
                          {isNewExamOnDay && (
                            <span className="text-[10px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded-full font-bold">
                              {t.newExamTodayBadge}
                            </span>
                          )}
                          {isFollowUpOnDay && (
                            <span className="text-[10px] text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-full font-bold">
                              {t.followUpTodayBadge} {followUpCountOnDay > 1 ? `(${followUpCountOnDay})` : ''}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                          {p.address && <span>{p.address}</span>}
                          {p.address && <span>·</span>}
                          <span>
                            {t.examDatePrefix} {p.examDate}
                          </span>
                          {p.followUps && p.followUps.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-teal-600 dark:text-teal-400 font-semibold">
                                {p.followUps.length} {t.followUpsCount}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => handleOpenPatient(p.id, 'add-followup')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                          title={t.addFollowUp}
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{t.addFollowUp}</span>
                        </button>

                        <button
                          onClick={() => handleOpenPatient(p.id, 'view')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>{t.openFile}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* Android Sticky Bottom Tab Navigation - 3 Native Tabs */}
          <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 max-w-4xl mx-auto w-full no-print">
            <div className="grid grid-cols-3 items-center h-14">
              <button
                onClick={() => setViewMode('home')}
                className={`flex flex-col items-center justify-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === 'home'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <Stethoscope className="w-5 h-5" />
                <span>{t.home}</span>
              </button>

              <button
                onClick={handleNewPatient}
                className="flex flex-col items-center justify-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center -mt-3 shadow-md shadow-sky-600/30">
                  <UserPlus className="w-4 h-4" />
                </div>
                <span className="text-sky-700 dark:text-sky-400 text-[11px] font-bold">{t.newPatient}</span>
              </button>

              <button
                onClick={() => setViewMode('calendar')}
                className="flex flex-col items-center justify-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <Calendar className="w-5 h-5" />
                <span>{t.appointments}</span>
              </button>
            </div>
          </nav>

          {/* Backup Modal */}
          <BackupModal
            isOpen={isBackupOpen}
            onClose={() => setIsBackupOpen(false)}
            onDataRestored={refreshData}
          />

          {/* Analytics Modal (الإحصائية) */}
          <AnalyticsModal
            isOpen={isAnalyticsOpen}
            onClose={() => setIsAnalyticsOpen(false)}
            patients={patients}
          />

          {/* About the Designer Modal (لمحة عن المصمم) */}
          {isAboutDesignerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-teal-700 text-white p-5 relative">
                  <button
                    onClick={() => setIsAboutDesignerOpen(false)}
                    className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer`}
                    title={t.close}
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="flex flex-col items-center text-center pt-2">
                    <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg mb-3">
                      <Stethoscope className="w-8 h-8 text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-sky-100 bg-white/15 px-3 py-0.5 rounded-full mb-1.5">
                      {t.aboutDesignerLabel}
                    </span>
                    <h2 className="text-lg font-extrabold text-white leading-snug">
                      {t.designerName}
                    </h2>
                    <p className="text-xs font-bold text-teal-100 mt-1">
                      {t.designerSpecialty}
                    </p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 rounded-2xl p-3.5 text-center">
                    <span className="text-[11px] font-bold text-sky-700 dark:text-sky-300 block mb-1">
                      {t.designerBioTitle} · {t.appName}
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {t.designerBioDesc}
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-[11px] text-teal-700 dark:text-teal-300 font-semibold">
                    <Award className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>{t.designerSpecialtyBadge}</span>
                  </div>

                  <button
                    onClick={() => setIsAboutDesignerOpen(false)}
                    className="w-full py-2.5 bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-700 text-white text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                  >
                    {t.close}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AndroidFrame>
  );
}
