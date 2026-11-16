import { PatientRecord } from '../types';
import { StorageService } from '../services/storageService';

function toLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseLocalDateString(dateStr?: string): Date | null {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD strictly in local time to avoid UTC day shift
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : toLocalMidnight(fallback);
}

export function getPatientEffectiveDate(p: PatientRecord): Date {
  return (
    parseLocalDateString(p.examDate) ||
    parseLocalDateString(p.createdAt) ||
    toLocalMidnight(new Date())
  );
}

const SEED_IDS = new Set(['patient-101', 'patient-102', 'patient-103', 'patient-104']);

export function getActualAppUsageStart(patients: PatientRecord[]): Date {
  const firstUsedIso = StorageService.getAppFirstUsedDate();
  let start = parseLocalDateString(firstUsedIso) || toLocalMidnight(new Date());

  // Consider real (non-seed) patient dates in case user restored an older backup
  for (const p of patients) {
    if (SEED_IDS.has(p.id)) continue;
    const pDate = getPatientEffectiveDate(p);
    if (pDate.getTime() < start.getTime()) {
      start = pDate;
    }
  }

  return start;
}

export function getActualUsageDays(startDate: Date): number {
  const today = toLocalMidnight(new Date());
  const start = toLocalMidnight(startDate);
  const diffMs = today.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

export function formatUsageDuration(days: number, t: any, language: 'ar' | 'en'): string {
  if (days <= 1) {
    return t.daySingle;
  }
  if (days < 30) {
    if (language === 'ar') {
      const unit = days <= 10 ? t.daysUnit : t.daysUnitMany;
      return `${days} ${unit}`;
    }
    return `${days} ${t.daysUnit}`;
  }

  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const monthLabel = months === 1 ? t.monthSingle : `${months} ${months <= 10 || language === 'en' ? t.monthsUnit : t.monthSingle}`;

  if (remDays === 0) {
    return months === 1 ? (language === 'ar' ? 'شهر واحد' : '1 Month') : monthLabel;
  }

  const daysText =
    remDays === 1
      ? t.daySingle
      : language === 'ar'
      ? `${remDays} ${remDays <= 10 ? t.daysUnit : t.daysUnitMany}`
      : `${remDays} ${t.daysUnit}`;

  const baseMonthText = months === 1 ? (language === 'ar' ? 'شهر واحد' : '1 Month') : monthLabel;
  return `${baseMonthText} ${t.andConnector} ${daysText}`;
}

export function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
