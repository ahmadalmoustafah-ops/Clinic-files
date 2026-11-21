import { StorageService } from './storageService';

export type DemographicsSubKey =
  | 'age'
  | 'examDate'
  | 'address'
  | 'pregnancyOrLactation'
  | 'phone';

export type MainAccordionKey = 'history' | 'clinical' | 'diagnosis';

export type SubAccordionKey =
  | 'habits'
  | 'medicalHistory'
  | 'surgicalHistory'
  | 'drugHistory'
  | 'allergyHistory'
  | 'familyHistory'
  | 'symptoms'
  | 'clinicalExam'
  | 'echo'
  | 'labs'
  | 'otherInvestigations'
  | 'differentialDiagnosis'
  | 'waiting'
  | 'treatment';

export type AppFontSize = 'small' | 'medium' | 'large' | 'xlarge';

export const APP_FONT_SIZE_PX: Record<AppFontSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
  xlarge: 20,
};

const DEVICE_FONT_SIZE_KEY = 'easy_clinic_app_font_size_v1';

export type FollowUpSubKey =
  | 'clinicalEvolution'
  | 'newExam'
  | 'labs'
  | 'investigations'
  | 'differentialDiagnosis'
  | 'waiting'
  | 'treatment';

export interface ClinicalFieldSettings {
  fontSize: AppFontSize;
  showHomeReminder: boolean;
  demographics: Record<DemographicsSubKey, boolean>;
  main: Record<MainAccordionKey, boolean>;
  sub: Record<SubAccordionKey, boolean>;
  followUpSub: Record<FollowUpSubKey, boolean>;
}

export const MAIN_SUB_GROUPS: Record<MainAccordionKey, SubAccordionKey[]> = {
  history: [
    'habits',
    'medicalHistory',
    'surgicalHistory',
    'drugHistory',
    'allergyHistory',
    'familyHistory',
  ],
  clinical: [
    'symptoms',
    'clinicalExam',
    'echo',
    'labs',
    'otherInvestigations',
  ],
  diagnosis: [
    'differentialDiagnosis',
    'waiting',
    'treatment',
  ],
};

function readDeviceFontSize(): AppFontSize {
  try {
    const val = localStorage.getItem(DEVICE_FONT_SIZE_KEY);
    if (val === 'small' || val === 'medium' || val === 'large' || val === 'xlarge') {
      return val;
    }
  } catch {}
  return 'medium';
}

export const DEFAULT_FIELD_SETTINGS: ClinicalFieldSettings = {
  fontSize: 'medium',
  showHomeReminder: true,
  demographics: {
    age: true,
    examDate: true,
    address: true,
    pregnancyOrLactation: true,
    phone: true,
  },
  main: {
    history: true,
    clinical: true,
    diagnosis: true,
  },
  sub: {
    habits: true,
    medicalHistory: true,
    surgicalHistory: true,
    drugHistory: true,
    allergyHistory: true,
    familyHistory: true,
    symptoms: true,
    clinicalExam: true,
    echo: true,
    labs: true,
    otherInvestigations: true,
    differentialDiagnosis: true,
    waiting: true,
    treatment: true,
  },
  followUpSub: {
    clinicalEvolution: true,
    newExam: true,
    labs: true,
    investigations: true,
    differentialDiagnosis: true,
    waiting: true,
    treatment: true,
  },
};

export const FIELD_SETTINGS_EVENT = 'easy-clinic-field-settings-changed';

function cloneDefaults(): ClinicalFieldSettings {
  return {
    fontSize: readDeviceFontSize(),
    showHomeReminder: true,
    demographics: { ...DEFAULT_FIELD_SETTINGS.demographics },
    main: { ...DEFAULT_FIELD_SETTINGS.main },
    sub: { ...DEFAULT_FIELD_SETTINGS.sub },
    followUpSub: { ...DEFAULT_FIELD_SETTINGS.followUpSub },
  };
}

function getStorageKey(userId?: string | null): string | null {
  const uid = userId ?? StorageService.getActiveUser();
  if (!uid) return null;
  return `easy_clinic_u_${uid}_field_settings_v1`;
}

function isValidFontSize(val: unknown): val is AppFontSize {
  return val === 'small' || val === 'medium' || val === 'large' || val === 'xlarge';
}

function normalizeSettings(raw: Partial<ClinicalFieldSettings> | null | undefined): ClinicalFieldSettings {
  const base = cloneDefaults();
  if (!raw || typeof raw !== 'object') return base;

  if (isValidFontSize(raw.fontSize)) {
    base.fontSize = raw.fontSize;
  }

  if (typeof raw.showHomeReminder === 'boolean') {
    base.showHomeReminder = raw.showHomeReminder;
  }

  if (raw.demographics && typeof raw.demographics === 'object') {
    (Object.keys(base.demographics) as DemographicsSubKey[]).forEach((k) => {
      if (typeof raw.demographics?.[k] === 'boolean') {
        base.demographics[k] = raw.demographics[k] as boolean;
      }
    });
  }

  if (raw.main && typeof raw.main === 'object') {
    (Object.keys(base.main) as MainAccordionKey[]).forEach((k) => {
      if (typeof raw.main?.[k] === 'boolean') {
        base.main[k] = raw.main[k] as boolean;
      }
    });
  }

  if (raw.sub && typeof raw.sub === 'object') {
    (Object.keys(base.sub) as SubAccordionKey[]).forEach((k) => {
      if (typeof raw.sub?.[k] === 'boolean') {
        base.sub[k] = raw.sub[k] as boolean;
      }
    });
  }

  if (raw.followUpSub && typeof raw.followUpSub === 'object') {
    (Object.keys(base.followUpSub) as FollowUpSubKey[]).forEach((k) => {
      if (typeof raw.followUpSub?.[k] === 'boolean') {
        base.followUpSub[k] = raw.followUpSub[k] as boolean;
      }
    });
  }

  return base;
}

export const FieldSettingsService = {
  applyAppFontSize(size: AppFontSize): void {
    const px = APP_FONT_SIZE_PX[size] || APP_FONT_SIZE_PX.medium;
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${px}px`;
    }
    try {
      localStorage.setItem(DEVICE_FONT_SIZE_KEY, size);
    } catch {}
  },

  getSettings(userId?: string | null): ClinicalFieldSettings {
    const key = getStorageKey(userId);
    if (!key) return cloneDefaults();
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return cloneDefaults();
      const parsed = JSON.parse(raw) as Partial<ClinicalFieldSettings>;
      return normalizeSettings(parsed);
    } catch {
      return cloneDefaults();
    }
  },

  saveSettings(settings: ClinicalFieldSettings, userId?: string | null): ClinicalFieldSettings {
    const normalized = normalizeSettings(settings);
    this.applyAppFontSize(normalized.fontSize);
    const key = getStorageKey(userId);
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(FIELD_SETTINGS_EVENT, { detail: normalized }));
      } catch (e) {
        console.warn('Failed to save clinical field settings:', e);
      }
    }
    return normalized;
  },

  resetSettings(userId?: string | null): ClinicalFieldSettings {
    return this.saveSettings(
      {
        fontSize: 'medium',
        showHomeReminder: true,
        demographics: { ...DEFAULT_FIELD_SETTINGS.demographics },
        main: { ...DEFAULT_FIELD_SETTINGS.main },
        sub: { ...DEFAULT_FIELD_SETTINGS.sub },
        followUpSub: { ...DEFAULT_FIELD_SETTINGS.followUpSub },
      },
      userId
    );
  },
};
