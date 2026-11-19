import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Image as ImageIcon,
  Camera,
  Calendar,
  User,
  HeartPulse,
  Activity,
  FileSpreadsheet,
  Stethoscope,
  Pill,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { PatientRecord, PatientFollowUp, MedicalImage } from '../types';
import { RichClinicalField } from './RichClinicalField';
import { ImageModal } from './ImageModal';
import { useLanguage } from '../context/LanguageContext';
import { exportPatientToWord } from '../services/wordExportService';
import { useBackHandler } from '../services/navigationHistory';
import { hasRichContent } from '../utils/richTextUtils';
import {
  ClinicalFieldSettings,
  FieldSettingsService,
} from '../services/fieldSettingsService';

export interface PatientSaveMeta {
  isNewCreation: boolean;
  source: 'save' | 'back' | 'autosave';
}

interface PatientFormProps {
  initialPatient?: PatientRecord | null;
  onSave: (patient: PatientRecord, meta?: PatientSaveMeta) => void | Promise<void>;
  onDelete?: (patientId: string) => void;
  onBack: () => void;
  autoAddFollowUp?: boolean;
  fieldSettings?: ClinicalFieldSettings;
}

function getFormattedToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const PatientForm: React.FC<PatientFormProps> = ({
  initialPatient,
  onSave,
  onDelete,
  onBack,
  autoAddFollowUp = false,
  fieldSettings,
}) => {
  const { t, isRTL, language } = useLanguage();
  const isNew = !initialPatient;
  const activeFieldSettings = fieldSettings || FieldSettingsService.getSettings();

  const getFormattedNowDateTime = (): string => {
    const now = new Date();
    const dateStr = getFormattedToday();
    const timeStr = now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr} (${timeStr})`;
  };

  // Patient Core Data State
  const [patient, setPatient] = useState<PatientRecord>(() => {
    if (initialPatient) return initialPatient;
    return {
      id: `pat-${Date.now()}`,
      name: '',
      age: '',
      address: '',
      phone: '',
      examDate: getFormattedToday(), // تضعه تلقائياً وفقاً لتاريخ الهاتف
      habits: '',
      medicalHistory: '',
      surgicalHistory: '',
      drugHistory: '',
      allergyHistory: '',
      familyHistory: '',
      symptoms: '',
      clinicalExam: '',
      echo: '',
      labs: '',
      otherInvestigations: '',
      differentialDiagnosis: '',
      waiting: '',
      treatment: '',
      images: [],
      followUps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const [activeTab, setActiveTab] = useState<'details' | 'followups' | 'images'>('details');
  const [selectedImage, setSelectedImage] = useState<MedicalImage | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'warning'>('success');
  const [isSavingWord, setIsSavingWord] = useState(false);
  const isExistingFile = Boolean(initialPatient);
  const [expandedMainSections, setExpandedMainSections] = useState<Record<string, boolean>>({});
  const [expandedSubFields, setExpandedSubFields] = useState<Record<string, boolean>>({});
  const [editingDemoField, setEditingDemoField] = useState<
    'name' | 'age' | 'address' | 'phone' | null
  >(null);

  // Ensure all main & sub accordions auto-close on exit/re-entry
  useEffect(() => {
    setExpandedMainSections({});
    setExpandedSubFields({});
    setEditingDemoField(null);
  }, [initialPatient?.id]);

  const [hasSavedOnce, setHasSavedOnce] = useState<boolean>(!isNew);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastAutoSavedTime, setLastAutoSavedTime] = useState<string>('');

  const hasSavedOnceRef = useRef<boolean>(!isNew);
  const isDirtyRef = useRef<boolean>(false);
  const isAutoSavingInProgressRef = useRef<boolean>(false);
  const latestPatientRef = useRef<PatientRecord>(patient);
  latestPatientRef.current = patient;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [isAutoSavingBack, setIsAutoSavingBack] = useState(false);

  const unifiedFileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextRef = useRef<{
    target: 'main' | 'followup';
    followUpId?: string;
    category: MedicalImage['category'];
  }>({ target: 'main', category: 'general' });

  const swipeStartRef = useRef<{ x: number; y: number; ignored: boolean } | null>(null);

  const triggerImagePicker = (context: {
    target: 'main' | 'followup';
    followUpId?: string;
    category: MedicalImage['category'];
  }) => {
    uploadContextRef.current = context;
    unifiedFileInputRef.current?.click();
  };

  // Auto-add consultation if requested via search bar quick action
  useEffect(() => {
    if (autoAddFollowUp) {
      handleAddFollowUp();
      setActiveTab('followups');
    }
  }, [autoAddFollowUp]);

  const showToast = (msg: string, type: 'success' | 'warning' = 'success') => {
    setToastType(type);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const updateField = (field: keyof PatientRecord, val: any) => {
    isDirtyRef.current = true;
    setPatient((prev) => ({
      ...prev,
      [field]: val,
      updatedAt: new Date().toISOString(),
    }));
  };

  const toggleMainSection = (sec: string) => {
    setExpandedMainSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const toggleSubField = (fieldKey: string) => {
    setExpandedSubFields((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  // Handle image upload from file or camera
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const { target, followUpId, category } = uploadContextRef.current;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newImg: MedicalImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: base64,
          date: getFormattedToday(),
          category,
        };

        isDirtyRef.current = true;
        if (target === 'followup' && followUpId) {
          setPatient((prev) => ({
            ...prev,
            followUps: prev.followUps.map((fu) =>
              fu.id === followUpId ? { ...fu, images: [...(fu.images || []), newImg] } : fu
            ),
            updatedAt: new Date().toISOString(),
          }));
        } else {
          setPatient((prev) => ({
            ...prev,
            images: [...prev.images, newImg],
            updatedAt: new Date().toISOString(),
          }));
        }
        showToast(t.toastImageAdded);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  // Add a new Consultation / Follow-up (+)
  const handleAddFollowUp = () => {
    isDirtyRef.current = true;
    const newFollowUp: PatientFollowUp = {
      id: `fu-${Date.now()}`,
      date: getFormattedNowDateTime(),
      symptoms: '',
      clinicalEvolution: '',
      newExam: '',
      echo: '',
      labs: '',
      investigations: '',
      differentialDiagnosis: '',
      waiting: '',
      treatment: '',
      images: [],
      createdAt: new Date().toISOString(),
    };

    setPatient((prev) => ({
      ...prev,
      followUps: [newFollowUp, ...prev.followUps],
      updatedAt: new Date().toISOString(),
    }));

    setActiveTab('followups');
    showToast(t.toastFollowUpAdded);
  };

  const updateFollowUpField = (id: string, field: keyof PatientFollowUp, val: any) => {
    isDirtyRef.current = true;
    setPatient((prev) => ({
      ...prev,
      followUps: prev.followUps.map((fu) => {
        if (fu.id !== id) return fu;
        if (field === 'symptoms') {
          return { ...fu, symptoms: val, clinicalEvolution: val };
        }
        return { ...fu, [field]: val };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteFollowUp = (id: string) => {
    if (window.confirm(t.deleteFollowUpConfirm)) {
      isDirtyRef.current = true;
      setPatient((prev) => ({
        ...prev,
        followUps: prev.followUps.filter((fu) => fu.id !== id),
        updatedAt: new Date().toISOString(),
      }));
      showToast(t.toastFollowUpDeleted);
    }
  };

  const hasAnyNewPatientContent = (p: PatientRecord): boolean => {
    const textFields = [
      p.name,
      p.age,
      p.address,
      p.phone,
      p.habits,
      p.medicalHistory,
      p.surgicalHistory,
      p.drugHistory,
      p.allergyHistory,
      p.familyHistory,
      p.symptoms,
      p.clinicalExam,
      p.echo,
      p.labs,
      p.otherInvestigations,
      p.differentialDiagnosis,
      p.waiting,
      p.treatment,
    ];
    return (
      textFields.some((f) => hasRichContent(f)) ||
      (p.images && p.images.length > 0) ||
      (p.followUps && p.followUps.length > 0)
    );
  };

  const flushAutoSave = async (source: 'autosave' | 'back') => {
    if (isAutoSavingInProgressRef.current) return;

    const current = latestPatientRef.current;
    const isBrandNew = !hasSavedOnceRef.current;
    const shouldAutoSave = isBrandNew
      ? hasAnyNewPatientContent(current)
      : isDirtyRef.current;

    if (!shouldAutoSave) return;

    isAutoSavingInProgressRef.current = true;
    if (source === 'autosave') {
      setAutoSaveStatus('saving');
    }

    try {
      const patientToSave: PatientRecord =
        isBrandNew && !current.name.trim()
          ? {
              ...current,
              name: `${t.unnamedPatientFallback} (${current.examDate})`,
              updatedAt: new Date().toISOString(),
            }
          : {
              ...current,
              updatedAt: new Date().toISOString(),
            };

      // Mark clean BEFORE awaiting so any keystroke typed during async save re-dirties properly
      isDirtyRef.current = false;

      await Promise.resolve(
        onSaveRef.current(patientToSave, {
          isNewCreation: isBrandNew,
          source,
        })
      );

      hasSavedOnceRef.current = true;
      setHasSavedOnce(true);

      if (source === 'autosave') {
        const nowTime = new Date().toLocaleTimeString(
          language === 'ar' ? 'ar-EG' : 'en-US',
          { hour: '2-digit', minute: '2-digit', second: '2-digit' }
        );
        setLastAutoSavedTime(nowTime);
        setAutoSaveStatus('saved');
      }
    } catch (err) {
      // Keep dirty so the next cycle retries cleanly
      isDirtyRef.current = true;
      if (source === 'autosave') {
        setAutoSaveStatus('idle');
      }
      console.error('Auto-save failed:', err);
    } finally {
      isAutoSavingInProgressRef.current = false;
    }
  };

  // Continuous background auto-save every 2.5 seconds while file is open
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      flushAutoSave('autosave');
    }, 2500);

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        flushAutoSave('autosave');
      }
    };

    const flushOnPageHide = () => {
      flushAutoSave('autosave');
    };

    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushOnPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushOnPageHide);
    };
  }, []);

  const handleBackClick = async () => {
    if (isAutoSavingBack || isSavingWord) return;

    const isBrandNew = !hasSavedOnceRef.current;
    const hasPending = isBrandNew
      ? hasAnyNewPatientContent(latestPatientRef.current)
      : isDirtyRef.current;

    if (hasPending) {
      setIsAutoSavingBack(true);
      try {
        await flushAutoSave('back');
      } finally {
        setIsAutoSavingBack(false);
      }
    }

    onBack();
  };

  // Register sequential Back support for PatientForm & enlarged Image lightbox
  useBackHandler('patient-form', true, handleBackClick);
  useBackHandler('patient-image-modal', Boolean(selectedImage), () => {
    setSelectedImage(null);
  });

  const handleSave = async () => {
    if (!patient.name.trim()) {
      setActiveTab('details');
      showToast(t.enterPatientNameWarning, 'warning');
      return;
    }

    setIsSavingWord(true);
    try {
      const wasNew = !hasSavedOnceRef.current;
      isDirtyRef.current = false;
      await Promise.resolve(
        onSave(patient, {
          isNewCreation: wasNew,
          source: 'save',
        })
      );
      hasSavedOnceRef.current = true;
      setHasSavedOnce(true);
      await exportPatientToWord(patient, language);
      showToast(t.toastSavedAndWordExported, 'success');
    } catch (err) {
      isDirtyRef.current = true;
      console.error('Word export failed:', err);
      showToast(t.toastWordExportError, 'warning');
    } finally {
      setIsSavingWord(false);
    }
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const TAB_ORDER = ['details', 'followups', 'images'] as const;

  const getCategoryBadgeLabel = (category: MedicalImage['category']): string | null => {
    if (category === 'echo') return t.categoryEchoBadge;
    if (category === 'lab') return t.categoryLabBadge;
    if (category === 'investigations' || category === 'xray') return t.categoryInvestigationsBadge;
    return null;
  };

  const allFollowUpImages = patient.followUps.flatMap((fu) =>
    (fu.images || []).map((img) => ({ img, followUpDate: fu.date }))
  );
  const totalImagesCount = patient.images.length + allFollowUpImages.length;

  const handleRootTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (selectedImage || e.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }
    const target = e.target as HTMLElement | null;
    const isInteractiveEdit = Boolean(
      target?.closest('[contenteditable="true"], input, textarea, select, [data-no-swipe="true"]')
    );
    const hasSelection = Boolean(window.getSelection()?.toString().trim());
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      ignored: isInteractiveEdit || hasSelection,
    };
  };

  const handleRootTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.ignored || e.changedTouches.length === 0) return;

    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;

    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.35) {
      return;
    }

    const currentIdx = TAB_ORDER.indexOf(activeTab);
    const step = isRTL ? (dx > 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
    const nextIdx = currentIdx + step;
    if (nextIdx >= 0 && nextIdx < TAB_ORDER.length) {
      setActiveTab(TAB_ORDER[nextIdx]);
    }
  };

  return (
    <div
      onTouchStart={handleRootTouchStart}
      onTouchEnd={handleRootTouchEnd}
      className="flex flex-col min-h-full pb-20 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 ${
            toastType === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
          } text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in-50 zoom-in-95 duration-200 no-print max-w-[90%] text-center`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Unified Sticky Top Header + Persistent Navigation Tabs */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs no-print">
        <header className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleBackClick}
              disabled={isAutoSavingBack || isSavingWord}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              title="Back"
            >
              <BackIcon className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                <span className="truncate">
                  {!hasSavedOnce ? t.createNewPatientTitle : patient.name || t.activeFile}
                </span>
                {hasSavedOnce && (
                  <span className="text-[10px] font-normal text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300 px-2 py-0.5 rounded-md border border-sky-100 dark:border-sky-800 shrink-0">
                    {t.activeFile}
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>
                  {t.examDatePrefix} {patient.examDate}
                </span>
                {autoSaveStatus === 'saving' && (
                  <span className="text-sky-600 dark:text-sky-400 font-semibold animate-pulse">
                    · {t.autoSavingLabel}
                  </span>
                )}
                {autoSaveStatus === 'saved' && lastAutoSavedTime && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    · {t.autoSavedLiveBadge} ({lastAutoSavedTime})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasSavedOnce && onDelete && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      language === 'ar'
                        ? `هل أنت متأكد من حذف ملف المريض (${patient.name}) نهائياً؟`
                        : `Are you sure you want to permanently delete (${patient.name})?`
                    )
                  ) {
                    onDelete(patient.id);
                  }
                }}
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                title={t.deleteFile}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={isSavingWord}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Save className={`w-4 h-4 ${isSavingWord ? 'animate-spin' : ''}`} />
              <span>{isSavingWord ? t.savingAndExportingWord : t.saveFile}</span>
            </button>
          </div>
        </header>

        {/* Always-Visible Navigation Tabs Bar */}
        <div className="px-3 pt-1 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-2.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'details'
                  ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>{t.basicDataAndExam}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('followups')}
              className={`px-2.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'followups'
                  ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t.patientFollowUps} ({patient.followUps.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className={`px-2.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'images'
                  ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t.imagesAndScans} ({totalImagesCount})
              </span>
            </button>
          </div>

          {/* Quick (+) Add Follow-up Button */}
          <button
            type="button"
            onClick={handleAddFollowUp}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 mb-1 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-lg text-[11px] font-bold transition-colors border border-teal-200 dark:border-teal-800 whitespace-nowrap shrink-0 cursor-pointer"
            title={t.newFollowUpBtn}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.newFollowUpBtn}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 space-y-4 max-w-4xl mx-auto w-full">

        {/* TAB 1: Patient Primary Details & Clinical Exam */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* 1. Basic Demographics Section (Always Open; Read Mode on Re-entry, Tap to Edit) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <User className="w-4 h-4 text-sky-600" />
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  {t.demographicsSection}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Patient Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.patientFullName} <span className="text-rose-500">*</span>
                  </label>
                  {isExistingFile && patient.name.trim() && editingDemoField !== 'name' ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingDemoField('name')}
                      className="w-full text-sm px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white cursor-pointer hover:border-sky-400 transition-all flex items-center justify-between gap-2 select-text"
                      dir={isRTL ? 'rtl' : 'ltr'}
                    >
                      <span>{patient.name}</span>
                      <Pencil className="w-3.5 h-3.5 text-sky-500 shrink-0 opacity-75" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      autoFocus={isExistingFile && editingDemoField === 'name'}
                      value={patient.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      onBlur={() => setEditingDemoField(null)}
                      placeholder={t.patientNamePlaceholder}
                      className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-semibold"
                      dir={isRTL ? 'rtl' : 'ltr'}
                    />
                  )}
                </div>

                {/* Age & Auto Exam Date (controlled by Field Settings) */}
                {(activeFieldSettings.demographics.age || activeFieldSettings.demographics.examDate) && (
                  <div className="grid grid-cols-2 gap-2">
                    {activeFieldSettings.demographics.age && (
                      <div className={!activeFieldSettings.demographics.examDate ? 'col-span-2' : ''}>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.age}
                        </label>
                        {isExistingFile && patient.age.trim() && editingDemoField !== 'age' ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setEditingDemoField('age')}
                            className="w-full text-sm px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white cursor-pointer hover:border-sky-400 transition-all flex items-center justify-between gap-1 select-text"
                            dir={isRTL ? 'rtl' : 'ltr'}
                          >
                            <span className="truncate">{patient.age}</span>
                            <Pencil className="w-3 h-3 text-sky-500 shrink-0 opacity-75" />
                          </div>
                        ) : (
                          <input
                            type="text"
                            autoFocus={isExistingFile && editingDemoField === 'age'}
                            value={patient.age}
                            onChange={(e) => updateField('age', e.target.value)}
                            onBlur={() => setEditingDemoField(null)}
                            placeholder={t.agePlaceholder}
                            className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                            dir={isRTL ? 'rtl' : 'ltr'}
                          />
                        )}
                      </div>
                    )}

                    {activeFieldSettings.demographics.examDate && (
                      <div className={!activeFieldSettings.demographics.age ? 'col-span-2' : ''}>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.examDateAuto}
                        </label>
                        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-sky-50/60 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-xl text-xs text-sky-800 dark:text-sky-300 font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>{patient.examDate}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Address */}
                {activeFieldSettings.demographics.address && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.residence}
                    </label>
                    {isExistingFile && patient.address.trim() && editingDemoField !== 'address' ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingDemoField('address')}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white cursor-pointer hover:border-sky-400 transition-all flex items-center justify-between gap-2 select-text"
                        dir={isRTL ? 'rtl' : 'ltr'}
                      >
                        <span>{patient.address}</span>
                        <Pencil className="w-3.5 h-3.5 text-sky-500 shrink-0 opacity-75" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        autoFocus={isExistingFile && editingDemoField === 'address'}
                        value={patient.address}
                        onChange={(e) => updateField('address', e.target.value)}
                        onBlur={() => setEditingDemoField(null)}
                        placeholder={t.residencePlaceholder}
                        className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                    )}
                  </div>
                )}

                {/* Phone */}
                {activeFieldSettings.demographics.phone && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.phone}
                    </label>
                    {isExistingFile && (patient.phone || '').trim() && editingDemoField !== 'phone' ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingDemoField('phone')}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white cursor-pointer hover:border-sky-400 transition-all flex items-center justify-between gap-2 select-text"
                        dir="ltr"
                      >
                        <span>{patient.phone}</span>
                        <Pencil className="w-3.5 h-3.5 text-sky-500 shrink-0 opacity-75" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        autoFocus={isExistingFile && editingDemoField === 'phone'}
                        value={patient.phone || ''}
                        onChange={(e) => updateField('phone', e.target.value)}
                        onBlur={() => setEditingDemoField(null)}
                        placeholder="05XXXXXXXX"
                        className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-mono"
                        dir="ltr"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Main Accordion: Medical History & Habits (Pale Blue Main Card, White Sub-Accordions) */}
            {(() => {
              if (!activeFieldSettings.main.history) return null;
              const historySubFields = [
                {
                  key: 'habits' as const,
                  label: t.habits,
                  value: patient.habits,
                  placeholder: t.habitsPlaceholder,
                  icon: <Activity className="w-3.5 h-3.5" />,
                },
                {
                  key: 'medicalHistory' as const,
                  label: t.medicalHistory,
                  value: patient.medicalHistory,
                  placeholder: t.medicalHistoryPlaceholder,
                  icon: <HeartPulse className="w-3.5 h-3.5" />,
                },
                {
                  key: 'surgicalHistory' as const,
                  label: t.surgicalHistory,
                  value: patient.surgicalHistory,
                  placeholder: t.surgicalHistoryPlaceholder,
                },
                {
                  key: 'drugHistory' as const,
                  label: t.drugHistory,
                  value: patient.drugHistory,
                  placeholder: t.drugHistoryPlaceholder,
                  icon: <Pill className="w-3.5 h-3.5" />,
                },
                {
                  key: 'allergyHistory' as const,
                  label: t.allergyHistory,
                  value: patient.allergyHistory,
                  placeholder: t.allergyHistoryPlaceholder,
                  hint: t.allergyHint,
                },
                {
                  key: 'familyHistory' as const,
                  label: t.familyHistory,
                  value: patient.familyHistory,
                  placeholder: t.familyHistoryPlaceholder,
                },
              ].filter((f) => activeFieldSettings.sub[f.key]);

              if (historySubFields.length === 0) return null;
              const filledHistoryCount = historySubFields.filter((f) => hasRichContent(f.value)).length;
              const hasAllergyAlert = hasRichContent(patient.allergyHistory);

              return (
                <div
                  className={`rounded-2xl p-4 shadow-xs transition-colors ${
                    hasAllergyAlert
                      ? 'bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-500 dark:border-rose-500'
                      : 'bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleMainSection('history')}
                    className="w-full flex items-center justify-between cursor-pointer select-none text-start"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Activity
                        className={`w-4 h-4 shrink-0 ${
                          hasAllergyAlert
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-sky-700 dark:text-sky-300'
                        }`}
                      />
                      <h2
                        className={`text-xs font-extrabold uppercase tracking-wide truncate ${
                          hasAllergyAlert
                            ? 'text-rose-900 dark:text-rose-100'
                            : 'text-sky-950 dark:text-sky-100'
                        }`}
                      >
                        {t.historySection}
                      </h2>
                      {hasAllergyAlert && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-rose-600 text-white px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                          <AlertTriangle className="w-3 h-3" />
                          {t.allergyAlertBadge}
                        </span>
                      )}
                      {filledHistoryCount > 0 && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono shrink-0 border ${
                            hasAllergyAlert
                              ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {filledHistoryCount}/{historySubFields.length}
                        </span>
                      )}
                    </div>
                    <span
                      className={`p-1 shrink-0 ${
                        hasAllergyAlert
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-sky-600 dark:text-sky-400'
                      }`}
                    >
                      {expandedMainSections.history ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {expandedMainSections.history && (
                    <div
                      className={`space-y-2.5 mt-3.5 pt-3 border-t ${
                        hasAllergyAlert
                          ? 'border-rose-200 dark:border-rose-800/70'
                          : 'border-sky-200/80 dark:border-sky-800/60'
                      }`}
                    >
                      {historySubFields.map((sub) => {
                        const isSubOpen = Boolean(expandedSubFields[sub.key]);
                        const isFilled = hasRichContent(sub.value);
                        const isAllergyRed = sub.key === 'allergyHistory' && isFilled;
                        return (
                          <div
                            key={sub.key}
                            className={`rounded-2xl overflow-hidden shadow-2xs transition-colors ${
                              isAllergyRed
                                ? 'border-2 border-rose-500 bg-rose-50/90 dark:bg-rose-950/50'
                                : 'border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSubField(sub.key)}
                              className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer transition-colors ${
                                isAllergyRed
                                  ? 'hover:bg-rose-100/70 dark:hover:bg-rose-900/40'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`shrink-0 ${
                                    isAllergyRed
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-sky-600 dark:text-sky-400'
                                  }`}
                                >
                                  {isAllergyRed ? (
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  ) : (
                                    sub.icon || <Activity className="w-3.5 h-3.5 opacity-70" />
                                  )}
                                </span>
                                <span
                                  className={`text-xs font-bold truncate ${
                                    isAllergyRed
                                      ? 'text-rose-800 dark:text-rose-200'
                                      : 'text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {sub.label}
                                </span>
                                {isFilled && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                      isAllergyRed
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300'
                                    }`}
                                  >
                                    {isAllergyRed ? t.allergyAlertBadge : t.recordedBadge}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`shrink-0 ${
                                  isAllergyRed ? 'text-rose-500' : 'text-slate-400'
                                }`}
                              >
                                {isSubOpen ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isSubOpen && (
                              <div
                                className={`px-3.5 pb-3.5 pt-1 border-t bg-white dark:bg-slate-900 ${
                                  isAllergyRed
                                    ? 'border-rose-200 dark:border-rose-800'
                                    : 'border-slate-200/70 dark:border-slate-800/70'
                                }`}
                              >
                                <RichClinicalField
                                  value={sub.value}
                                  onChange={(val) => updateField(sub.key, val)}
                                  placeholder={sub.placeholder}
                                  hint={sub.hint}
                                  readOnlyByDefault={isExistingFile}
                                  autoFocus={!isFilled}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. Main Accordion: Clinical Examination & Investigations (Pale Blue Main Card, White Sub-Accordions + Photo Attachments in Echo/Labs/Investigations) */}
            {(() => {
              if (!activeFieldSettings.main.clinical) return null;
              const clinicalSubFields: Array<{
                key: 'symptoms' | 'clinicalExam' | 'echo' | 'labs' | 'otherInvestigations';
                label: string;
                value: string;
                placeholder: string;
                minRows?: number;
                icon?: React.ReactNode;
                photoCategory?: MedicalImage['category'];
              }> = [
                {
                  key: 'symptoms',
                  label: t.symptoms,
                  value: patient.symptoms,
                  placeholder: t.symptomsPlaceholder,
                  minRows: 3,
                },
                {
                  key: 'clinicalExam',
                  label: t.clinicalExam,
                  value: patient.clinicalExam,
                  placeholder: t.clinicalExamPlaceholder,
                  minRows: 3,
                  icon: <Stethoscope className="w-3.5 h-3.5" />,
                },
                {
                  key: 'echo',
                  label: t.echo,
                  value: patient.echo,
                  placeholder: t.echoPlaceholder,
                  minRows: 2,
                  photoCategory: 'echo',
                },
                {
                  key: 'labs',
                  label: t.labs,
                  value: patient.labs,
                  placeholder: t.labsPlaceholder,
                  icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
                  minRows: 2,
                  photoCategory: 'lab',
                },
                {
                  key: 'otherInvestigations',
                  label: t.otherInvestigations,
                  value: patient.otherInvestigations,
                  placeholder: t.otherInvestigationsPlaceholder,
                  photoCategory: 'investigations',
                },
              ];

              const visibleClinicalSubFields = clinicalSubFields.filter(
                (f) => activeFieldSettings.sub[f.key]
              );

              if (visibleClinicalSubFields.length === 0) return null;

              const getMainFieldImages = (category?: MedicalImage['category']) => {
                if (!category) return [];
                if (category === 'investigations') {
                  return patient.images.filter(
                    (img) => img.category === 'investigations' || img.category === 'xray'
                  );
                }
                return patient.images.filter((img) => img.category === category);
              };

              const filledClinicalCount = visibleClinicalSubFields.filter(
                (f) => hasRichContent(f.value) || getMainFieldImages(f.photoCategory).length > 0
              ).length;

              return (
                <div className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-4 shadow-xs">
                  <button
                    type="button"
                    onClick={() => toggleMainSection('clinical')}
                    className="w-full flex items-center justify-between cursor-pointer select-none text-start"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Stethoscope className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
                      <h2 className="text-xs font-extrabold uppercase tracking-wide text-sky-950 dark:text-sky-100 truncate">
                        {t.clinicalSection}
                      </h2>
                      {filledClinicalCount > 0 && (
                        <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-mono shrink-0">
                          {filledClinicalCount}/{visibleClinicalSubFields.length}
                        </span>
                      )}
                    </div>
                    <span className="text-sky-600 dark:text-sky-400 p-1 shrink-0">
                      {expandedMainSections.clinical ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {expandedMainSections.clinical && (
                    <div className="space-y-2.5 mt-3.5 pt-3 border-t border-sky-200/80 dark:border-sky-800/60">
                      {visibleClinicalSubFields.map((sub) => {
                        const isSubOpen = Boolean(expandedSubFields[sub.key]);
                        const fieldImages = getMainFieldImages(sub.photoCategory);
                        const isFilled = hasRichContent(sub.value) || fieldImages.length > 0;
                        return (
                          <div
                            key={sub.key}
                            className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xs"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSubField(sub.key)}
                              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sky-600 dark:text-sky-400 shrink-0">
                                  {sub.icon || <Stethoscope className="w-3.5 h-3.5 opacity-70" />}
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {sub.label}
                                </span>
                                {isFilled && (
                                  <span className="text-[10px] font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-md shrink-0">
                                    {t.recordedBadge}
                                  </span>
                                )}
                                {fieldImages.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-md shrink-0 font-mono">
                                    <ImageIcon className="w-3 h-3" />
                                    {fieldImages.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-400 shrink-0">
                                {isSubOpen ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isSubOpen && (
                              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 space-y-2.5">
                                <RichClinicalField
                                  value={sub.value}
                                  onChange={(val) => updateField(sub.key, val)}
                                  placeholder={sub.placeholder}
                                  minRows={sub.minRows || 2}
                                  readOnlyByDefault={isExistingFile}
                                  autoFocus={!hasRichContent(sub.value)}
                                />

                                {sub.photoCategory && (
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          triggerImagePicker({
                                            target: 'main',
                                            category: sub.photoCategory!,
                                          })
                                        }
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                                      >
                                        <Camera className="w-3.5 h-3.5" />
                                        <span>{t.attachFieldPhotoBtn}</span>
                                      </button>
                                      {fieldImages.length > 0 && (
                                        <span className="text-[11px] font-semibold text-slate-400">
                                          {t.fieldAttachedPhotosLabel} ({fieldImages.length})
                                        </span>
                                      )}
                                    </div>

                                    {fieldImages.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {fieldImages.map((img) => (
                                          <div
                                            key={img.id}
                                            onClick={() => setSelectedImage(img)}
                                            className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-sky-400 transition-all shadow-2xs"
                                          >
                                            <img
                                              src={img.url}
                                              alt={img.name}
                                              className="w-full h-full object-cover"
                                              referrerPolicy="no-referrer"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 4. Main Accordion: Differential Diagnosis, Waiting & Treatment Plan (Pale Blue Main Card, White Sub-Accordions) */}
            {(() => {
              if (!activeFieldSettings.main.diagnosis) return null;
              const planSubFields = [
                {
                  key: 'differentialDiagnosis' as const,
                  label: t.differentialDiagnosis,
                  value: patient.differentialDiagnosis,
                  placeholder: t.differentialDiagnosisPlaceholder,
                  alwaysBoldPurple: true,
                  icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
                },
                {
                  key: 'waiting' as const,
                  label: t.waiting,
                  value: patient.waiting,
                  placeholder: t.waitingPlaceholder,
                  icon: <Clock className="w-3.5 h-3.5" />,
                },
                {
                  key: 'treatment' as const,
                  label: t.treatment,
                  value: patient.treatment,
                  placeholder: t.treatmentPlaceholder,
                  minRows: 4,
                  icon: <Pill className="w-3.5 h-3.5" />,
                },
              ].filter((f) => activeFieldSettings.sub[f.key]);

              if (planSubFields.length === 0) return null;
              const filledPlanCount = planSubFields.filter((f) => hasRichContent(f.value)).length;

              return (
                <div className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-4 shadow-xs">
                  <button
                    type="button"
                    onClick={() => toggleMainSection('diagnosis')}
                    className="w-full flex items-center justify-between cursor-pointer select-none text-start"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Pill className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
                      <h2 className="text-xs font-extrabold uppercase tracking-wide text-sky-950 dark:text-sky-100 truncate">
                        {t.planSection}
                      </h2>
                      {filledPlanCount > 0 && (
                        <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-mono shrink-0">
                          {filledPlanCount}/{planSubFields.length}
                        </span>
                      )}
                    </div>
                    <span className="text-sky-600 dark:text-sky-400 p-1 shrink-0">
                      {expandedMainSections.diagnosis ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {expandedMainSections.diagnosis && (
                    <div className="space-y-2.5 mt-3.5 pt-3 border-t border-sky-200/80 dark:border-sky-800/60">
                      {planSubFields.map((sub) => {
                        const isSubOpen = Boolean(expandedSubFields[sub.key]);
                        const isFilled = hasRichContent(sub.value);
                        return (
                          <div
                            key={sub.key}
                            className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs ${
                              sub.alwaysBoldPurple
                                ? 'border-purple-200 dark:border-purple-800/70'
                                : 'border-slate-200/90 dark:border-slate-800'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSubField(sub.key)}
                              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sky-600 dark:text-sky-400 shrink-0">
                                  {sub.icon}
                                </span>
                                <span
                                  className={`text-xs font-bold truncate ${
                                    sub.alwaysBoldPurple
                                      ? 'text-purple-800 dark:text-purple-300'
                                      : 'text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {sub.label}
                                </span>
                                {isFilled && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                      sub.alwaysBoldPurple
                                        ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300'
                                        : 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300'
                                    }`}
                                  >
                                    {t.recordedBadge}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-400 shrink-0">
                                {isSubOpen ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isSubOpen && (
                              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900">
                                <RichClinicalField
                                  value={sub.value}
                                  onChange={(val) => updateField(sub.key, val)}
                                  placeholder={sub.placeholder}
                                  minRows={sub.minRows || 2}
                                  readOnlyByDefault={isExistingFile}
                                  alwaysBoldPurple={Boolean(sub.alwaysBoldPurple)}
                                  autoFocus={!isFilled}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {(!activeFieldSettings.main.history &&
              !activeFieldSettings.main.clinical &&
              !activeFieldSettings.main.diagnosis) && (
              <div className="bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/70 rounded-2xl p-4 text-center text-xs font-semibold text-sky-900 dark:text-sky-200">
                {t.settingsAllHiddenHint}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Patient Consultations & Follow-ups (Matching New File except Demographics & History) */}
        {activeTab === 'followups' && (
          <div className="space-y-4">
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-sky-950 dark:text-sky-200 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-sky-600" />
                  <span>{t.followUpHistoryTitle}</span>
                </h3>
                <p className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
                  {t.followUpUnlimitedDesc}
                </p>
              </div>

              <button
                onClick={handleAddFollowUp}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.newFollowUpBtn}</span>
              </button>
            </div>

            {patient.followUps.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <HeartPulse className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3 stroke-[1.2]" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {t.noFollowUpsYet}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
                  {t.clickPlusToAddFollowUp}
                </p>
                <button
                  onClick={handleAddFollowUp}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addFirstFollowUpNow}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {patient.followUps.map((fu, idx) => {
                  const fuClinicalMainKey = `fu:${fu.id}:clinical`;
                  const fuDiagnosisMainKey = `fu:${fu.id}:diagnosis`;

                  const getFuImagesByCategory = (category?: MedicalImage['category']) => {
                    const list = fu.images || [];
                    if (!category) return [];
                    if (category === 'investigations') {
                      return list.filter(
                        (img) => img.category === 'investigations' || img.category === 'xray'
                      );
                    }
                    return list.filter((img) => img.category === category);
                  };

                  const fuClinicalSubs: Array<{
                    subSettingKey: 'symptoms' | 'clinicalExam' | 'echo' | 'labs' | 'otherInvestigations';
                    fuFieldKey: keyof PatientFollowUp;
                    label: string;
                    value: string;
                    placeholder: string;
                    minRows?: number;
                    icon?: React.ReactNode;
                    photoCategory?: MedicalImage['category'];
                  }> = [
                    {
                      subSettingKey: 'symptoms',
                      fuFieldKey: 'symptoms',
                      label: t.symptoms,
                      value: fu.symptoms !== undefined ? fu.symptoms : fu.clinicalEvolution,
                      placeholder: t.symptomsPlaceholder,
                      minRows: 3,
                    },
                    {
                      subSettingKey: 'clinicalExam',
                      fuFieldKey: 'newExam',
                      label: t.clinicalExam,
                      value: fu.newExam,
                      placeholder: t.clinicalExamPlaceholder,
                      minRows: 3,
                      icon: <Stethoscope className="w-3.5 h-3.5" />,
                    },
                    {
                      subSettingKey: 'echo',
                      fuFieldKey: 'echo',
                      label: t.echo,
                      value: fu.echo || '',
                      placeholder: t.echoPlaceholder,
                      minRows: 2,
                      photoCategory: 'echo',
                    },
                    {
                      subSettingKey: 'labs',
                      fuFieldKey: 'labs',
                      label: t.labs,
                      value: fu.labs,
                      placeholder: t.labsPlaceholder,
                      icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
                      minRows: 2,
                      photoCategory: 'lab',
                    },
                    {
                      subSettingKey: 'otherInvestigations',
                      fuFieldKey: 'investigations',
                      label: t.otherInvestigations,
                      value: fu.investigations,
                      placeholder: t.otherInvestigationsPlaceholder,
                      photoCategory: 'investigations',
                    },
                  ];

                  const visibleFuClinicalSubs = fuClinicalSubs.filter(
                    (f) => activeFieldSettings.sub[f.subSettingKey]
                  );

                  const fuDiagnosisSubs: Array<{
                    subSettingKey: 'differentialDiagnosis' | 'waiting' | 'treatment';
                    fuFieldKey: keyof PatientFollowUp;
                    label: string;
                    value: string;
                    placeholder: string;
                    minRows?: number;
                    alwaysBoldPurple?: boolean;
                    icon: React.ReactNode;
                  }> = [
                    {
                      subSettingKey: 'differentialDiagnosis',
                      fuFieldKey: 'differentialDiagnosis',
                      label: t.differentialDiagnosis,
                      value: fu.differentialDiagnosis || '',
                      placeholder: t.differentialDiagnosisPlaceholder,
                      alwaysBoldPurple: true,
                      icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
                    },
                    {
                      subSettingKey: 'waiting',
                      fuFieldKey: 'waiting',
                      label: t.waiting,
                      value: fu.waiting,
                      placeholder: t.waitingPlaceholder,
                      icon: <Clock className="w-3.5 h-3.5" />,
                    },
                    {
                      subSettingKey: 'treatment',
                      fuFieldKey: 'treatment',
                      label: t.treatment,
                      value: fu.treatment,
                      placeholder: t.treatmentPlaceholder,
                      minRows: 4,
                      icon: <Pill className="w-3.5 h-3.5" />,
                    },
                  ];

                  const visibleFuDiagnosisSubs = fuDiagnosisSubs.filter(
                    (f) => activeFieldSettings.sub[f.subSettingKey]
                  );

                  return (
                    <div
                      key={fu.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative group space-y-3"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold font-mono">
                            {patient.followUps.length - idx}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {t.followUpItemTitle}
                            </h4>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Clock className="w-3 h-3 text-sky-500" />
                              <span>{t.autoDatePrefix} {fu.date}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              triggerImagePicker({
                                target: 'followup',
                                followUpId: fu.id,
                                category: 'general',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs transition-colors cursor-pointer"
                            title={t.attachImagesToFollowUp}
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                            <span>{t.attachImagesToFollowUp} ({fu.images?.length || 0})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFollowUp(fu.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Main Accordion A in Consultation: Clinical Examination & Investigations (Pale Blue Main Card) */}
                      {activeFieldSettings.main.clinical && visibleFuClinicalSubs.length > 0 && (() => {
                        const isMainOpen = Boolean(expandedMainSections[fuClinicalMainKey]);
                        const filledCount = visibleFuClinicalSubs.filter(
                          (f) => hasRichContent(f.value) || getFuImagesByCategory(f.photoCategory).length > 0
                        ).length;

                        return (
                          <div className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-3.5 shadow-xs">
                            <button
                              type="button"
                              onClick={() => toggleMainSection(fuClinicalMainKey)}
                              className="w-full flex items-center justify-between cursor-pointer select-none text-start"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Stethoscope className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
                                <h5 className="text-xs font-extrabold uppercase tracking-wide text-sky-950 dark:text-sky-100 truncate">
                                  {t.clinicalSection}
                                </h5>
                                {filledCount > 0 && (
                                  <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-mono shrink-0">
                                    {filledCount}/{visibleFuClinicalSubs.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-sky-600 dark:text-sky-400 p-1 shrink-0">
                                {isMainOpen ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isMainOpen && (
                              <div className="space-y-2.5 mt-3 pt-3 border-t border-sky-200/80 dark:border-sky-800/60">
                                {visibleFuClinicalSubs.map((sub) => {
                                  const fuSubKey = `${fu.id}:${sub.subSettingKey}`;
                                  const isSubOpen = Boolean(expandedSubFields[fuSubKey]);
                                  const fieldImages = getFuImagesByCategory(sub.photoCategory);
                                  const isFilled = hasRichContent(sub.value) || fieldImages.length > 0;
                                  return (
                                    <div
                                      key={fuSubKey}
                                      className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xs"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => toggleSubField(fuSubKey)}
                                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-sky-600 dark:text-sky-400 shrink-0">
                                            {sub.icon || <Stethoscope className="w-3.5 h-3.5 opacity-70" />}
                                          </span>
                                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                            {sub.label}
                                          </span>
                                          {isFilled && (
                                            <span className="text-[10px] font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-md shrink-0">
                                              {t.recordedBadge}
                                            </span>
                                          )}
                                          {fieldImages.length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-md shrink-0 font-mono">
                                              <ImageIcon className="w-3 h-3" />
                                              {fieldImages.length}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-slate-400 shrink-0">
                                          {isSubOpen ? (
                                            <ChevronUp className="w-4 h-4" />
                                          ) : (
                                            <ChevronDown className="w-4 h-4" />
                                          )}
                                        </span>
                                      </button>

                                      {isSubOpen && (
                                        <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 space-y-2.5">
                                          <RichClinicalField
                                            value={sub.value}
                                            onChange={(val) =>
                                              updateFollowUpField(fu.id, sub.fuFieldKey, val)
                                            }
                                            placeholder={sub.placeholder}
                                            minRows={sub.minRows || 2}
                                            readOnlyByDefault={isExistingFile}
                                            autoFocus={!hasRichContent(sub.value)}
                                          />

                                          {sub.photoCategory && (
                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    triggerImagePicker({
                                                      target: 'followup',
                                                      followUpId: fu.id,
                                                      category: sub.photoCategory!,
                                                    })
                                                  }
                                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                                                >
                                                  <Camera className="w-3.5 h-3.5" />
                                                  <span>{t.attachFieldPhotoBtn}</span>
                                                </button>
                                                {fieldImages.length > 0 && (
                                                  <span className="text-[11px] font-semibold text-slate-400">
                                                    {t.fieldAttachedPhotosLabel} ({fieldImages.length})
                                                  </span>
                                                )}
                                              </div>

                                              {fieldImages.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                  {fieldImages.map((img) => (
                                                    <div
                                                      key={img.id}
                                                      onClick={() => setSelectedImage(img)}
                                                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-sky-400 transition-all shadow-2xs"
                                                    >
                                                      <img
                                                        src={img.url}
                                                        alt={img.name}
                                                        className="w-full h-full object-cover"
                                                        referrerPolicy="no-referrer"
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Main Accordion B in Consultation: Differential Diagnosis, Waiting & Treatment Plan (Pale Blue Main Card) */}
                      {activeFieldSettings.main.diagnosis && visibleFuDiagnosisSubs.length > 0 && (() => {
                        const isMainOpen = Boolean(expandedMainSections[fuDiagnosisMainKey]);
                        const filledCount = visibleFuDiagnosisSubs.filter((f) =>
                          hasRichContent(f.value)
                        ).length;

                        return (
                          <div className="bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-3.5 shadow-xs">
                            <button
                              type="button"
                              onClick={() => toggleMainSection(fuDiagnosisMainKey)}
                              className="w-full flex items-center justify-between cursor-pointer select-none text-start"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Pill className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
                                <h5 className="text-xs font-extrabold uppercase tracking-wide text-sky-950 dark:text-sky-100 truncate">
                                  {t.planSection}
                                </h5>
                                {filledCount > 0 && (
                                  <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-mono shrink-0">
                                    {filledCount}/{visibleFuDiagnosisSubs.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-sky-600 dark:text-sky-400 p-1 shrink-0">
                                {isMainOpen ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isMainOpen && (
                              <div className="space-y-2.5 mt-3 pt-3 border-t border-sky-200/80 dark:border-sky-800/60">
                                {visibleFuDiagnosisSubs.map((sub) => {
                                  const fuSubKey = `${fu.id}:${sub.subSettingKey}`;
                                  const isSubOpen = Boolean(expandedSubFields[fuSubKey]);
                                  const isFilled = hasRichContent(sub.value);
                                  return (
                                    <div
                                      key={fuSubKey}
                                      className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs ${
                                        sub.alwaysBoldPurple
                                          ? 'border-purple-200 dark:border-purple-800/70'
                                          : 'border-slate-200/90 dark:border-slate-800'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => toggleSubField(fuSubKey)}
                                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-sky-600 dark:text-sky-400 shrink-0">
                                            {sub.icon}
                                          </span>
                                          <span
                                            className={`text-xs font-bold truncate ${
                                              sub.alwaysBoldPurple
                                                ? 'text-purple-800 dark:text-purple-300'
                                                : 'text-slate-800 dark:text-slate-200'
                                            }`}
                                          >
                                            {sub.label}
                                          </span>
                                          {isFilled && (
                                            <span
                                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                                sub.alwaysBoldPurple
                                                  ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300'
                                                  : 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300'
                                              }`}
                                            >
                                              {t.recordedBadge}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-slate-400 shrink-0">
                                          {isSubOpen ? (
                                            <ChevronUp className="w-4 h-4" />
                                          ) : (
                                            <ChevronDown className="w-4 h-4" />
                                          )}
                                        </span>
                                      </button>

                                      {isSubOpen && (
                                        <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900">
                                          <RichClinicalField
                                            value={sub.value}
                                            onChange={(val) =>
                                              updateFollowUpField(fu.id, sub.fuFieldKey, val)
                                            }
                                            placeholder={sub.placeholder}
                                            minRows={sub.minRows || 2}
                                            readOnlyByDefault={isExistingFile}
                                            alwaysBoldPurple={Boolean(sub.alwaysBoldPurple)}
                                            autoFocus={!isFilled}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {fu.images && fu.images.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-semibold text-slate-500 mb-2 block">
                            {t.attachedImagesToVisit}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {fu.images.map((img) => {
                              const badge = getCategoryBadgeLabel(img.category);
                              return (
                                <div
                                  key={img.id}
                                  onClick={() => setSelectedImage(img)}
                                  className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 group/img"
                                >
                                  <img
                                    src={img.url}
                                    alt={img.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  {badge && (
                                    <span className="absolute bottom-0 inset-x-0 bg-black/65 text-white text-[9px] font-bold text-center py-0.5 truncate px-1">
                                      {badge}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Images Gallery */}
        {activeTab === 'images' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-sky-600" />
                  <span>{t.galleryTitle}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{t.galleryDesc}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerImagePicker({ target: 'main', category: 'general' })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>{t.addPhotoCamera}</span>
                </button>
              </div>
            </div>

            {totalImagesCount === 0 ? (
              <div
                onClick={() => triggerImagePicker({ target: 'main', category: 'general' })}
                className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center cursor-pointer hover:border-sky-400 dark:hover:border-sky-600 transition-colors bg-white/50 dark:bg-slate-900/50"
              >
                <ImageIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-2 stroke-[1.2]" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {t.noImagesYet}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {t.clickToUploadImage}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {patient.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {patient.images.map((img) => {
                      const badge = getCategoryBadgeLabel(img.category);
                      return (
                        <div
                          key={img.id}
                          onClick={() => setSelectedImage(img)}
                          className="relative group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs cursor-pointer hover:border-sky-400 transition-all"
                        >
                          <div className="relative aspect-square bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                            {badge && (
                              <span className="absolute top-2 left-2 bg-sky-700/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-xs">
                                {badge}
                              </span>
                            )}
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {img.name || 'Scan'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{img.date}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {allFollowUpImages.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 px-1">
                      {t.attachedImagesToVisit} ({allFollowUpImages.length})
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {allFollowUpImages.map(({ img, followUpDate }) => {
                        const badge = getCategoryBadgeLabel(img.category);
                        return (
                          <div
                            key={img.id}
                            onClick={() => setSelectedImage(img)}
                            className="relative group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs cursor-pointer hover:border-sky-400 transition-all"
                          >
                            <div className="relative aspect-square bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <img
                                src={img.url}
                                alt={img.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                referrerPolicy="no-referrer"
                              />
                              {badge && (
                                <span className="absolute top-2 left-2 bg-teal-700/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-xs">
                                  {badge}
                                </span>
                              )}
                            </div>
                            <div className="p-2.5">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {img.name || 'Scan'}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{followUpDate}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <input
        ref={unifiedFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />

      <ImageModal
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={(id) => {
          isDirtyRef.current = true;
          setPatient((prev) => ({
            ...prev,
            images: prev.images.filter((img) => img.id !== id),
            followUps: prev.followUps.map((fu) => ({
              ...fu,
              images: fu.images?.filter((img) => img.id !== id) || [],
            })),
            updatedAt: new Date().toISOString(),
          }));
          showToast(t.toastImageDeleted);
        }}
      />
    </div>
  );
};
