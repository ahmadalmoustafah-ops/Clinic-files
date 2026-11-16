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
} from 'lucide-react';
import { PatientRecord, PatientFollowUp, MedicalImage } from '../types';
import { AutoResizeTextarea } from './AutoResizeTextarea';
import { ImageModal } from './ImageModal';
import { useLanguage } from '../context/LanguageContext';
import { exportPatientToWord } from '../services/wordExportService';

export interface PatientSaveMeta {
  isNewCreation: boolean;
  source: 'save' | 'back';
}

interface PatientFormProps {
  initialPatient?: PatientRecord | null;
  onSave: (patient: PatientRecord, meta?: PatientSaveMeta) => void | Promise<void>;
  onDelete?: (patientId: string) => void;
  onBack: () => void;
  autoAddFollowUp?: boolean;
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
}) => {
  const { t, isRTL, language } = useLanguage();
  const isNew = !initialPatient;

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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    history: false,
    clinical: false,
    diagnosis: false,
  });

  const hasSavedOnceRef = useRef<boolean>(!isNew);
  const isDirtyRef = useRef<boolean>(false);
  const [isAutoSavingBack, setIsAutoSavingBack] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const followUpFileInputRef = useRef<HTMLInputElement>(null);
  const [activeFollowUpIdForUpload, setActiveFollowUpIdForUpload] = useState<string | null>(null);

  // Auto-add follow-up if requested via search bar quick action
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

  const toggleSection = (sec: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Handle image upload from file or camera
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, followUpId?: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newImg: MedicalImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: base64,
          date: getFormattedToday(),
          category: 'general',
        };

        isDirtyRef.current = true;
        if (followUpId) {
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

  // Add a new Follow-up (+)
  const handleAddFollowUp = () => {
    isDirtyRef.current = true;
    const newFollowUp: PatientFollowUp = {
      id: `fu-${Date.now()}`,
      date: getFormattedNowDateTime(),
      clinicalEvolution: '',
      newExam: '',
      labs: '',
      investigations: '',
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
      followUps: prev.followUps.map((fu) => (fu.id === id ? { ...fu, [field]: val } : fu)),
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
      textFields.some((f) => Boolean(f && f.trim().length > 0)) ||
      (p.images && p.images.length > 0) ||
      (p.followUps && p.followUps.length > 0)
    );
  };

  const handleBackClick = async () => {
    if (isAutoSavingBack || isSavingWord) return;

    const isBrandNew = !hasSavedOnceRef.current;
    const shouldAutoSave = isBrandNew ? hasAnyNewPatientContent(patient) : isDirtyRef.current;

    if (shouldAutoSave) {
      setIsAutoSavingBack(true);
      try {
        const patientToSave: PatientRecord =
          isBrandNew && !patient.name.trim()
            ? {
                ...patient,
                name: `${t.unnamedPatientFallback} (${patient.examDate})`,
                updatedAt: new Date().toISOString(),
              }
            : {
                ...patient,
                updatedAt: new Date().toISOString(),
              };

        await Promise.resolve(
          onSave(patientToSave, {
            isNewCreation: isBrandNew,
            source: 'back',
          })
        );
        hasSavedOnceRef.current = true;
        isDirtyRef.current = false;
      } catch (err) {
        console.error('Auto-save on back failed:', err);
      } finally {
        setIsAutoSavingBack(false);
      }
    }

    onBack();
  };

  const handleSave = async () => {
    if (!patient.name.trim()) {
      setActiveTab('details');
      showToast(t.enterPatientNameWarning, 'warning');
      return;
    }

    setIsSavingWord(true);
    try {
      const wasNew = !hasSavedOnceRef.current;
      await Promise.resolve(
        onSave(patient, {
          isNewCreation: wasNew,
          source: 'save',
        })
      );
      hasSavedOnceRef.current = true;
      isDirtyRef.current = false;
      await exportPatientToWord(patient, language);
      showToast(t.toastSavedAndWordExported, 'success');
    } catch (err) {
      console.error('Word export failed:', err);
      showToast(t.toastWordExportError, 'warning');
    } finally {
      setIsSavingWord(false);
    }
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-col min-h-full pb-20 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
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

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackClick}
            disabled={isAutoSavingBack || isSavingWord}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title="Back"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{!hasSavedOnceRef.current ? t.createNewPatientTitle : patient.name || t.activeFile}</span>
              {hasSavedOnceRef.current && (
                <span className="text-[11px] font-normal text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300 px-2 py-0.5 rounded-md border border-sky-100 dark:border-sky-800">
                  {t.activeFile}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400">
              {t.examDatePrefix} {patient.examDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!isNew && onDelete && (
            <button
              onClick={() => {
                if (window.confirm(language === 'ar' ? `هل أنت متأكد من حذف ملف المريض (${patient.name}) نهائياً؟` : `Are you sure you want to permanently delete (${patient.name})?`)) {
                  onDelete(patient.id);
                }
              }}
              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
              title={t.deleteFile}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSavingWord}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Save className={`w-4 h-4 ${isSavingWord ? 'animate-spin' : ''}`} />
            <span>{isSavingWord ? t.savingAndExportingWord : t.saveFile}</span>
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-2 flex items-center justify-between no-print">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t.basicDataAndExam}</span>
          </button>

          <button
            onClick={() => setActiveTab('followups')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'followups'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" />
            <span>
              {t.patientFollowUps} ({patient.followUps.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'images'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>
              {t.imagesAndScans} ({patient.images.length})
            </span>
          </button>
        </div>

        {/* Quick (+) Add Follow-up Button */}
        <button
          onClick={handleAddFollowUp}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold transition-colors border border-teal-200 dark:border-teal-800"
          title={t.newFollowUpBtn}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.newFollowUpBtn}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-4 space-y-4 max-w-4xl mx-auto w-full">

        {/* TAB 1: Patient Primary Details & Clinical Exam */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* 1. Basic Demographics Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <User className="w-4 h-4 text-sky-600" />
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  {t.demographicsSection}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.patientFullName} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={patient.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder={t.patientNamePlaceholder}
                    className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-semibold"
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.age}
                    </label>
                    <input
                      type="text"
                      value={patient.age}
                      onChange={(e) => updateField('age', e.target.value)}
                      placeholder={t.agePlaceholder}
                      className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                      dir={isRTL ? 'rtl' : 'ltr'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.examDateAuto}
                    </label>
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-sky-50/60 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-xl text-xs text-sky-800 dark:text-sky-300 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>{patient.examDate}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.residence}
                  </label>
                  <input
                    type="text"
                    value={patient.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder={t.residencePlaceholder}
                    className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.phone}
                  </label>
                  <input
                    type="text"
                    value={patient.phone || ''}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full text-sm px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* 2. Medical History & Habits */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div
                onClick={() => toggleSection('history')}
                className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    {t.historySection}
                  </h2>
                </div>
                <button className="text-slate-400 p-1">
                  {collapsedSections.history ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>

              {!collapsedSections.history && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
                  <AutoResizeTextarea
                    label={t.habits}
                    value={patient.habits}
                    onChange={(val) => updateField('habits', val)}
                    placeholder={t.habitsPlaceholder}
                    icon={<Activity className="w-3.5 h-3.5" />}
                  />

                  <AutoResizeTextarea
                    label={t.medicalHistory}
                    value={patient.medicalHistory}
                    onChange={(val) => updateField('medicalHistory', val)}
                    placeholder={t.medicalHistoryPlaceholder}
                    icon={<HeartPulse className="w-3.5 h-3.5" />}
                  />

                  <AutoResizeTextarea
                    label={t.surgicalHistory}
                    value={patient.surgicalHistory}
                    onChange={(val) => updateField('surgicalHistory', val)}
                    placeholder={t.surgicalHistoryPlaceholder}
                  />

                  <AutoResizeTextarea
                    label={t.drugHistory}
                    value={patient.drugHistory}
                    onChange={(val) => updateField('drugHistory', val)}
                    placeholder={t.drugHistoryPlaceholder}
                    icon={<Pill className="w-3.5 h-3.5" />}
                  />

                  <AutoResizeTextarea
                    label={t.allergyHistory}
                    value={patient.allergyHistory}
                    onChange={(val) => updateField('allergyHistory', val)}
                    placeholder={t.allergyHistoryPlaceholder}
                    hint={t.allergyHint}
                  />

                  <AutoResizeTextarea
                    label={t.familyHistory}
                    value={patient.familyHistory}
                    onChange={(val) => updateField('familyHistory', val)}
                    placeholder={t.familyHistoryPlaceholder}
                  />
                </div>
              )}
            </div>

            {/* 3. Clinical Examination & Investigations */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div
                onClick={() => toggleSection('clinical')}
                className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-sky-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    {t.clinicalSection}
                  </h2>
                </div>
                <button className="text-slate-400 p-1">
                  {collapsedSections.clinical ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>

              {!collapsedSections.clinical && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
                  <div className="md:col-span-2">
                    <AutoResizeTextarea
                      label={t.symptoms}
                      value={patient.symptoms}
                      onChange={(val) => updateField('symptoms', val)}
                      placeholder={t.symptomsPlaceholder}
                      minRows={3}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <AutoResizeTextarea
                      label={t.clinicalExam}
                      value={patient.clinicalExam}
                      onChange={(val) => updateField('clinicalExam', val)}
                      placeholder={t.clinicalExamPlaceholder}
                      minRows={3}
                      icon={<Stethoscope className="w-3.5 h-3.5" />}
                    />
                  </div>

                  <AutoResizeTextarea
                    label={t.echo}
                    value={patient.echo}
                    onChange={(val) => updateField('echo', val)}
                    placeholder={t.echoPlaceholder}
                    minRows={2}
                  />

                  <AutoResizeTextarea
                    label={t.labs}
                    value={patient.labs}
                    onChange={(val) => updateField('labs', val)}
                    placeholder={t.labsPlaceholder}
                    icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                    minRows={2}
                  />

                  <div className="md:col-span-2">
                    <AutoResizeTextarea
                      label={t.otherInvestigations}
                      value={patient.otherInvestigations}
                      onChange={(val) => updateField('otherInvestigations', val)}
                      placeholder={t.otherInvestigationsPlaceholder}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. Diagnosis, Waiting & Treatment Plan */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div
                onClick={() => toggleSection('diagnosis')}
                className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-sky-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    {t.planSection}
                  </h2>
                </div>
                <button className="text-slate-400 p-1">
                  {collapsedSections.diagnosis ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>

              {!collapsedSections.diagnosis && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
                  <AutoResizeTextarea
                    label={t.differentialDiagnosis}
                    value={patient.differentialDiagnosis}
                    onChange={(val) => updateField('differentialDiagnosis', val)}
                    placeholder={t.differentialDiagnosisPlaceholder}
                  />

                  <AutoResizeTextarea
                    label={t.waiting}
                    value={patient.waiting}
                    onChange={(val) => updateField('waiting', val)}
                    placeholder={t.waitingPlaceholder}
                    icon={<Clock className="w-3.5 h-3.5" />}
                  />

                  <div className="md:col-span-2">
                    <AutoResizeTextarea
                      label={t.treatment}
                      value={patient.treatment}
                      onChange={(val) => updateField('treatment', val)}
                      placeholder={t.treatmentPlaceholder}
                      minRows={4}
                      icon={<Pill className="w-3.5 h-3.5" />}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Patient Follow-ups Section */}
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addFirstFollowUpNow}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {patient.followUps.map((fu, idx) => (
                  <div
                    key={fu.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative group"
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
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
                          onClick={() => {
                            setActiveFollowUpIdForUpload(fu.id);
                            followUpFileInputRef.current?.click();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs transition-colors"
                          title={t.attachImagesToFollowUp}
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                          <span>{t.attachImagesToFollowUp} ({fu.images?.length || 0})</span>
                        </button>

                        <button
                          onClick={() => handleDeleteFollowUp(fu.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div className="md:col-span-2">
                        <AutoResizeTextarea
                          label={t.clinicalEvolution}
                          value={fu.clinicalEvolution}
                          onChange={(val) => updateFollowUpField(fu.id, 'clinicalEvolution', val)}
                          placeholder={t.clinicalEvolutionPlaceholder}
                          minRows={2}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <AutoResizeTextarea
                          label={t.newExam}
                          value={fu.newExam}
                          onChange={(val) => updateFollowUpField(fu.id, 'newExam', val)}
                          placeholder={t.newExamPlaceholder}
                          minRows={2}
                          icon={<Stethoscope className="w-3.5 h-3.5" />}
                        />
                      </div>

                      <AutoResizeTextarea
                        label={t.labsFollowUp}
                        value={fu.labs}
                        onChange={(val) => updateFollowUpField(fu.id, 'labs', val)}
                        placeholder={t.labsPlaceholder}
                        icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                      />

                      <AutoResizeTextarea
                        label={t.investigationsFollowUp}
                        value={fu.investigations}
                        onChange={(val) => updateFollowUpField(fu.id, 'investigations', val)}
                        placeholder={t.otherInvestigationsPlaceholder}
                      />

                      <AutoResizeTextarea
                        label={t.waitingFollowUp}
                        value={fu.waiting}
                        onChange={(val) => updateFollowUpField(fu.id, 'waiting', val)}
                        placeholder={t.waitingPlaceholder}
                        icon={<Clock className="w-3.5 h-3.5" />}
                      />

                      <div className="md:col-span-2">
                        <AutoResizeTextarea
                          label={t.treatmentFollowUp}
                          value={fu.treatment}
                          onChange={(val) => updateFollowUpField(fu.id, 'treatment', val)}
                          placeholder={t.treatmentPlaceholder}
                          icon={<Pill className="w-3.5 h-3.5" />}
                          minRows={3}
                        />
                      </div>
                    </div>

                    {fu.images && fu.images.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-semibold text-slate-500 mb-2 block">
                          {t.attachedImagesToVisit}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {fu.images.map((img) => (
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
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
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
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>{t.addPhotoCamera}</span>
                </button>
              </div>
            </div>

            {patient.images.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {patient.images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className="relative group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs cursor-pointer hover:border-sky-400 transition-all"
                  >
                    <div className="aspect-square bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {img.name || 'Scan'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{img.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImageUpload(e)}
      />

      <input
        ref={followUpFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (activeFollowUpIdForUpload) {
            handleImageUpload(e, activeFollowUpIdForUpload);
          }
        }}
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
