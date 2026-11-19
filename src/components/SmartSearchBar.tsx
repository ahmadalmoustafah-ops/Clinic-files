import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  User,
  PlusCircle,
  Stethoscope,
  X,
  Calendar,
  Sparkles,
  HeartPulse,
} from 'lucide-react';
import { PatientRecord } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useBackHandler } from '../services/navigationHistory';
import { stripHtmlToPlainText } from '../utils/richTextUtils';

interface SmartSearchBarProps {
  patients: PatientRecord[];
  onOpenPatient: (patientId: string, action?: 'view' | 'add-followup' | 'new-consultation') => void;
  onNewPatient: () => void;
}

// Normalize Arabic letters
function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove diacritics
    .trim()
    .toLowerCase();
}

// Helper to normalize dates into YYYY-MM-DD or standard tokens
function normalizeDateQuery(input: string): string {
  const trimmed = input.trim();
  // If in format DD/MM/YYYY or DD-MM-YYYY, convert to YYYY-MM-DD
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  // If in format YYYY/MM/DD, convert to YYYY-MM-DD
  return trimmed.replace(/\//g, '-');
}

export const SmartSearchBar: React.FC<SmartSearchBarProps> = ({
  patients,
  onOpenPatient,
  onNewPatient,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { t, isRTL } = useLanguage();

  const normalizedQuery = normalizeArabic(query);
  const dateQuery = normalizeDateQuery(query);

  // Check if query is likely a date (e.g. contains 4-digit year or dashes/slashes or numbers like 2026-11)
  const isDateSearch = useMemo(() => {
    const q = query.trim();
    return /\d{4}[-/]\d{1,2}/.test(q) || /\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(q) || /^\d{4}-\d{2}-\d{2}$/.test(dateQuery);
  }, [query, dateQuery]);

  // Compute matched patients with metadata indicating why they matched (new exam, follow-up, or name)
  const matchedPatientsWithReasons = useMemo(() => {
    if (!query.trim()) return [];

    return patients
      .map((p) => {
        const normName = normalizeArabic(p.name);
        const normPhone = p.phone || '';
        const normAddress = normalizeArabic(p.address || '');

        // 1. Check Date Matches:
        // A: Is it a New Patient Examination created on this date?
        const isNewExamOnDate =
          p.examDate === dateQuery ||
          p.examDate.includes(dateQuery) ||
          (p.createdAt && p.createdAt.startsWith(dateQuery));

        // B: Did this patient have a Follow-Up visit on this date?
        const matchingFollowUps =
          p.followUps?.filter((fu) => {
            return (
              fu.date.includes(dateQuery) ||
              (fu.createdAt && fu.createdAt.startsWith(dateQuery))
            );
          }) || [];

        const hasFollowUpOnDate = matchingFollowUps.length > 0;

        // 2. Check Name / Phone / Address Matches:
        const isTextMatch =
          normName.includes(normalizedQuery) ||
          normPhone.includes(normalizedQuery) ||
          normAddress.includes(normalizedQuery);

        const isMatch = isTextMatch || isNewExamOnDate || hasFollowUpOnDate;

        return {
          patient: p,
          isMatch,
          isNewExamOnDate,
          hasFollowUpOnDate,
          matchingFollowUps,
          isTextMatch,
        };
      })
      .filter((item) => item.isMatch);
  }, [patients, query, normalizedQuery, dateQuery]);

  useBackHandler(
    'smart-search-dropdown',
    isOpen && query.trim().length > 0,
    () => {
      setIsOpen(false);
    }
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (patientId: string, action: 'view' | 'add-followup' | 'new-consultation') => {
    setIsOpen(false);
    onOpenPatient(patientId, action);
  };

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setQuery(e.target.value);
      setIsOpen(true);
    }
  };

  const newExamsCount = matchedPatientsWithReasons.filter((m) => m.isNewExamOnDate).length;
  const followUpsCount = matchedPatientsWithReasons.filter((m) => m.hasFollowUpOnDate).length;

  return (
    <div ref={containerRef} className="relative w-full z-20">
      <div className="relative flex items-center">
        {/* Search Icon */}
        <div
          className={`absolute ${
            isRTL ? 'right-3.5' : 'left-3.5'
          } text-sky-600 pointer-events-none flex items-center justify-center`}
        >
          <Search className="w-5 h-5" />
        </div>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={t.searchPlaceholder}
          className={`w-full ${
            isRTL ? 'pl-20 pr-11' : 'pr-20 pl-11'
          } py-3 text-sm bg-white/95 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all`}
          dir={isRTL ? 'rtl' : 'ltr'}
        />

        {/* Action icons inside the search input */}
        <div
          className={`absolute ${
            isRTL ? 'left-3' : 'right-3'
          } flex items-center gap-1.5`}
        >
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Calendar Picker Trigger */}
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current?.showPicker() : dateInputRef.current?.click()}
            className="p-1.5 text-sky-600 hover:text-sky-700 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 rounded-xl transition-colors border border-sky-100 dark:border-sky-800"
            title={t.pickDate}
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden Native Date Input */}
        <input
          ref={dateInputRef}
          type="date"
          className="sr-only"
          onChange={handleDatePick}
        />
      </div>

      {/* Live Dropdown Suggestions */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[420px] overflow-y-auto animate-in fade-in-50 slide-in-from-top-1 duration-150 z-50">
          {/* Header Summary Strip */}
          <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 dark:text-slate-300 gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold">
                {t.searchResults} ({matchedPatientsWithReasons.length} {t.patientsCount})
              </span>
              {isDateSearch && (
                <span className="text-[11px] text-sky-700 bg-sky-100/70 dark:bg-sky-900/60 px-2 py-0.5 rounded-md font-mono">
                  {dateQuery} ({newExamsCount} كشف جديد · {followUpsCount} متابعة)
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">{t.chooseAction}</span>
          </div>

          {matchedPatientsWithReasons.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              <User className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.noPatientFound} "{query}"
              </p>
              <p className="text-xs text-slate-400 mt-1 mb-3">{t.canCreateNew}</p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNewPatient();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t.createNewNow}</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {matchedPatientsWithReasons.map(
                ({ patient, isNewExamOnDate, hasFollowUpOnDate, matchingFollowUps }) => (
                  <div
                    key={patient.id}
                    onClick={() => handleSelect(patient.id, 'view')}
                    className="p-3.5 hover:bg-sky-50/70 dark:hover:bg-slate-800/60 transition-colors flex flex-col gap-2.5 cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {patient.name}
                          </span>
                          {patient.age && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {patient.age}
                            </span>
                          )}

                          {/* Date Match Badges (New Exam on this date / Follow-up on this date) */}
                          {isNewExamOnDate && (
                            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              <span>{t.newExamOnDateBadge}</span>
                            </span>
                          )}

                          {hasFollowUpOnDate && (
                            <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <HeartPulse className="w-3 h-3 text-teal-600" />
                              <span>
                                {t.followUpOnDateBadge} ({matchingFollowUps.length})
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          {patient.address && <span>{patient.address}</span>}
                          {patient.address && <span>·</span>}
                          <span className="font-mono">
                            {t.examDatePrefix} {patient.examDate}
                          </span>
                          {patient.followUps && patient.followUps.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-sky-600 font-medium">
                                {patient.followUps.length} {t.followUpsCount}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Details of follow-up on that specific date if matched */}
                        {hasFollowUpOnDate && matchingFollowUps.length > 0 && (
                          <div className="mt-1.5 p-2 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50 rounded-xl text-xs text-teal-900 dark:text-teal-200">
                            <span className="font-semibold block text-[11px] text-teal-700 dark:text-teal-400">
                              متابعة مسجلة في هذا اليوم:
                            </span>
                            <p className="line-clamp-1 text-[11px] opacity-90 mt-0.5">
                              {stripHtmlToPlainText(
                                matchingFollowUps[0].symptoms ||
                                  matchingFollowUps[0].clinicalEvolution ||
                                  matchingFollowUps[0].newExam ||
                                  matchingFollowUps[0].treatment ||
                                  ''
                              ) || matchingFollowUps[0].date}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions for this specific patient */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-50 dark:border-slate-800/40">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(patient.id, 'add-followup');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-sky-600" />
                        <span>{t.addFollowUp}</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(patient.id, 'new-consultation');
                        }}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                        <span>{t.newConsultation}</span>
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
