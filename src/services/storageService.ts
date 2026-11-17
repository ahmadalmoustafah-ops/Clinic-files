import { PatientRecord, Appointment } from '../types';

const DB_NAME = 'DoctorClinicDB';
const DB_VERSION = 2;
const LEGACY_PATIENTS_STORE = 'patients';
const LEGACY_APPOINTMENTS_STORE = 'appointments';
const PATIENTS_STORE_V2 = 'patients_v2';
const APPOINTMENTS_STORE_V2 = 'appointments_v2';

interface ScopedRow<T> {
  storageKey: string;
  ownerId: string;
  data: T;
}

let activeUserId: string | null = null;

function requireUserId(): string | null {
  return activeUserId;
}

function scopedKey(userId: string, suffix: string): string {
  return `easy_clinic_u_${userId}_${suffix}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PATIENTS_STORE_V2)) {
        const pStore = db.createObjectStore(PATIENTS_STORE_V2, { keyPath: 'storageKey' });
        pStore.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(APPOINTMENTS_STORE_V2)) {
        const aStore = db.createObjectStore(APPOINTMENTS_STORE_V2, { keyPath: 'storageKey' });
        aStore.createIndex('ownerId', 'ownerId', { unique: false });
      }
      // Clear un-scoped legacy v1 stores on upgrade so data cannot leak across user accounts
      if (db.objectStoreNames.contains(LEGACY_PATIENTS_STORE)) {
        try {
          const tx = (event.target as IDBOpenDBRequest).transaction;
          tx?.objectStore(LEGACY_PATIENTS_STORE).clear();
        } catch {}
      }
      if (db.objectStoreNames.contains(LEGACY_APPOINTMENTS_STORE)) {
        try {
          const tx = (event.target as IDBOpenDBRequest).transaction;
          tx?.objectStore(LEGACY_APPOINTMENTS_STORE).clear();
        } catch {}
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveToLocalStoragePatients(userId: string, patients: PatientRecord[]): void {
  try {
    localStorage.setItem(scopedKey(userId, 'patients'), JSON.stringify(patients));
    localStorage.setItem(
      scopedKey(userId, 'db_status'),
      JSON.stringify({
        connected: true,
        ownerId: userId,
        type: 'Isolated Local Storage & IndexedDB',
        lastUpdated: new Date().toISOString(),
        patientsCount: patients.length,
      })
    );
  } catch (e) {
    console.warn('LocalStorage quota or save warning', e);
  }
}

function getFromLocalStoragePatients(userId: string): PatientRecord[] {
  try {
    const raw = localStorage.getItem(scopedKey(userId, 'patients'));
    return raw ? (JSON.parse(raw) as PatientRecord[]) : [];
  } catch {
    return [];
  }
}

function saveToLocalStorageAppointments(userId: string, appointments: Appointment[]): void {
  try {
    localStorage.setItem(scopedKey(userId, 'appointments'), JSON.stringify(appointments));
  } catch (e) {
    console.warn('LocalStorage appointments save warning', e);
  }
}

function getFromLocalStorageAppointments(userId: string): Appointment[] {
  try {
    const raw = localStorage.getItem(scopedKey(userId, 'appointments'));
    return raw ? (JSON.parse(raw) as Appointment[]) : [];
  } catch {
    return [];
  }
}

const LEGACY_SEED_IDS = new Set(['patient-101', 'patient-102', 'patient-103', 'patient-104']);

export const StorageService = {
  setActiveUser(userId: string | null): void {
    activeUserId = userId;
  },

  getActiveUser(): string | null {
    return activeUserId;
  },

  /**
   * One-time migration when upgrading an existing pre-account installation:
   * Only real user-created records (non-demo-seed) are transferred to the very first account,
   * and all legacy un-scoped keys are removed so no subsequent user can ever see them.
   */
  async migrateLegacyDataToFirstUser(userId: string): Promise<void> {
    try {
      const legacyPatientsRaw = localStorage.getItem('easy_clinic_patients');
      const legacyAppsRaw = localStorage.getItem('easy_clinic_appointments');

      if (legacyPatientsRaw) {
        const legacyPatients = JSON.parse(legacyPatientsRaw) as PatientRecord[];
        const hasRealPatients =
          Array.isArray(legacyPatients) &&
          legacyPatients.some((p) => !LEGACY_SEED_IDS.has(p.id));

        if (hasRealPatients) {
          this.setActiveUser(userId);
          for (const p of legacyPatients) {
            if (!LEGACY_SEED_IDS.has(p.id)) {
              await this.savePatient(p);
            }
          }
          if (legacyAppsRaw) {
            const legacyApps = JSON.parse(legacyAppsRaw) as Appointment[];
            if (Array.isArray(legacyApps)) {
              for (const a of legacyApps) {
                if (a.id !== 'app-201') {
                  await this.saveAppointment(a);
                }
              }
            }
          }
        }
      }

      // Preserve user's prior auto-backup preference for the first upgraded account
      const legacyAutoEnabled = localStorage.getItem('easy_clinic_auto_backup_enabled');
      if (legacyAutoEnabled !== null) {
        localStorage.setItem(scopedKey(userId, 'auto_backup_enabled'), legacyAutoEnabled);
      }
      const legacyFirstUsed = localStorage.getItem('easy_clinic_first_used_at');
      if (legacyFirstUsed) {
        localStorage.setItem(scopedKey(userId, 'first_used_at'), legacyFirstUsed);
      }

      // Wipe un-scoped legacy keys immediately
      const legacyKeysToRemove = [
        'easy_clinic_patients',
        'easy_clinic_appointments',
        'easy_clinic_db_status',
        'easy_clinic_last_backup_date',
        'easy_clinic_auto_backup_enabled',
        'easy_clinic_last_auto_backup_date',
        'easy_clinic_auto_backup_count',
        'easy_clinic_auto_backup_snapshot',
        'easy_clinic_first_used_at',
        'patients_fallback',
        'appointments_fallback',
      ];
      legacyKeysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Legacy migration cleanup notice:', e);
    }
  },

  async getAllPatients(): Promise<PatientRecord[]> {
    const userId = requireUserId();
    if (!userId) return [];

    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(PATIENTS_STORE_V2, 'readonly');
        const store = tx.objectStore(PATIENTS_STORE_V2);
        const index = store.index('ownerId');
        const req = index.getAll(userId);
        req.onsuccess = () => {
          const rows = (req.result as ScopedRow<PatientRecord>[]) || [];
          let list = rows.map((r) => r.data);
          if (list.length === 0) {
            const lsList = getFromLocalStoragePatients(userId);
            if (lsList.length > 0) {
              list = lsList;
              this.syncPatientsToIndexedDB(lsList, userId).catch(() => {});
            }
          } else {
            saveToLocalStoragePatients(userId, list);
          }
          list.sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt).getTime() -
              new Date(a.updatedAt || a.createdAt).getTime()
          );
          resolve(list);
        };
        req.onerror = () => {
          resolve(getFromLocalStoragePatients(userId));
        };
      });
    } catch {
      return getFromLocalStoragePatients(userId);
    }
  },

  async syncPatientsToIndexedDB(patients: PatientRecord[], targetUserId?: string): Promise<void> {
    const userId = targetUserId || requireUserId();
    if (!userId) return;

    try {
      const db = await openDatabase();
      const tx = db.transaction(PATIENTS_STORE_V2, 'readwrite');
      const store = tx.objectStore(PATIENTS_STORE_V2);
      for (const p of patients) {
        const row: ScopedRow<PatientRecord> = {
          storageKey: `${userId}::${p.id}`,
          ownerId: userId,
          data: p,
        };
        store.put(row);
      }
    } catch (e) {
      console.warn('IndexedDB sync error', e);
    }
  },

  async getPatientById(id: string): Promise<PatientRecord | null> {
    const userId = requireUserId();
    if (!userId) return null;

    const storageKey = `${userId}::${id}`;
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(PATIENTS_STORE_V2, 'readonly');
        const store = tx.objectStore(PATIENTS_STORE_V2);
        const req = store.get(storageKey);
        req.onsuccess = () => {
          const row = req.result as ScopedRow<PatientRecord> | undefined;
          if (row && row.ownerId === userId) {
            resolve(row.data);
          } else {
            const list = getFromLocalStoragePatients(userId);
            resolve(list.find((p) => p.id === id) || null);
          }
        };
        req.onerror = () => {
          const list = getFromLocalStoragePatients(userId);
          resolve(list.find((p) => p.id === id) || null);
        };
      });
    } catch {
      const list = getFromLocalStoragePatients(userId);
      return list.find((p) => p.id === id) || null;
    }
  },

  async savePatient(patient: PatientRecord): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;

    // 1. Persist strictly inside active user's LocalStorage namespace
    const currentList = getFromLocalStoragePatients(userId);
    const idx = currentList.findIndex((p) => p.id === patient.id);
    if (idx >= 0) {
      currentList[idx] = patient;
    } else {
      currentList.unshift(patient);
    }
    saveToLocalStoragePatients(userId, currentList);

    // 2. Persist strictly under composite userId::patientId in IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PATIENTS_STORE_V2, 'readwrite');
        const store = tx.objectStore(PATIENTS_STORE_V2);
        const row: ScopedRow<PatientRecord> = {
          storageKey: `${userId}::${patient.id}`,
          ownerId: userId,
          data: patient,
        };
        const req = store.put(row);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB write skipped, scoped LocalStorage saved successfully', e);
    }
  },

  async deletePatient(id: string): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;

    const filteredList = getFromLocalStoragePatients(userId).filter((p) => p.id !== id);
    saveToLocalStoragePatients(userId, filteredList);

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PATIENTS_STORE_V2, 'readwrite');
        const store = tx.objectStore(PATIENTS_STORE_V2);
        const req = store.delete(`${userId}::${id}`);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB delete skipped, scoped LocalStorage updated', e);
    }
  },

  async getAllAppointments(): Promise<Appointment[]> {
    const userId = requireUserId();
    if (!userId) return [];

    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(APPOINTMENTS_STORE_V2, 'readonly');
        const store = tx.objectStore(APPOINTMENTS_STORE_V2);
        const index = store.index('ownerId');
        const req = index.getAll(userId);
        req.onsuccess = () => {
          const rows = (req.result as ScopedRow<Appointment>[]) || [];
          let list = rows.map((r) => r.data);
          if (list.length === 0) {
            const lsList = getFromLocalStorageAppointments(userId);
            if (lsList.length > 0) {
              list = lsList;
              this.syncAppointmentsToIndexedDB(lsList, userId).catch(() => {});
            }
          } else {
            saveToLocalStorageAppointments(userId, list);
          }
          list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
          resolve(list);
        };
        req.onerror = () => {
          resolve(getFromLocalStorageAppointments(userId));
        };
      });
    } catch {
      return getFromLocalStorageAppointments(userId);
    }
  },

  async syncAppointmentsToIndexedDB(appointments: Appointment[], targetUserId?: string): Promise<void> {
    const userId = targetUserId || requireUserId();
    if (!userId) return;

    try {
      const db = await openDatabase();
      const tx = db.transaction(APPOINTMENTS_STORE_V2, 'readwrite');
      const store = tx.objectStore(APPOINTMENTS_STORE_V2);
      for (const a of appointments) {
        const row: ScopedRow<Appointment> = {
          storageKey: `${userId}::${a.id}`,
          ownerId: userId,
          data: a,
        };
        store.put(row);
      }
    } catch (e) {
      console.warn('IndexedDB appointments sync error', e);
    }
  },

  async saveAppointment(appointment: Appointment): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;

    const currentList = getFromLocalStorageAppointments(userId);
    const idx = currentList.findIndex((a) => a.id === appointment.id);
    if (idx >= 0) {
      currentList[idx] = appointment;
    } else {
      currentList.push(appointment);
    }
    saveToLocalStorageAppointments(userId, currentList);

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(APPOINTMENTS_STORE_V2, 'readwrite');
        const store = tx.objectStore(APPOINTMENTS_STORE_V2);
        const row: ScopedRow<Appointment> = {
          storageKey: `${userId}::${appointment.id}`,
          ownerId: userId,
          data: appointment,
        };
        const req = store.put(row);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB appointment write skipped, scoped LocalStorage updated', e);
    }
  },

  async deleteAppointment(id: string): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;

    const filteredList = getFromLocalStorageAppointments(userId).filter((a) => a.id !== id);
    saveToLocalStorageAppointments(userId, filteredList);

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(APPOINTMENTS_STORE_V2, 'readwrite');
        const store = tx.objectStore(APPOINTMENTS_STORE_V2);
        const req = store.delete(`${userId}::${id}`);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB appointment delete skipped, scoped LocalStorage updated', e);
    }
  },

  async syncCurrentUserStorage(): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;
    const patients = await this.getAllPatients();
    const appointments = await this.getAllAppointments();
    saveToLocalStoragePatients(userId, patients);
    saveToLocalStorageAppointments(userId, appointments);
    await this.syncPatientsToIndexedDB(patients, userId);
    await this.syncAppointmentsToIndexedDB(appointments, userId);
  },

  async clearAllData(): Promise<void> {
    const userId = requireUserId();
    if (!userId) return;

    // 1. Wipe ONLY the active user's LocalStorage keys
    localStorage.removeItem(scopedKey(userId, 'patients'));
    localStorage.removeItem(scopedKey(userId, 'appointments'));
    localStorage.removeItem(scopedKey(userId, 'db_status'));

    // 2. Wipe ONLY the active user's rows in IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([PATIENTS_STORE_V2, APPOINTMENTS_STORE_V2], 'readwrite');

        const clearStoreForOwner = (storeName: string) => {
          const store = tx.objectStore(storeName);
          const index = store.index('ownerId');
          const req = index.openCursor(userId);
          req.onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        };

        clearStoreForOwner(PATIENTS_STORE_V2);
        clearStoreForOwner(APPOINTMENTS_STORE_V2);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IndexedDB scoped clear error', e);
    }
  },

  getLocalDatabaseInfo(): {
    connected: boolean;
    driver: string;
    patientsCount: number;
    appointmentsCount: number;
    sizeFormatted: string;
    storagePath: string;
    lastUpdated: string;
  } {
    const userId = requireUserId();
    const rawPatients = userId ? localStorage.getItem(scopedKey(userId, 'patients')) || '' : '';
    const rawAppointments = userId ? localStorage.getItem(scopedKey(userId, 'appointments')) || '' : '';
    const totalBytes = new Blob([rawPatients, rawAppointments]).size;
    const sizeFormatted =
      totalBytes > 1024 * 1024
        ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(totalBytes / 1024).toFixed(1)} KB`;

    const statusRaw = userId ? localStorage.getItem(scopedKey(userId, 'db_status')) : null;
    let lastUpdated = new Date().toLocaleTimeString();
    if (statusRaw) {
      try {
        const s = JSON.parse(statusRaw);
        if (s.lastUpdated) {
          lastUpdated = new Date(s.lastUpdated).toLocaleTimeString();
        }
      } catch {}
    }

    return {
      connected: Boolean(userId),
      driver: 'Isolated Local Storage & IndexedDB',
      patientsCount: userId ? getFromLocalStoragePatients(userId).length : 0,
      appointmentsCount: userId ? getFromLocalStorageAppointments(userId).length : 0,
      sizeFormatted,
      storagePath: 'ذاكرة التخزين المحلية المعزولة للحساب (Private Account Storage)',
      lastUpdated,
    };
  },

  async getBackupStats(): Promise<{
    patientCount: number;
    followUpCount: number;
    imageCount: number;
    appointmentCount: number;
    lastBackupDate: string | null;
  }> {
    const userId = requireUserId();
    if (!userId) {
      return {
        patientCount: 0,
        followUpCount: 0,
        imageCount: 0,
        appointmentCount: 0,
        lastBackupDate: null,
      };
    }

    const patients = await this.getAllPatients();
    const appointments = await this.getAllAppointments();

    let followUpCount = 0;
    let imageCount = 0;

    patients.forEach((p) => {
      followUpCount += p.followUps?.length || 0;
      imageCount += p.images?.length || 0;
      p.followUps?.forEach((fu) => {
        imageCount += fu.images?.length || 0;
      });
    });

    const lastBackupDate = localStorage.getItem(scopedKey(userId, 'last_backup_date'));

    return {
      patientCount: patients.length,
      followUpCount,
      imageCount,
      appointmentCount: appointments.length,
      lastBackupDate,
    };
  },

  async exportBackup(): Promise<string> {
    const userId = requireUserId();
    const patients = await this.getAllPatients();
    const appointments = await this.getAllAppointments();
    const nowIso = new Date().toISOString();

    const backupData = {
      app: 'Easy clinic',
      version: '1.3',
      accountId: userId,
      exportDate: nowIso,
      totalPatients: patients.length,
      totalAppointments: appointments.length,
      patients,
      appointments,
    };

    if (userId) {
      localStorage.setItem(scopedKey(userId, 'last_backup_date'), nowIso);
    }

    return JSON.stringify(backupData, null, 2);
  },

  getAppFirstUsedDate(): string {
    const userId = requireUserId();
    if (!userId) return new Date().toISOString();
    const key = scopedKey(userId, 'first_used_at');
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(key, nowIso);
    } catch {}
    return nowIso;
  },

  isAutoBackupEnabled(): boolean {
    const userId = requireUserId();
    if (!userId) return false;
    return localStorage.getItem(scopedKey(userId, 'auto_backup_enabled')) === 'true';
  },

  setAutoBackupEnabled(enabled: boolean): void {
    const userId = requireUserId();
    if (!userId) return;
    try {
      localStorage.setItem(scopedKey(userId, 'auto_backup_enabled'), enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Could not persist auto-backup setting', e);
    }
  },

  getAutoBackupInfo(): {
    enabled: boolean;
    lastAutoBackupDate: string | null;
    count: number;
    hasSnapshot: boolean;
  } {
    const userId = requireUserId();
    if (!userId) {
      return { enabled: false, lastAutoBackupDate: null, count: 0, hasSnapshot: false };
    }
    const enabled = this.isAutoBackupEnabled();
    const lastAutoBackupDate = localStorage.getItem(scopedKey(userId, 'last_auto_backup_date'));
    const countRaw = parseInt(localStorage.getItem(scopedKey(userId, 'auto_backup_count')) || '0', 10);
    const hasSnapshot = Boolean(localStorage.getItem(scopedKey(userId, 'auto_backup_snapshot')));
    return {
      enabled,
      lastAutoBackupDate,
      count: isNaN(countRaw) ? 0 : countRaw,
      hasSnapshot,
    };
  },

  getLastAutoBackupSnapshot(): string | null {
    const userId = requireUserId();
    if (!userId) return null;
    try {
      return localStorage.getItem(scopedKey(userId, 'auto_backup_snapshot'));
    } catch {
      return null;
    }
  },

  getLocalDayKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  hasAutoBackupRunToday(): boolean {
    const userId = requireUserId();
    if (!userId) return false;
    const lastDay = localStorage.getItem(scopedKey(userId, 'last_auto_backup_day'));
    return lastDay === this.getLocalDayKey();
  },

  isDaily4PmAutoBackupDue(now: Date = new Date()): boolean {
    const userId = requireUserId();
    if (!userId || !this.isAutoBackupEnabled()) return false;
    // Trigger once per day at or after 16:00 (4:00 PM)
    if (now.getHours() < 16) return false;
    return !this.hasAutoBackupRunToday();
  },

  getMsUntilNext4Pm(now: Date = new Date()): number {
    const target = new Date(now);
    target.setHours(16, 0, 0, 0);
    if (now.getTime() >= target.getTime()) {
      // Already past 4:00 PM today; next scheduled check is tomorrow 4:00 PM
      target.setDate(target.getDate() + 1);
    }
    return Math.max(1000, target.getTime() - now.getTime());
  },

  async performAutoBackup(): Promise<{
    json: string;
    fileName: string;
    timestamp: string;
  }> {
    const userId = requireUserId();
    const json = await this.exportBackup();
    const now = new Date();
    const timestamp = now.toISOString();
    const dateStr = this.getLocalDayKey(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `Easy_clinic_auto_backup_${dateStr}_${timeStr}.json`;

    if (userId) {
      try {
        localStorage.setItem(scopedKey(userId, 'last_auto_backup_date'), timestamp);
        localStorage.setItem(scopedKey(userId, 'last_auto_backup_day'), dateStr);
        const prevCount = parseInt(localStorage.getItem(scopedKey(userId, 'auto_backup_count')) || '0', 10) || 0;
        localStorage.setItem(scopedKey(userId, 'auto_backup_count'), String(prevCount + 1));
        try {
          localStorage.setItem(scopedKey(userId, 'auto_backup_snapshot'), json);
        } catch (quotaErr) {
          console.warn('Auto-backup snapshot exceeded localStorage quota, continuing with download', quotaErr);
        }
      } catch (e) {
        console.warn('Could not update auto-backup metadata', e);
      }
    }

    return { json, fileName, timestamp };
  },

  async importBackup(jsonString: string, mode: 'merge' | 'replace' = 'merge'): Promise<{
    success: boolean;
    importedPatients: number;
    importedAppointments: number;
    message?: string;
  }> {
    const userId = requireUserId();
    if (!userId) {
      return {
        success: false,
        importedPatients: 0,
        importedAppointments: 0,
        message: 'يرجى تسجيل الدخول أولاً لاسترجاع النسخة الاحتياطية.',
      };
    }

    try {
      const data = JSON.parse(jsonString);
      if (!data.patients || !Array.isArray(data.patients)) {
        return {
          success: false,
          importedPatients: 0,
          importedAppointments: 0,
          message: 'الملف لا يحتوي على بيانات مرضى صحيحة لتطبيق Easy clinic.',
        };
      }

      if (mode === 'replace') {
        await this.clearAllData();
      }

      for (const p of data.patients) {
        await this.savePatient(p);
      }

      let appCount = 0;
      if (data.appointments && Array.isArray(data.appointments)) {
        for (const a of data.appointments) {
          await this.saveAppointment(a);
          appCount++;
        }
      }

      return {
        success: true,
        importedPatients: data.patients.length,
        importedAppointments: appCount,
      };
    } catch (e: any) {
      console.error('Import failed', e);
      return {
        success: false,
        importedPatients: 0,
        importedAppointments: 0,
        message: e.message || 'حدث خطأ في قراءة ملف النسخة الاحتياطية.',
      };
    }
  },
};
