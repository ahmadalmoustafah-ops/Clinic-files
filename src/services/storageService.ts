import { PatientRecord, Appointment } from '../types';

const DB_NAME = 'DoctorClinicDB';
const DB_VERSION = 1;
const PATIENTS_STORE = 'patients';
const APPOINTMENTS_STORE = 'appointments';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PATIENTS_STORE)) {
        db.createObjectStore(PATIENTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(APPOINTMENTS_STORE)) {
        db.createObjectStore(APPOINTMENTS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const LOCAL_STORAGE_PATIENTS_KEY = 'easy_clinic_patients';
const LOCAL_STORAGE_APPOINTMENTS_KEY = 'easy_clinic_appointments';
const LOCAL_STORAGE_STATUS_KEY = 'easy_clinic_db_status';
const AUTO_BACKUP_ENABLED_KEY = 'easy_clinic_auto_backup_enabled';
const LAST_AUTO_BACKUP_DATE_KEY = 'easy_clinic_last_auto_backup_date';
const AUTO_BACKUP_COUNT_KEY = 'easy_clinic_auto_backup_count';
const AUTO_BACKUP_SNAPSHOT_KEY = 'easy_clinic_auto_backup_snapshot';
const FIRST_USED_AT_KEY = 'easy_clinic_first_used_at';

function saveToLocalStoragePatients(patients: PatientRecord[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PATIENTS_KEY, JSON.stringify(patients));
    localStorage.setItem(
      LOCAL_STORAGE_STATUS_KEY,
      JSON.stringify({
        connected: true,
        type: 'Local Storage & IndexedDB',
        lastUpdated: new Date().toISOString(),
        patientsCount: patients.length,
      })
    );
  } catch (e) {
    console.warn('LocalStorage quota or save warning', e);
  }
}

function getFromLocalStoragePatients(): PatientRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PATIENTS_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem('patients_fallback');
    return legacy ? JSON.parse(legacy) : [];
  } catch {
    return [];
  }
}

function saveToLocalStorageAppointments(appointments: Appointment[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_APPOINTMENTS_KEY, JSON.stringify(appointments));
  } catch (e) {
    console.warn('LocalStorage appointments save warning', e);
  }
}

function getFromLocalStorageAppointments(): Appointment[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_APPOINTMENTS_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem('appointments_fallback');
    return legacy ? JSON.parse(legacy) : [];
  } catch {
    return [];
  }
}

