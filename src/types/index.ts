export interface MedicalImage {
  id: string;
  name: string;
  url: string; // Base64 or object URL
  date: string;
  category?: 'echo' | 'lab' | 'xray' | 'investigations' | 'general';
  notes?: string;
}

export interface PatientFollowUp {
  id: string;
  kind?: 'followup' | 'consultation'; // نوع الحدث اللاحق: متابعة أو معاينة جديدة
  date: string; // Formatted date & time (automatically stamped)
  symptoms?: string; // الأعراض والشكوى الرئيسية (للمعاينة الجديدة)
  clinicalEvolution: string; // التطور السريري (للمتابعة)
  newExam: string; // الفحص السريري الجديد
  echo?: string; // الإيكو (للمعاينة الجديدة)
  labs: string; // المخبريات
  investigations: string; // الاستقصاءات الأخرى
  differentialDiagnosis?: string; // التشخيص التفريقي
  waiting: string; // الانتظار
  treatment: string; // العلاج
  images: MedicalImage[]; // صور مخصصة لهذه المعاينة/المتابعة
  createdAt: string;
}

export interface PatientRecord {
  id: string;
  // البيانات الأساسية
  name: string; // الاسم
  age: string; // العمر
  address: string; // السكن
  examDate: string; // تاريخ الكشف (تلقائي وفق تاريخ الهاتف)
  phone?: string; // رقم الهاتف للتواصل والمواعيد

  // السوابق والعادات
  habits: string; // العادات
  medicalHistory: string; // السوابق المرضية
  surgicalHistory: string; // السوابق الجراحية
  drugHistory: string; // السوابق الدوائية
  allergyHistory: string; // السوابق التحسسية
  familyHistory: string; // السوابق العائلية

  // الفحص والتشخيص
  symptoms: string; // الأعراض
  clinicalExam: string; // الفحص السريري
  echo: string; // الإيكو
  labs: string; // المخبريات
  otherInvestigations: string; // الاستقصاءات الأخرى
  differentialDiagnosis: string; // التشخيص التفريقي
  waiting: string; // الانتظار
  treatment: string; // العلاج

  // الصور والملفات المرفقة
  images: MedicalImage[];

  // سجل المتابعات والمعاينات الجديدة (عدد كبير وغير محدود)
  followUps: PatientFollowUp[];

  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  patientId?: string; // Optional reference to existing patient
  patientName: string;
  phone?: string;
  title: string; // تسمية الموعد (ملاحظات تفصيلية بما لا يقل عن 50 حرفاً)
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export type ViewMode = 'home' | 'patient-form' | 'calendar' | 'patient-list' | 'backup';

export type IdentifierType = 'email' | 'phone';

export interface UserAccount {
  id: string;
  fullName: string;
  identifier: string; // normalized lowercase email or normalized phone digits
  identifierType: IdentifierType;
  displayIdentifier: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserSession {
  id: string;
  fullName: string;
  identifier: string;
  identifierType: IdentifierType;
  displayIdentifier: string;
  createdAt: string;
  lastLoginAt: string;
}

