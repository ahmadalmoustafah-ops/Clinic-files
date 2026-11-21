import React from 'react';
import {
  X,
  Settings,
  Stethoscope,
  User,
  Lock,
  RotateCcw,
  Check,
  ShieldCheck,
  Type,
  HeartPulse,
  Bell,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  APP_FONT_SIZE_PX,
  AppFontSize,
  ClinicalFieldSettings,
  DemographicsSubKey,
  FieldSettingsService,
  FollowUpSubKey,
  SubAccordionKey,
} from '../services/fieldSettingsService';

interface FieldSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ClinicalFieldSettings;
  onSettingsChange: (next: ClinicalFieldSettings) => void;
}

interface TogglePillProps {
  checked: boolean;
  onChange: () => void;
  label: string;
}

const ToggleSwitch: React.FC<TogglePillProps> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
        checked ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

export const FieldSettingsModal: React.FC<FieldSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const { t, isRTL } = useLanguage();

  if (!isOpen) return null;

  const persist = (next: ClinicalFieldSettings) => {
    const saved = FieldSettingsService.saveSettings(next);
    onSettingsChange(saved);
  };

  const handleFontSizeChange = (fontSize: AppFontSize) => {
    persist({
      ...settings,
      fontSize,
    });
  };

  const handleToggleDemographic = (key: DemographicsSubKey) => {
    persist({
      ...settings,
      demographics: {
        ...settings.demographics,
        [key]: !settings.demographics[key],
      },
    });
  };

  const handleToggleSub = (subKey: SubAccordionKey) => {
    const nextSubVal = !settings.sub[subKey];
    const nextSub = {
      ...settings.sub,
      [subKey]: nextSubVal,
    };

    persist({
      ...settings,
      main: {
        history: true,
        clinical: true,
        diagnosis: true,
      },
      sub: nextSub,
    });
  };

  const handleToggleFollowUpSub = (key: FollowUpSubKey) => {
    persist({
      ...settings,
      followUpSub: {
        ...settings.followUpSub,
        [key]: !settings.followUpSub[key],
      },
    });
  };

  const handleResetAll = () => {
    const reset = FieldSettingsService.resetSettings();
    onSettingsChange(reset);
  };

  const handleToggleHomeReminder = () => {
    persist({
      ...settings,
      showHomeReminder: !(settings.showHomeReminder !== false),
    });
  };

  const fontSizeOptions: Array<{ key: AppFontSize; label: string; samplePx: number }> = [
    { key: 'small', label: t.fontSizeSmall, samplePx: APP_FONT_SIZE_PX.small },
    { key: 'medium', label: t.fontSizeMedium, samplePx: APP_FONT_SIZE_PX.medium },
    { key: 'large', label: t.fontSizeLarge, samplePx: APP_FONT_SIZE_PX.large },
    { key: 'xlarge', label: t.fontSizeXLarge, samplePx: APP_FONT_SIZE_PX.xlarge },
  ];

  const demographicItems: Array<{ key: DemographicsSubKey; label: string }> = [
    { key: 'age', label: t.age },
    { key: 'address', label: t.residence },
    { key: 'pregnancyOrLactation', label: t.pregnancyOrLactation },
    { key: 'examDate', label: t.examDateAuto },
    { key: 'phone', label: t.phone },
  ];

  const fileSubItems: Array<{ key: SubAccordionKey; label: string; isOrange?: boolean }> = [
    { key: 'habits', label: t.habits },
    { key: 'medicalHistory', label: t.medicalHistory },
    { key: 'surgicalHistory', label: t.surgicalHistory },
    { key: 'drugHistory', label: t.drugHistory },
    { key: 'allergyHistory', label: t.allergyHistory },
    { key: 'familyHistory', label: t.familyHistory },
    { key: 'symptoms', label: t.symptoms, isOrange: true },
    { key: 'clinicalExam', label: t.clinicalExam },
    { key: 'echo', label: t.echo },
    { key: 'labs', label: t.labs },
    { key: 'otherInvestigations', label: t.otherInvestigations },
    { key: 'differentialDiagnosis', label: t.differentialDiagnosis },
    { key: 'waiting', label: t.waiting },
    { key: 'treatment', label: t.treatment },
  ];

  const activeFileSubCount = fileSubItems.filter((item) => settings.sub[item.key]).length;

  const followUpSubItems: Array<{ key: FollowUpSubKey; label: string }> = [
    { key: 'clinicalEvolution', label: t.clinicalEvolution },
    { key: 'newExam', label: t.newExam },
    { key: 'labs', label: t.labsFollowUp },
    { key: 'investigations', label: t.investigationsFollowUp },
    { key: 'differentialDiagnosis', label: t.differentialDiagnosis },
    { key: 'waiting', label: t.waitingFollowUp },
    { key: 'treatment', label: t.treatmentFollowUp },
  ];

  const activeFollowUpCount = followUpSubItems.filter(
    (item) => settings.followUpSub[item.key]
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-teal-700 text-white p-4 sm:p-5 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-4 ${
              isRTL ? 'left-4' : 'right-4'
            } p-1.5 text-white/80 hover:text-white hover:bg-white/15 rounded-xl transition-colors cursor-pointer`}
            title={t.close}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 pe-8">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-md shrink-0">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white leading-snug">
                {t.settingsModalTitle}
              </h2>
              <p className="text-[11px] text-sky-100 mt-0.5 leading-snug">
                {t.settingsModalSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Global App Font Size Control Card */}
          <div className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-3.5 space-y-3 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 bg-sky-600 text-white rounded-xl shrink-0">
                <Type className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-extrabold text-sky-950 dark:text-sky-100">
                  {t.settingsFontSizeTitle}
                </h3>
                <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80 mt-0.5">
                  {t.settingsFontSizeDesc}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {fontSizeOptions.map((opt) => {
                const isSelected = (settings.fontSize || 'medium') === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleFontSizeChange(opt.key)}
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-400'
                    }`}
                  >
                    <span className="font-extrabold leading-tight" style={{ fontSize: `${opt.samplePx}px` }}>
                      أ / A
                    </span>
                    <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-white/95 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 text-center">
              {t.fontSizePreviewSample}
            </div>
          </div>

          {/* Home Reminder Notification Toggle */}
          <div
            onClick={handleToggleHomeReminder}
            className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-3 flex items-center justify-between gap-2.5 cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-amber-500 text-white rounded-xl shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-amber-950 dark:text-amber-100 leading-snug">
                {t.settingsHomeReminderLabel}
              </span>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ToggleSwitch
                checked={settings.showHomeReminder !== false}
                onChange={handleToggleHomeReminder}
                label={t.settingsHomeReminderLabel}
              />
            </div>
          </div>

          {/* Privacy/Safety Info Banner */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-3 flex items-start gap-2.5 text-[11px] text-emerald-900 dark:text-emerald-200 font-semibold leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{t.settingsDataSafeNote}</span>
          </div>

          {/* Demographics Fields Card (Patient Name always required/on, other fields customizable) */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-700/60">
              <User className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                {t.demographicsSection}
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Locked Full Name row */}
              <div className="bg-white/90 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 opacity-90">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {t.patientFullName}
                  </span>
                </div>
                <span className="text-[10px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded-lg shrink-0">
                  {t.settingsRequiredAlwaysBadge}
                </span>
              </div>

              {/* Customizable Demographic Fields */}
              {demographicItems.map((item) => {
                const isOn = settings.demographics[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => handleToggleDemographic(item.key)}
                    className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </span>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={isOn}
                        onChange={() => handleToggleDemographic(item.key)}
                        label={item.label}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sequential Clinical Sub-Accordions Card (File & New Consultation Fields) */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {t.settingsSubSectionsTitle}
                </span>
              </div>
              <span className="text-[10px] font-bold font-mono text-slate-500 dark:text-slate-400">
                {activeFileSubCount} / {fileSubItems.length}
              </span>
            </div>

            <div className="space-y-1.5">
              {fileSubItems.map((sub) => {
                const isSubOn = settings.sub[sub.key];
                return (
                  <div
                    key={sub.key}
                    onClick={() => handleToggleSub(sub.key)}
                    className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors border ${
                      sub.isOrange
                        ? 'bg-orange-50/90 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/80 hover:border-orange-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isSubOn
                            ? sub.isOrange
                              ? 'bg-orange-500'
                              : 'bg-emerald-500'
                            : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      />
                      <span
                        className={`text-xs font-bold truncate ${
                          sub.isOrange
                            ? 'text-orange-950 dark:text-orange-100'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {sub.label}
                      </span>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={isSubOn}
                        onChange={() => handleToggleSub(sub.key)}
                        label={sub.label}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-teal-800 dark:text-teal-200 bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 rounded-xl px-3 py-2 font-semibold">
            {t.settingsConsultationHint}
          </div>

          {/* Clinical Follow-Up Sub-Fields Card */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {t.settingsFollowUpSection}
                </span>
              </div>
              <span className="text-[10px] font-bold font-mono text-slate-500 dark:text-slate-400">
                {activeFollowUpCount} / {followUpSubItems.length}
              </span>
            </div>

            <div className="space-y-1.5">
              {followUpSubItems.map((item) => {
                const isOn = settings.followUpSub[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => handleToggleFollowUpSub(item.key)}
                    className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </span>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={isOn}
                        onChange={() => handleToggleFollowUpSub(item.key)}
                        label={item.label}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/95 flex items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>{t.settingsResetAll}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold transition-colors shadow-xs cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t.close}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
