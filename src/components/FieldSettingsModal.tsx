import React from 'react';
import {
  X,
  Settings,
  Activity,
  Stethoscope,
  Pill,
  User,
  Lock,
  RotateCcw,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  ClinicalFieldSettings,
  DemographicsSubKey,
  FieldSettingsService,
  MAIN_SUB_GROUPS,
  MainAccordionKey,
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

  const handleToggleDemographic = (key: DemographicsSubKey) => {
    persist({
      ...settings,
      demographics: {
        ...settings.demographics,
        [key]: !settings.demographics[key],
      },
    });
  };

  const handleToggleMain = (mainKey: MainAccordionKey) => {
    const nextMainVal = !settings.main[mainKey];
    const nextSub = { ...settings.sub };

    if (nextMainVal) {
      const childKeys = MAIN_SUB_GROUPS[mainKey];
      const anyChildOn = childKeys.some((k) => nextSub[k]);
      if (!anyChildOn) {
        childKeys.forEach((k) => {
          nextSub[k] = true;
        });
      }
    }

    persist({
      ...settings,
      main: {
        ...settings.main,
        [mainKey]: nextMainVal,
      },
      sub: nextSub,
    });
  };

  const handleToggleSub = (mainKey: MainAccordionKey, subKey: SubAccordionKey) => {
    const nextSubVal = !settings.sub[subKey];
    const nextSub = {
      ...settings.sub,
      [subKey]: nextSubVal,
    };

    const childKeys = MAIN_SUB_GROUPS[mainKey];
    const anyChildOn = childKeys.some((k) => nextSub[k]);

    persist({
      ...settings,
      main: {
        ...settings.main,
        [mainKey]: nextSubVal ? true : anyChildOn ? settings.main[mainKey] : false,
      },
      sub: nextSub,
    });
  };

  const handleResetAll = () => {
    const reset = FieldSettingsService.resetSettings();
    onSettingsChange(reset);
  };

  const demographicItems: Array<{ key: DemographicsSubKey; label: string }> = [
    { key: 'age', label: t.age },
    { key: 'examDate', label: t.examDateAuto },
    { key: 'address', label: t.residence },
    { key: 'phone', label: t.phone },
  ];

  const mainGroups: Array<{
    key: MainAccordionKey;
    title: string;
    icon: React.ReactNode;
    subItems: Array<{ key: SubAccordionKey; label: string }>;
  }> = [
    {
      key: 'history',
      title: t.historySection,
      icon: <Activity className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />,
      subItems: [
        { key: 'habits', label: t.habits },
        { key: 'medicalHistory', label: t.medicalHistory },
        { key: 'surgicalHistory', label: t.surgicalHistory },
        { key: 'drugHistory', label: t.drugHistory },
        { key: 'allergyHistory', label: t.allergyHistory },
        { key: 'familyHistory', label: t.familyHistory },
      ],
    },
    {
      key: 'clinical',
      title: t.clinicalSection,
      icon: <Stethoscope className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />,
      subItems: [
        { key: 'symptoms', label: t.symptoms },
        { key: 'clinicalExam', label: t.clinicalExam },
        { key: 'echo', label: t.echo },
        { key: 'labs', label: t.labs },
        { key: 'otherInvestigations', label: t.otherInvestigations },
      ],
    },
    {
      key: 'diagnosis',
      title: t.planSection,
      icon: <Pill className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />,
      subItems: [
        { key: 'differentialDiagnosis', label: t.differentialDiagnosis },
        { key: 'waiting', label: t.waiting },
        { key: 'treatment', label: t.treatment },
      ],
    },
  ];

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

          {/* Main + Sub Accordions Cards (Main = Pale Sky Blue, Sub = Crisp White) */}
          {mainGroups.map((group) => {
            const isMainOn = settings.main[group.key];
            const activeSubCount = group.subItems.filter((item) => settings.sub[item.key]).length;

            return (
              <div
                key={group.key}
                className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-3.5 space-y-2.5 shadow-2xs"
              >
                {/* Main Accordion Toggle Row */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-sky-200/80 dark:border-sky-800/60">
                  <div className="flex items-center gap-2 min-w-0">
                    {group.icon}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-extrabold text-sky-950 dark:text-sky-100">
                          {group.title}
                        </span>
                        <span className="text-[10px] font-bold bg-sky-200/70 dark:bg-sky-900/70 text-sky-900 dark:text-sky-200 px-1.5 py-0.5 rounded-md">
                          {t.settingsMainBadge}
                        </span>
                      </div>
                      <span className="text-[10px] text-sky-700/80 dark:text-sky-300/80 font-mono">
                        {activeSubCount} / {group.subItems.length}
                      </span>
                    </div>
                  </div>

                  <ToggleSwitch
                    checked={isMainOn}
                    onChange={() => handleToggleMain(group.key)}
                    label={group.title}
                  />
                </div>

                {!isMainOn && (
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-3 py-1.5">
                    {t.settingsMainDisabledHint}
                  </p>
                )}

                {/* Nested Sub-Accordions Toggles */}
                <div
                  className={`space-y-1.5 transition-opacity ${
                    isMainOn ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {group.subItems.map((sub) => {
                    const isSubOn = settings.sub[sub.key];
                    return (
                      <div
                        key={sub.key}
                        onClick={() => handleToggleSub(group.key, sub.key)}
                        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSubOn && isMainOn
                                ? 'bg-emerald-500'
                                : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                          />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {sub.label}
                          </span>
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <ToggleSwitch
                            checked={isSubOn}
                            onChange={() => handleToggleSub(group.key, sub.key)}
                            label={sub.label}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