export const StorageService = {
  async getAllPatients(): Promise<PatientRecord[]> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(PATIENTS_STORE, 'readonly');
        const store = tx.objectStore(PATIENTS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          let list = (req.result as PatientRecord[]) || [];
          if (list.length === 0) {
            // Check if LocalStorage has data to populate
            const lsList = getFromLocalStoragePatients();
            if (lsList.length > 0) {
              list = lsList;
              // Sync back to IndexedDB asynchronously
              this.syncPatientsToIndexedDB(lsList).catch(() => {});
            }
          } else {
            // Mirror to Local Storage to ensure local persistence
            saveToLocalStoragePatients(list);
          }
          list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
          resolve(list);
        };
        req.onerror = () => {
          resolve(getFromLocalStoragePatients());
        };
      });
    } catch {
      return getFromLocalStoragePatients();
    }
  },

  async syncPatientsToIndexedDB(patients: PatientRecord[]): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(PATIENTS_STORE, 'readwrite');
      const store = tx.objectStore(PATIENTS_STORE);
      for (const p of patients) {
        store.put(p);
      }
    } catch (e) {
      console.warn('IndexedDB sync error', e);
    }
  },

  async getPatientById(id: string): Promise<PatientRecord | null> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(PATIENTS_STORE, 'readonly');
        const store = tx.objectStore(PATIENTS_STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result as PatientRecord);
          } else {
            const list = getFromLocalStoragePatients();
            resolve(list.find((p) => p.id === id) || null);
          }
        };
        req.onerror = () => {
          const list = getFromLocalStoragePatients();
          resolve(list.find((p) => p.id === id) || null);
        };
      });
    } catch {
      const list = getFromLocalStoragePatients();
      return list.find((p) => p.id === id) || null;
    }
  },

  async savePatient(patient: PatientRecord): Promise<void> {
    // 1. Immediately persist to LocalStorage
    const currentList = getFromLocalStoragePatients();
    const idx = currentList.findIndex((p) => p.id === patient.id);
    if (idx >= 0) {
      currentList[idx] = patient;
    } else {
      currentList.unshift(patient);
    }
    saveToLocalStoragePatients(currentList);

    // 2. Persist to IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PATIENTS_STORE, 'readwrite');
        const store = tx.objectStore(PATIENTS_STORE);
        const req = store.put(patient);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB write skipped, LocalStorage saved successfully', e);
    }
  },

  async deletePatient(id: string): Promise<void> {
    // 1. Immediately delete from LocalStorage
    const filteredList = getFromLocalStoragePatients().filter((p) => p.id !== id);
    saveToLocalStoragePatients(filteredList);

    // 2. Delete from IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PATIENTS_STORE, 'readwrite');
        const store = tx.objectStore(PATIENTS_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB delete skipped, LocalStorage updated', e);
    }
  },

  async getAllAppointments(): Promise<Appointment[]> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(APPOINTMENTS_STORE, 'readonly');
        const store = tx.objectStore(APPOINTMENTS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          let list = (req.result as Appointment[]) || [];
          if (list.length === 0) {
            const lsList = getFromLocalStorageAppointments();
            if (lsList.length > 0) {
              list = lsList;
              this.syncAppointmentsToIndexedDB(lsList).catch(() => {});
            }
          } else {
            saveToLocalStorageAppointments(list);
          }
          list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
          resolve(list);
        };
        req.onerror = () => {
          resolve(getFromLocalStorageAppointments());
        };
      });
    } catch {
      return getFromLocalStorageAppointments();
    }
  },

  async syncAppointmentsToIndexedDB(appointments: Appointment[]): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(APPOINTMENTS_STORE, 'readwrite');
      const store = tx.objectStore(APPOINTMENTS_STORE);
      for (const a of appointments) {
        store.put(a);
      }
    } catch (e) {
      console.warn('IndexedDB appointments sync error', e);
    }
  },

  async saveAppointment(appointment: Appointment): Promise<void> {
    // 1. Save to LocalStorage immediately
    const currentList = getFromLocalStorageAppointments();
    const idx = currentList.findIndex((a) => a.id === appointment.id);
    if (idx >= 0) {
      currentList[idx] = appointment;
    } else {
      currentList.push(appointment);
    }
    saveToLocalStorageAppointments(currentList);

    // 2. Save to IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(APPOINTMENTS_STORE, 'readwrite');
        const store = tx.objectStore(APPOINTMENTS_STORE);
        const req = store.put(appointment);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB appointment write skipped, LocalStorage updated', e);
    }
  },

  async deleteAppointment(id: string): Promise<void> {
    // 1. Delete from LocalStorage immediately
    const filteredList = getFromLocalStorageAppointments().filter((a) => a.id !== id);
    saveToLocalStorageAppointments(filteredList);

    // 2. Delete from IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(APPOINTMENTS_STORE, 'readwrite');
        const store = tx.objectStore(APPOINTMENTS_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB appointment delete skipped, LocalStorage updated', e);
    }
  },

  async clearAllData(): Promise<void> {
    // 1. Wipe LocalStorage keys
    localStorage.removeItem(LOCAL_STORAGE_PATIENTS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_APPOINTMENTS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_STATUS_KEY);
    localStorage.removeItem('patients_fallback');
    localStorage.removeItem('appointments_fallback');

    // 2. Wipe IndexedDB
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([PATIENTS_STORE, APPOINTMENTS_STORE], 'readwrite');
        tx.objectStore(PATIENTS_STORE).clear();
        tx.objectStore(APPOINTMENTS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IndexedDB clear error', e);
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
    const rawPatients = localStorage.getItem(LOCAL_STORAGE_PATIENTS_KEY) || '';
    const rawAppointments = localStorage.getItem(LOCAL_STORAGE_APPOINTMENTS_KEY) || '';
    const totalBytes = new Blob([rawPatients, rawAppointments]).size;
    const sizeFormatted =
      totalBytes > 1024 * 1024
        ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(totalBytes / 1024).toFixed(1)} KB`;

    const statusRaw = localStorage.getItem(LOCAL_STORAGE_STATUS_KEY);
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
      connected: true,
      driver: 'Local Storage & IndexedDB',
      patientsCount: getFromLocalStoragePatients().length,
      appointmentsCount: getFromLocalStorageAppointments().length,
      sizeFormatted,
      storagePath: 'ذاكرة التخزين المحلية للجهاز (Device Local Storage)',
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

    const lastBackupDate = localStorage.getItem('easy_clinic_last_backup_date');

    return {
      patientCount: patients.length,
      followUpCount,
      imageCount,
      appointmentCount: appointments.length,
      lastBackupDate,
    };
  },

  async exportBackup(): Promise<string> {
    const patients = await this.getAllPatients();
    const appointments = await this.getAllAppointments();
    const nowIso = new Date().toISOString();

    const backupData = {
      app: 'Easy clinic',
      version: '1.2',
      exportDate: nowIso,
      totalPatients: patients.length,
      totalAppointments: appointments.length,
      patients,
      appointments,
    };

    // Store last backup export date
    localStorage.setItem('easy_clinic_last_backup_date', nowIso);

    return JSON.stringify(backupData, null, 2);
  },

  getAppFirstUsedDate(): string {
    const existing = localStorage.getItem(FIRST_USED_AT_KEY);
    if (existing) return existing;
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(FIRST_USED_AT_KEY, nowIso);
    } catch {}
    return nowIso;
  },

  isAutoBackupEnabled(): boolean {
    return localStorage.getItem(AUTO_BACKUP_ENABLED_KEY) === 'true';
  },

  setAutoBackupEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
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
    const enabled = this.isAutoBackupEnabled();
    const lastAutoBackupDate = localStorage.getItem(LAST_AUTO_BACKUP_DATE_KEY);
    const countRaw = parseInt(localStorage.getItem(AUTO_BACKUP_COUNT_KEY) || '0', 10);
    const hasSnapshot = Boolean(localStorage.getItem(AUTO_BACKUP_SNAPSHOT_KEY));
    return {
      enabled,
      lastAutoBackupDate,
      count: isNaN(countRaw) ? 0 : countRaw,
      hasSnapshot,
    };
  },

  getLastAutoBackupSnapshot(): string | null {
    try {
      return localStorage.getItem(AUTO_BACKUP_SNAPSHOT_KEY);
    } catch {
      return null;
    }
  },

  async performAutoBackup(): Promise<{
    json: string;
    fileName: string;
    timestamp: string;
  }> {
    const json = await this.exportBackup();
    const now = new Date();
    const timestamp = now.toISOString();
    const dateStr = timestamp.split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `Easy_clinic_auto_backup_${dateStr}_${timeStr}.json`;

    try {
      localStorage.setItem(LAST_AUTO_BACKUP_DATE_KEY, timestamp);
      const prevCount = parseInt(localStorage.getItem(AUTO_BACKUP_COUNT_KEY) || '0', 10) || 0;
      localStorage.setItem(AUTO_BACKUP_COUNT_KEY, String(prevCount + 1));
      try {
        localStorage.setItem(AUTO_BACKUP_SNAPSHOT_KEY, json);
      } catch (quotaErr) {
        console.warn('Auto-backup snapshot exceeded localStorage quota, continuing with download', quotaErr);
      }
    } catch (e) {
      console.warn('Could not update auto-backup metadata', e);
    }

    return { json, fileName, timestamp };
  },

  async importBackup(jsonString: string, mode: 'merge' | 'replace' = 'merge'): Promise<{
    success: boolean;
    importedPatients: number;
    importedAppointments: number;
    message?: string;
  }> {
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

  async initSeedDataIfEmpty(): Promise<void> {
    const existing = await this.getAllPatients();
    if (existing.length > 0) return;

    // Helper for today / tomorrow
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const samplePatients: PatientRecord[] = [
      {
        id: 'patient-101',
        name: 'محمد عبدالله العمراني',
        age: '48 سنة',
        address: 'حي الزهور، شارع السلام، مبنى 14',
        phone: '0501234567',
        examDate: formatDate(today),
        habits: 'مدخن (علبة يومياً منذ 15 سنة)، يتناول القهوة بكثرة، نشاط بدني خفيف.',
        medicalHistory: 'ارتفاع ضغط الدم الشرياني خفيف مشخّص منذ سنتين، لا توجد أمراض قلبية سابقة.',
        surgicalHistory: 'استئصال الزائدة الدودية عام 2012، دون اختلاطات جراحية.',
        drugHistory: 'أملوديبين 5 ملغ حبة صباحاً، أسبرين أطفال 81 ملغ يومياً بعد الغداء.',
        allergyHistory: 'تحسس مثبت من مركبات البنسلين ومشتقاته (طفح جلدي وحكة شديدة).',
        familyHistory: 'الوالد مصاب بداء السكري النمط الثاني، الوالدة سليمة، أخ يعاني من ارتفاع كوليسترول الدم.',
        symptoms: 'ألم ضاغط متقطع في المنطقة الشرسوفية يمتد إلى الصدر، يزداد مع الجهد النفسي والوجبات الدسمة، مترافق مع شعور بالحموضة.',
        clinicalExam: 'العلامات الحيوية: الضغط 135/85 mmHg، النبض 76 ن/د منتظم، أصوات القلب واضحة دون نفخات، البطن لين غير مؤلم بالجس العميق.',
        echo: 'إيكو بطن كامل: الكبد سليم الحجم مع تشحم خفيف، المرارة رقيقة الجدار دون حصيات، الكليتان طبيعيتان، الأبهر البطني طبيعي القطر.',
        labs: 'سكر الصيام: 104 mg/dL، وظائف الكلى: Creatinine 0.9 mg/dL، الكوليسترول الكلي: 220 mg/dL، الدهون الثلاثية: 185 mg/dL.',
        otherInvestigations: 'تخطيط قلب كهربائي (ECG): نظم جيبي سريعي معتدل، لا علامات لنقص التروية الحاد. قياس إنزيمات القلب طبيعية.',
        differentialDiagnosis: '1. قلس معدي مريئي (GERD) مع التهاب معدة خفيف\n2. خناق صدر جهدي مستقر (يحتاج متابعة وتخطيط جهد)\n3. ألم جدار الصدر العضلي',
        waiting: 'المراقبة لمدة ساعتين في العيادة بعد إعطاء مضاد حموضة، تراجع الألم تماماً، متابعة قياس الضغط بعد 48 ساعة.',
        treatment: '1. إيسوميبرازول (Esomeprazole) 40 ملغ حبة قبل الإفطار بنصف ساعة لمدة 4 أسابيع.\n2. شراب مضاد للحموضة عند اللزوم.\n3. إيقاف التدخين التدريجي وتجنب الاستلقاء بعد الأكل مباشرة.\n4. استمرار دواء الضغط اليومي ومراجعة بعد أسبوعين.',
        images: [],
        followUps: [
          {
            id: 'follow-101-1',
            date: `${formatDate(today)} 11:30 ص`,
            clinicalEvolution: 'تحسن ملحوظ في أعراض الحموضة وألم الصدر بنسبة 70% بعد بدء العلاج الموصوف، النوم مريح ليلاً.',
            newExam: 'الضغط الشرياني: 125/80 mmHg، النبض: 72 ن/د، فحص الصدر والبطن سليم تماماً.',
            labs: 'تم طلب لوحة دهون كاملة إضافية ومراجعة تحليل الفيتامينات.',
            investigations: 'تم جدولة تخطيط قلب بالجهد للتأكد التام من سلامة الشرايين الإكليلية.',
            waiting: 'المريض بحالة ممتازة ومستقرة، دون أي شكوى حادة.',
            treatment: 'تخفيض جرعة الإيسوميبرازول إلى 20 ملغ صباحاً لمدة أسبوعين إضافيين، وإعادة التقييم في الموعد القادم.',
            images: [],
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'patient-102',
        name: 'فاطمة أحمد السعيد',
        age: '34 سنة',
        address: 'حي النخيل، المربع الرابع',
        phone: '0559876543',
        examDate: formatDate(today),
        habits: 'لا تدخن، تمارس رياضة المشي بانتظام، نظام غذائي نباتي جزئياً.',
        medicalHistory: 'فقر دم خفيف بعوز الحديد سابق، صداع نصفي (شقيقة) غير متكرر.',
        surgicalHistory: 'ولادة قيصرية واحدة عام 2021 دون أي مضاعفات.',
        drugHistory: 'مكملات حديد وفيتامين د 50000 وحدة دولية أسبوعياً.',
        allergyHistory: 'لا يوجد تحسس دوائي أو غذائي معروف.',
        familyHistory: 'سجل عائلي لقصور الغدة الدرقية لدى الأخت الكبرى.',
        symptoms: 'خمول عام وتعب وإرهاق غير مبرر مع تساقط شعر وشعور بالبرودة الشديدة في الأطراف.',
        clinicalExam: 'شحوب خفيف في الملتحمة، الغدة الدرقية غير متضخمة بالجس، ضربات القلب 62 ن/د، الأطراف جافة نسبياً.',
        echo: 'إيكو الغدة الدرقية: نسيج متجانس خفيف الحبيبية يوحي بالتهاب درق مناعي ذاتي مبكر (هاشيموتو).',
        labs: 'TSH: 6.8 mIU/L (مرتفع)، Free T4: 0.9 ng/dL (حد أدنى)، Ferritin: 18 ng/mL (منخفض).',
        otherInvestigations: 'أضداد الدرق Anti-TPO إيجابية، تعداد الدم الكامل CBC يظهر فقر دم صغير الكريات خفيف Hb: 11.2 g/dL.',
        differentialDiagnosis: 'قصور درق تحت سريري (Subclinical Hypothyroidism) مع عوز مخزون الحديد.',
        waiting: 'شرح الحالة للمريضة والتأكيد على أن الحالة قابلة للضبط السهل والدقيق.',
        treatment: '1. ليفوثيروكسين (Levothyroxine) 25 ميكروغرام حبة صباحاً على الريق مع كأس ماء كامل قبل الفطور بساعة.\n2. كبسولات حديد مخلبي (Ferrous Bisglycinate) مع فيتامين C ظهراً.\n3. إعادة فحص TSH وCBC بعد 6 أسابيع.',
        images: [],
        followUps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'patient-103',
        name: 'الطفل عمر خالد التميمي',
        age: '8 سنوات',
        address: 'حي الروضة، عمارة الأمل',
        phone: '0561122334',
        examDate: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 15)),
        habits: 'تغذية مدرسية، حساسية موسمية خفيفة في الربيع، يلعب كرة القدم.',
        medicalHistory: 'التهاب قصبات متكرر في الطفولة المبكرة.',
        surgicalHistory: 'لا توجد سوابق جراحية.',
        drugHistory: 'بخاخ سالبيوتامول عند اللزوم، شراب فيتامينات متكاملة.',
        allergyHistory: 'تحسس من الغبار وحبوب الطلع.',
        familyHistory: 'الوالد يعاني من حساسية صدرية ربوية خفيفة.',
        symptoms: 'سعال جاف ليلي متكرر مع صفير خفيف عند التنفس بعد اللعب والجري.',
        clinicalExam: 'الصدر متناظر، أصوات تنفسية خشنة مع وزيز زفيري متناثر، الأكسجة 98%، الحرارة 36.8°C.',
        echo: 'غير مطلوب في هذه الزيارة.',
        labs: 'تعداد الدم CBC طبيعي مع فرط خفيف في الحمضات Eosinophils: 6%.',
        otherInvestigations: 'صورة صدر X-Ray طبيعية تماماً دون ارتشاحات رئوية.',
        differentialDiagnosis: 'ربو قصبي أرجحي أطفال خفيف ومستقر (Mild Pediatric Asthma).',
        waiting: 'تعليم الوالدين طريقة استخدام المفساح (Spacer) بشكل صحيح وملاحظة الأعراض.',
        treatment: '1. بخاخ كورتيكوستيرويد استنشاقي بجرعة منخفضة مرتين يومياً عبر المفساح لمدة شهر.\n2. بخاخ موسع قصبات عند اللزوم.\n3. تجنب التعرض للغبار والروائح النفاذة.',
        images: [],
        followUps: [],
        createdAt: new Date(today.getFullYear(), today.getMonth() - 1, 15).toISOString(),
        updatedAt: new Date(today.getFullYear(), today.getMonth() - 1, 15).toISOString(),
      },
      {
        id: 'patient-104',
        name: 'الحاج عبدالرحمن القحطاني',
        age: '68 سنة',
        address: 'حي الورود، مجمع الرعاية',
        phone: '0547788990',
        examDate: formatDate(new Date(today.getFullYear(), today.getMonth() - 2, 20)),
        habits: 'غير مدخن، مشي بطيء يومياً، حمية منخفضة الصوديوم.',
        medicalHistory: 'داء السكري النمط الثاني منذ 15 سنة، خشونة مفاصل الركبتين.',
        surgicalHistory: 'إصلاح فتق إربي أيمن عام 2018.',
        drugHistory: 'ميتفورمين 1000 ملغ مرتين يومياً، غليمبريد 2 ملغ صباحاً.',
        allergyHistory: 'تحسس من المسكنات من نوع الإيبوبروفين (حرقة معدة شديدة).',
        familyHistory: 'الوالد رحمه الله كان يعاني من السكري.',
        symptoms: 'ألم مفصلي مزمن بالركبتين مع تيبس صباحي يزول بعد الحركة، مراجعة روتينية لضبط السكر.',
        clinicalExam: 'الضغط 130/80 mmHg، النبض 70 ن/د، فحص الركبتين يظهر فرقعة مفصلية خفيفة دون تورم حاد.',
        echo: 'إيكو بطن سابق طبيعي.',
        labs: 'السكر التراكمي HbA1c: 7.1% (ضبط جيد)، وظائف الكلى Creatinine: 1.0 mg/dL، وظائف الكبد طبيعية.',
        otherInvestigations: 'أشعة ركبتين تظهر تضيقاً خفيفاً في المسافة المفصلية متوافقاً مع التنكس المفصلي.',
        differentialDiagnosis: 'تنكس مفصلي بالركبتين (Osteoarthritis) مع داء سكري مضبوط.',
        waiting: 'فحص سنوي لقاع العين وفحص القدم السكرية الدوري.',
        treatment: '1. باراسيتامول 1000 ملغ عند اللزوم لتسكين ألم الركبة وتجنب مضادات الالتهاب اللاستيرويدية.\n2. تمارين تقوية العضلة مربعة الرؤوس تحت إشراف العلاج الطبيعي.\n3. الاستمرار على علاج السكر المعتاد مع فحص ذاتي دوري.',
        images: [],
        followUps: [],
        createdAt: new Date(today.getFullYear(), today.getMonth() - 2, 20).toISOString(),
        updatedAt: new Date(today.getFullYear(), today.getMonth() - 2, 20).toISOString(),
      },
    ];

    for (const p of samplePatients) {
      await this.savePatient(p);
    }

    // Add sample appointment for tomorrow to demonstrate the 1-day advance reminder!
    const sampleAppointment: Appointment = {
      id: 'app-201',
      date: formatDate(tomorrow),
      time: '10:30',
      patientId: 'patient-101',
      patientName: 'محمد عبدالله العمراني',
      phone: '0501234567',
      title: 'مراجعة سريرية دورية لتقييم استجابة علاج المعدة وفحص ضغط الدم وقراءة نتائج تحاليل إنزيمات القلب ولوحة الشحوم كاملة والتأكد من إيقاف التدخين.',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    await this.saveAppointment(sampleAppointment);
  },
};
