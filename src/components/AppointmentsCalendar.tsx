import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Bell,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Trash2,
  CalendarCheck,
} from 'lucide-react';
import { Appointment, PatientRecord } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useBackHandler } from '../services/navigationHistory';

interface AppointmentsCalendarProps {
  appointments: Appointment[];
  patients: PatientRecord[];
  onSaveAppointment: (appointment: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
  onBack: () => void;
  onOpenPatient?: (patientId: string) => void;
}

export const AppointmentsCalendar: React.FC<AppointmentsCalendarProps> = ({
  appointments,
  patients,
  onSaveAppointment,
  onDeleteAppointment,
  onBack,
  onOpenPatient,
}) => {
  const { t, isRTL, language } = useLanguage();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New appointment form state
  const [appPatientName, setAppPatientName] = useState('');
  const [appPatientId, setAppPatientId] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [appTime, setAppTime] = useState('10:00');
  const [appTitle, setAppTitle] = useState('');
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);

  useBackHandler('calendar-appointment-modal', isModalOpen, () => {
    setIsModalOpen(false);
  });

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const formatDayDateString = (day: number) => {
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${currentYear}-${m}-${d}`;
  };

  const selectedDateStr = selectedDay ? formatDayDateString(selectedDay) : '';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const tomorrowAppointments = useMemo(() => {
    return appointments.filter((a) => a.date === tomorrowDateStr && a.status !== 'cancelled');
  }, [appointments, tomorrowDateStr]);

  const selectedDayAppointments = useMemo(() => {
    if (!selectedDateStr) return [];
    return appointments.filter((a) => a.date === selectedDateStr);
  }, [appointments, selectedDateStr]);

  const openAddModalForDay = (day: number) => {
    setSelectedDay(day);
    setEditingAppointmentId(null);
    setAppPatientName('');
    setAppPatientId('');
    setAppPhone('');
    setAppTime('10:00');
    setAppTitle('');
    setIsModalOpen(true);
  };

  const openEditModal = (app: Appointment) => {
    setEditingAppointmentId(app.id);
    setAppPatientName(app.patientName);
    setAppPatientId(app.patientId || '');
    setAppPhone(app.phone || '');
    setAppTime(app.time);
    setAppTitle(app.title);
    setIsModalOpen(true);
  };

  const handlePatientSelect = (pId: string) => {
    setAppPatientId(pId);
    const found = patients.find((p) => p.id === pId);
    if (found) {
      setAppPatientName(found.name);
      setAppPhone(found.phone || '');
    }
  };

  const insertTemplate = (text: string) => {
    setAppTitle((prev) => (prev ? `${prev} - ${text}` : text));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDay) return;
    if (!appPatientName.trim()) {
      alert(language === 'ar' ? 'يرجى تحديد أو إدخال اسم المريض.' : 'Please enter or select a patient name.');
      return;
    }

    if (appTitle.trim().length < 50) {
      alert(
        language === 'ar'
          ? `تسمية الموعد وملاحظاته يجب ألا تقل عن 50 حرفاً وفق متطلبات العيادة (الحالي: ${appTitle.trim().length} حرفاً). يرجى تفصيل سبب الزيارة أو الفحوصات المطلوبة.`
          : `Appointment notes must be at least 50 characters (Current: ${appTitle.trim().length} chars). Please elaborate on clinical reasons.`
      );
      return;
    }

    const appointmentToSave: Appointment = {
      id: editingAppointmentId || `app-${Date.now()}`,
      date: formatDayDateString(selectedDay),
      time: appTime,
      patientName: appPatientName.trim(),
      patientId: appPatientId || undefined,
      phone: appPhone.trim() || undefined,
      title: appTitle.trim(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    onSaveAppointment(appointmentToSave);
    setIsModalOpen(false);
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-col min-h-full pb-20 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Back"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-sky-600" />
              <span>{t.calendarTitle}</span>
            </h1>
            <p className="text-xs text-slate-400">{t.calendarDesc}</p>
          </div>
        </div>

        <button
          onClick={() => openAddModalForDay(selectedDay || today.getDate())}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.bookNewAppointment}</span>
        </button>
      </header>

      {/* Advance Reminder Alert for Tomorrow's Appointments */}
      <div className="p-4 max-w-4xl mx-auto w-full">
        {tomorrowAppointments.length > 0 ? (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 mb-4 shadow-xs animate-in fade-in-50 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl shrink-0 mt-0.5">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {t.advanceReminderAlert
                      .replace('{count}', String(tomorrowAppointments.length))
                      .replace('{date}', tomorrowDateStr)}
                  </h3>
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 dark:bg-amber-900/80 px-2 py-0.5 rounded-full">
                    {t.oneDayAdvanceBadge}
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-1">
                  {t.reminderHelperText}
                </p>

                <div className="mt-3 space-y-2">
                  {tomorrowAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {app.patientName}
                          </span>
                          <span className="text-[11px] text-sky-600 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {app.time}
                          </span>
                          {app.phone && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              {app.phone}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                          {app.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {app.patientId && onOpenPatient && (
                          <button
                            onClick={() => onOpenPatient(app.patientId!)}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded-lg transition-colors"
                          >
                            {t.openPatientFile}
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(app)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs rounded-lg transition-colors"
                        >
                          {t.edit}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-3 mb-4 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {t.noTomorrowAppointments} ({tomorrowDateStr})
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {t.reminderSystemActive}
            </span>
          </div>
        )}

        {/* Calendar Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors"
              >
                {isRTL ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.months[currentMonth]} {currentYear}
              </h2>
              <button
                onClick={handleNextMonth}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors"
              >
                {isRTL ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>

            <button
              onClick={() => {
                setCurrentMonth(today.getMonth());
                setCurrentYear(today.getFullYear());
                setSelectedDay(today.getDate());
              }}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 dark:bg-sky-950/60 px-3 py-1.5 rounded-xl border border-sky-100 dark:border-sky-800"
            >
              {t.todayButton} ({today.getDate()} {t.months[today.getMonth()]})
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {t.days.map((dayName) => (
              <div
                key={dayName}
                className="text-xs font-bold text-slate-400 dark:text-slate-500 py-1"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* 31-Day Calendar Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="h-16 sm:h-20 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl opacity-30 border border-transparent"
              />
            ))}

            {/* Month Days (up to 31 slots) */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = formatDayDateString(day);
              const dayApps = appointments.filter((a) => a.date === dateStr);
              const isToday =
                day === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear();
              const isSelected = selectedDay === day;
              const isTomorrow = dateStr === tomorrowDateStr;

              return (
                <button
                  key={`day-${day}`}
                  onClick={() => setSelectedDay(day)}
                  className={`h-16 sm:h-20 p-1.5 rounded-2xl border ${
                    isRTL ? 'text-right' : 'text-left'
                  } flex flex-col justify-between transition-all relative group cursor-pointer ${
                    isSelected
                      ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/50 ring-2 ring-sky-500/30 shadow-xs'
                      : isToday
                      ? 'border-sky-300 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-950/20'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs sm:text-sm font-bold font-mono ${
                        isToday
                          ? 'w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center'
                          : isSelected
                          ? 'text-sky-600 dark:text-sky-400 font-extrabold'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {day}
                    </span>

                    {isTomorrow && dayApps.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </div>

                  {dayApps.length > 0 ? (
                    <div className="w-full">
                      <div className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-100/70 dark:bg-sky-900/60 rounded px-1 py-0.5 truncate text-center">
                        {dayApps.length} {t.appointmentsDayCount}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full text-center text-[10px] text-slate-300 dark:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.addBookingDay}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Appointments List */}
        {selectedDay && (
          <div className="mt-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-sky-600" />
                  <span>
                    {t.appointmentsForDay} ({selectedDay} {t.months[currentMonth]} {currentYear})
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedDayAppointments.length === 0
                    ? t.noAppointmentsForDay
                    : `${t.appointmentsDayCount}: ${selectedDayAppointments.length}`}
                </p>
              </div>

              <button
                onClick={() => openAddModalForDay(selectedDay)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.addAppointmentForThisDay}</span>
              </button>
            </div>

            {selectedDayAppointments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-400">{t.dayFreeHelper}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayAppointments.map((app) => (
                  <div
                    key={app.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 hover:border-sky-300 dark:hover:border-sky-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {app.patientName}
                        </span>
                        <span className="text-xs font-mono font-semibold text-sky-700 dark:text-sky-300 bg-sky-100/70 dark:bg-sky-900/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {app.time}
                        </span>
                        {app.phone && (
                          <span className="text-xs text-slate-400 font-mono">
                            {app.phone}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                        {app.title}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {app.patientId && onOpenPatient && (
                        <button
                          onClick={() => onOpenPatient(app.patientId!)}
                          className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 rounded-xl text-xs font-semibold transition-colors"
                        >
                          {t.openPatientFile}
                        </button>
                      )}

                      <button
                        onClick={() => openEditModal(app)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors"
                      >
                        {t.edit}
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm(t.confirmDeleteAppointment)) {
                            onDeleteAppointment(app.id);
                          }
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Appointment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-sky-600" />
                <span>
                  {editingAppointmentId
                    ? t.appointmentModalTitleEdit
                    : t.appointmentModalTitleNew}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.appointmentDate}
                  </label>
                  <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    {selectedDay ? formatDayDateString(selectedDay) : ''}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.appointmentTime}
                  </label>
                  <input
                    type="time"
                    value={appTime}
                    onChange={(e) => setAppTime(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.selectRegisteredPatient}
                </label>
                {patients.length > 0 && (
                  <select
                    value={appPatientId}
                    onChange={(e) => handlePatientSelect(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-2 focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">{t.selectPatientDefaultOption}</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.age ? `(${p.age})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  value={appPatientName}
                  onChange={(e) => setAppPatientName(e.target.value)}
                  placeholder={t.patientFullNameRequired}
                  className="w-full text-xs px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.phoneNumberForReminder}
                </label>
                <input
                  type="tel"
                  value={appPhone}
                  onChange={(e) => setAppPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono focus:ring-2 focus:ring-sky-500/20"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t.appointmentTitleLabel} <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      appTitle.trim().length >= 50
                        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {appTitle.trim().length} / 50 {t.charsMinimum}
                  </span>
                </div>

                <textarea
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  placeholder={t.appointmentTitlePlaceholder}
                  rows={3}
                  className="w-full text-xs leading-relaxed px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  required
                />

                <div className="mt-1.5">
                  <span className="text-[10px] text-slate-400 block mb-1">
                    {t.suggestedTemplates}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => insertTemplate(t.template1Text)}
                      className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md"
                    >
                      {t.template1}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTemplate(t.template2Text)}
                      className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md"
                    >
                      {t.template2}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={appTitle.trim().length < 50 || !appPatientName.trim()}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  {t.saveAppointment}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
