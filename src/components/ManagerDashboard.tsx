import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Power,
  MessageSquareText,
  RefreshCw,
  LogOut,
  CheckCircle2,
  PauseCircle,
  Send,
  Trash2,
  X,
  AlertCircle,
  Stethoscope,
  Megaphone,
  CheckSquare,
  Square,
  FileText,
  ArrowUpDown,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  upsertUserProfile,
} from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { AuthService } from '../services/authService';
import { SubscriptionService } from '../services/subscriptionService';
import { StorageService } from '../services/storageService';

interface ManagedSubscription {
  id: string;
  ownerUid?: string;
  fullName: string;
  status: 'active' | 'suspended';
  adminMessage: string;
  adminMessageUpdatedAt: string | null;
  filesCount: number;
  createdAt: string;
  lastSeenAt: string;
}

const MANAGER_SUBS_CACHE_KEY = 'easy_clinic_manager_subs_cache_v1';
const MANAGER_DELETED_IDS_KEY = 'easy_clinic_manager_deleted_ids_v1';
const MANAGER_OWNER_EMAIL = 'ahmad.almoustafah@gmail.com';
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function readDeletedIdsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(MANAGER_DELETED_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveDeletedIdsMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(MANAGER_DELETED_IDS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota warnings
  }
}

function readCachedSubscriptions(): ManagedSubscription[] {
  try {
    const raw = localStorage.getItem(MANAGER_SUBS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { subscriptions?: unknown })?.subscriptions)
      ? ((parsed as { subscriptions: unknown[] }).subscriptions)
      : [];
    return list.filter(
      (item): item is ManagedSubscription =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as ManagedSubscription).id === 'string' &&
        typeof (item as ManagedSubscription).fullName === 'string'
    );
  } catch {
    return [];
  }
}

function saveCachedSubscriptions(list: ManagedSubscription[]): void {
  try {
    localStorage.setItem(
      MANAGER_SUBS_CACHE_KEY,
      JSON.stringify({
        subscriptions: list,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore storage quota warnings
  }
}

function computeCounts(list: ManagedSubscription[]) {
  const active = list.filter((s) => s.status === 'active').length;
  const suspended = list.filter((s) => s.status === 'suspended').length;
  const totalFiles = list.reduce((sum, s) => sum + (s.filesCount || 0), 0);
  return {
    total: list.length,
    active,
    suspended,
    totalFiles,
  };
}

function timestampToIso(val: unknown, fallback?: unknown): string {
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  return new Date().toISOString();
}

function mapDocToManagedSubscription(
  docId: string,
  data: Record<string, unknown>
): ManagedSubscription {
  const updatedRaw =
    typeof data.adminMessageUpdatedAt === 'string' ? data.adminMessageUpdatedAt.trim() : '';
  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
    fullName: typeof data.fullName === 'string' ? data.fullName : docId,
    status: data.status === 'suspended' ? 'suspended' : 'active',
    adminMessage: typeof data.adminMessage === 'string' ? data.adminMessage : '',
    adminMessageUpdatedAt: updatedRaw || null,
    filesCount:
      typeof data.filesCount === 'number' && Number.isFinite(data.filesCount)
        ? Math.max(0, Math.floor(data.filesCount))
        : 0,
    createdAt: timestampToIso(data.createdAt, data.clientCreatedAt),
    lastSeenAt: timestampToIso(data.lastSeenAt, data.clientCreatedAt),
  };
}

function isAuthorizedOwner(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.trim().toLowerCase() === MANAGER_OWNER_EMAIL
  );
}

export const ManagerDashboard: React.FC = () => {
  const { isRTL, language, toggleLanguage } = useLanguage();
  const isAr = language === 'ar';

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[]>(() =>
    readCachedSubscriptions()
  );
  const [counts, setCounts] = useState(() => computeCounts(readCachedSubscriptions()));
  const [sortBy, setSortBy] = useState<'recent' | 'engagement'>('recent');
  const [loadingList, setLoadingList] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => readCachedSubscriptions().length > 0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<ManagedSubscription | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Message modal state (single account)
  const [messageTarget, setMessageTarget] = useState<ManagedSubscription | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Bulk / Broadcast message state (selection mode activated only via long press)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<'all' | 'selected'>('all');
  const [bulkMessageText, setBulkMessageText] = useState('');
  const [bulkMessageError, setBulkMessageError] = useState<string | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);

  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressStartPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredIdRef = React.useRef<string | null>(null);

  const isOwnerSignedIn = isAuthorizedOwner(firebaseUser);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const syncLocalAccountsWithCounts = useCallback(async () => {
    if (!auth.currentUser || !isAuthorizedOwner(auth.currentUser)) return;
    const deletedMap = readDeletedIdsMap();
    const summaries = AuthService.getAllAccountSummaries().filter((acc) => !deletedMap[acc.id]);
    if (!summaries.length) return;
    const enriched = await Promise.all(
      summaries.map(async (acc) => ({
        ...acc,
        filesCount: await StorageService.getPatientCountForUser(acc.id),
      }))
    );
    await SubscriptionService.syncAllAccounts(enriched);
  }, []);

  const applySubscriptionList = useCallback((list: ManagedSubscription[]) => {
    const deletedMap = readDeletedIdsMap();
    let deletedMapChanged = false;
    for (const s of list) {
      const delAt = deletedMap[s.id];
      if (delAt && s.lastSeenAt && new Date(s.lastSeenAt).getTime() > delAt + 5000) {
        delete deletedMap[s.id];
        deletedMapChanged = true;
      }
    }
    if (deletedMapChanged) {
      saveDeletedIdsMap(deletedMap);
    }

    const sortedList = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveCachedSubscriptions(sortedList);
    setSubscriptions(sortedList);
    setSelectedIds((prev) => prev.filter((id) => sortedList.some((s) => s.id === id)));
    setCounts(computeCounts(sortedList));
    setHasLoadedOnce(true);
  }, []);

  const manualRefreshSubscriptions = useCallback(async () => {
    if (!isOwnerSignedIn) return;
    setLoadingList(true);
    setFetchError(null);
    try {
      await syncLocalAccountsWithCounts();
      const q = query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'));
      let snap;
      try {
        snap = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'subscriptions');
      }
      const list = snap.docs.map((d) =>
        mapDocToManagedSubscription(d.id, d.data() as Record<string, unknown>)
      );
      applySubscriptionList(list);
    } catch {
      const cached = readCachedSubscriptions();
      if (cached.length > 0) {
        setSubscriptions(cached);
        setCounts(computeCounts(cached));
        setHasLoadedOnce(true);
        setFetchError(
          isAr
            ? 'تعذر الاتصال بقاعدة البيانات حالياً — يتم عرض حسابات الاشتراك المحفوظة محلياً.'
            : 'Unable to reach Cloud Firestore right now — displaying cached subscription accounts.'
        );
      } else {
        setFetchError(
          isAr
            ? 'تعذر تحميل قائمة المشتركين حالياً. يرجى الضغط على تحديث لإعادة المحاولة.'
            : 'Failed to load subscriber accounts. Tap refresh to retry.'
        );
      }
    } finally {
      setLoadingList(false);
    }
  }, [isOwnerSignedIn, isAr, syncLocalAccountsWithCounts, applySubscriptionList]);

  useEffect(() => {
    document.title = 'Easy clinic manager';
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user && !isAuthorizedOwner(user)) {
        setAuthError(
          isAr
            ? `تم تسجيل الدخول بالحساب (${user.email || 'غير معروف'})، ولكن هذه البوابة مخصصة حصراً لحساب المالك المعتمد (${MANAGER_OWNER_EMAIL}).`
            : `Signed in as ${user.email || 'unknown'}, but access is restricted exclusively to ${MANAGER_OWNER_EMAIL}.`
        );
      } else if (user && isAuthorizedOwner(user)) {
        setAuthError(null);
        void upsertUserProfile(user).catch((err) => {
          console.error('Owner profile sync error:', err);
        });
      }
    });
    return () => unsubAuth();
  }, [isAr]);

  useEffect(() => {
    if (!isOwnerSignedIn) return;

    const cached = readCachedSubscriptions();
    if (cached.length > 0) {
      setSubscriptions((prev) => (prev.length > 0 ? prev : cached));
      setCounts((prev) => (prev.total > 0 ? prev : computeCounts(cached)));
      setHasLoadedOnce(true);
    }

    setLoadingList(true);
    setFetchError(null);
    void syncLocalAccountsWithCounts().catch((err) => {
      console.error('Local account sync warning:', err);
    });

    const subsQuery = query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      subsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((d) =>
          mapDocToManagedSubscription(d.id, d.data() as Record<string, unknown>)
        );
        applySubscriptionList(list);
        setFetchError(null);
        setLoadingList(false);
      },
      (error) => {
        setLoadingList(false);
        handleFirestoreError(error, OperationType.LIST, 'subscriptions');
      }
    );

    return () => unsubscribe();
  }, [isOwnerSignedIn, syncLocalAccountsWithCounts, applySubscriptionList]);

  const handleGoogleSignIn = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!isAuthorizedOwner(cred.user)) {
        setAuthError(
          isAr
            ? `هذا الرابط مخصص حصراً لحساب المالك (${MANAGER_OWNER_EMAIL}). يرجى تسجيل الدخول بالحساب الصحيح.`
            : `Access restricted exclusively to ${MANAGER_OWNER_EMAIL}. Please sign in with the authorized owner Google account.`
        );
        await signOut(auth);
        return;
      }
      await upsertUserProfile(cred.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(
          isAr
            ? 'تعذر إتمام تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.'
            : 'Unable to complete Google Sign-In. Please try again.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleStatus = async (sub: ManagedSubscription) => {
    if (!isOwnerSignedIn || togglingId) return;
    const nextStatus: 'active' | 'suspended' =
      sub.status === 'active' ? 'suspended' : 'active';

    setTogglingId(sub.id);
    const docPath = `subscriptions/${sub.id}`;
    try {
      await updateDoc(doc(db, 'subscriptions', sub.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      showToast(
        nextStatus === 'suspended'
          ? isAr
            ? `تم التعطيل المؤقت لحساب (${sub.fullName}) — مُنع من إنشاء ملفات جديدة`
            : `Temporarily suspended (${sub.fullName})`
          : isAr
          ? `تم تفعيل حساب (${sub.fullName}) وعاد للعمل بشكل كامل`
          : `Activated (${sub.fullName}) for full access`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } finally {
      setTogglingId(null);
    }
  };

  const openMessageModal = (sub: ManagedSubscription) => {
    setMessageTarget(sub);
    setMessageText(sub.adminMessage || '');
    setMessageError(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerSignedIn || !messageTarget || sendingMessage) return;

    const trimmed = messageText.trim().slice(0, 2000);
    if (!trimmed) {
      setMessageError(
        isAr ? 'يرجى كتابة نص الرسالة قبل الإرسال.' : 'Please enter a message before sending.'
      );
      return;
    }

    setSendingMessage(true);
    setMessageError(null);
    const docPath = `subscriptions/${messageTarget.id}`;
    try {
      await updateDoc(doc(db, 'subscriptions', messageTarget.id), {
        adminMessage: trimmed,
        adminMessageUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      showToast(
        isAr
          ? `تم إرسال الرسالة إلى (${messageTarget.fullName}) وستظهر في صفحته الرئيسية`
          : `Message sent to ${messageTarget.fullName}`
      );
      setMessageTarget(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleClearMessage = async () => {
    if (!isOwnerSignedIn || !messageTarget || sendingMessage) return;
    setSendingMessage(true);
    const docPath = `subscriptions/${messageTarget.id}`;
    try {
      await updateDoc(doc(db, 'subscriptions', messageTarget.id), {
        adminMessage: '',
        adminMessageUpdatedAt: '',
        updatedAt: serverTimestamp(),
      });
      showToast(isAr ? 'تمت إزالة الرسالة من حساب العميل' : 'Client message cleared');
      setMessageTarget(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleManagerLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut errors
    }
    setSubscriptions([]);
    setHasLoadedOnce(false);
    setAuthError(null);
  };

  const handleDeleteAccount = (sub: ManagedSubscription) => {
    if (!isOwnerSignedIn || deletingId) return;
    setDeleteConfirmTarget(sub);
  };

  const handleConfirmDeleteAccount = async () => {
    const sub = deleteConfirmTarget;
    if (!isOwnerSignedIn || !sub || deletingId) return;

    setDeletingId(sub.id);
    const docPath = `subscriptions/${sub.id}`;
    try {
      await deleteDoc(doc(db, 'subscriptions', sub.id));

      const deletedMap = readDeletedIdsMap();
      deletedMap[sub.id] = Date.now();
      saveDeletedIdsMap(deletedMap);

      setSubscriptions((prev) => {
        const next = prev.filter((item) => item.id !== sub.id);
        saveCachedSubscriptions(next);
        setCounts(computeCounts(next));
        return next;
      });
      setSelectedIds((prev) => prev.filter((item) => item !== sub.id));
      setDeleteConfirmTarget(null);
      showToast(
        isAr ? `تم حذف حساب (${sub.fullName}) من القائمة المحفوظة` : `Deleted (${sub.fullName})`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } finally {
      setDeletingId(null);
    }
  };

  const clearRowLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
  };

  const startRowLongPress = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    clearRowLongPress();
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredIdRef.current = id;
      setIsSelectionMode(true);
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      longPressTimerRef.current = null;
    }, 550);
  };

  const handleRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!longPressStartPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressStartPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartPosRef.current.y);
    if (dx > 12 || dy > 12) {
      clearRowLongPress();
    }
  };

  const formatLastSeen = (iso?: string): string => {
    if (!iso) return isAr ? 'غير مسجل' : 'Not recorded';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return isAr ? 'غير مسجل' : 'Not recorded';
    return d.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleSelectAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllAccounts = () => {
    if (selectedIds.length === subscriptions.length && subscriptions.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(subscriptions.map((s) => s.id));
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const openBulkMessageModal = (preferredScope?: 'all' | 'selected') => {
    const scope =
      preferredScope ||
      (selectedIds.length > 0 && selectedIds.length < subscriptions.length ? 'selected' : 'all');
    setBulkScope(scope);
    setBulkMessageText('');
    setBulkMessageError(null);
    setIsBulkModalOpen(true);
  };

  const handleSendBulkMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerSignedIn || sendingBulk) return;

    const trimmed = bulkMessageText.trim().slice(0, 2000);
    if (!trimmed) {
      setBulkMessageError(
        isAr ? 'يرجى كتابة نص الرسالة الجماعية قبل الإرسال.' : 'Please enter a message before sending.'
      );
      return;
    }

    const targetList =
      bulkScope === 'all'
        ? subscriptions
        : subscriptions.filter((s) => selectedIds.includes(s.id));

    if (targetList.length === 0) {
      setBulkMessageError(
        isAr
          ? 'يرجى تحديد حساب اشتراك واحد على الأقل أو اختيار الإرسال لجميع الحسابات.'
          : 'Please select at least one account or switch to All Accounts.'
      );
      return;
    }

    setSendingBulk(true);
    setBulkMessageError(null);
    const nowIso = new Date().toISOString();
    try {
      for (let i = 0; i < targetList.length; i += 450) {
        const chunk = targetList.slice(i, i + 450);
        const batch = writeBatch(db);
        for (const sub of chunk) {
          batch.update(doc(db, 'subscriptions', sub.id), {
            adminMessage: trimmed,
            adminMessageUpdatedAt: nowIso,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      setIsBulkModalOpen(false);
      showToast(
        isAr
          ? `تم إرسال الرسالة الجماعية إلى (${targetList.length}) حساب وستظهر في صفحاتهم الرئيسية`
          : `Broadcast message sent to ${targetList.length} account(s)`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'subscriptions');
    } finally {
      setSendingBulk(false);
    }
  };

  const trimmedLen = messageText.trim().length;
  const bulkTrimmedLen = bulkMessageText.trim().length;

  // --- Initial Firebase Auth Check ---
  if (!authReady) {
    return (
      <div
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-sky-300 animate-spin" />
          </div>
          <h1 className="text-base font-extrabold text-white">Easy clinic manager</h1>
          <p className="text-xs text-slate-300">
            {isAr ? 'جاري التحقق من جلسة المالك السحابية...' : 'Verifying cloud owner session...'}
          </p>
        </div>
      </div>
    );
  }

  // --- Manager Google Sign-In Gate ---
  if (!isOwnerSignedIn) {
    return (
      <div
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-slate-800 via-sky-900 to-teal-900 p-6 text-center relative">
            <button
              type="button"
              onClick={toggleLanguage}
              className="absolute top-4 left-4 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold text-white cursor-pointer"
            >
              {isAr ? 'English' : 'العربية'}
            </button>

            <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center mb-3">
              <ShieldCheck className="w-7 h-7 text-sky-300" />
            </div>
            <h1 className="text-lg font-extrabold text-white tracking-tight">
              Easy clinic manager
            </h1>
            <p className="text-xs text-sky-200 mt-1">
              {isAr
                ? 'بوابة المالك السحابية (Cloud Firestore) لإدارة حسابات الاشتراك فقط'
                : 'Cloud Firestore Owner-Only Subscription Management Portal'}
            </p>
          </div>

          <div className="p-6 space-y-4">
            {authError && (
              <div className="bg-rose-950/60 border border-rose-800 text-rose-200 rounded-2xl p-3 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-center space-y-1">
              <span className="text-[11px] text-slate-400 block font-semibold">
                {isAr ? 'حساب المالك المعتمد للدخول:' : 'Authorized Owner Google Account:'}
              </span>
              <span className="text-xs font-mono font-bold text-sky-300" dir="ltr">
                {MANAGER_OWNER_EMAIL}
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full py-3 px-4 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-800 border border-slate-300 rounded-2xl text-xs font-extrabold transition-colors cursor-pointer shadow-lg flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>
                {authLoading
                  ? isAr
                    ? 'جاري تسجيل الدخول...'
                    : 'Signing in...'
                  : isAr
                  ? 'تسجيل الدخول بحساب Google'
                  : 'Sign in with Google'}
              </span>
            </button>

            {firebaseUser && (
              <button
                type="button"
                onClick={handleManagerLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-xs font-bold transition-colors cursor-pointer"
              >
                {isAr ? 'تسجيل الخروج من الحساب الحالي' : 'Sign out current account'}
              </button>
            )}

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-800">
              {isAr
                ? 'ملاحظة الخصوصية: تعرض هذه اللوحة أسماء وعدد حسابات الاشتراك فقط عبر Cloud Firestore دون أي وصول لملفات أو بيانات المرضى.'
                : 'Privacy guarantee: Only subscription account names and counts are synced to Cloud Firestore. Patient files remain strictly local.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Authenticated Owner Portal: Easy clinic manager ---
  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-12"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 max-w-[92%] text-center border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Manager App Bar */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-4 sm:px-6 py-3.5 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-sm">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-tight font-sans">
                Easy clinic manager
              </h1>
              <p className="text-[11px] text-slate-300">
                {isAr
                  ? 'إدارة حسابات الاشتراك (Cloud Firestore) · خصوصية ملفات المرضى محمية بالكامل'
                  : 'Cloud Firestore Subscription Manager · Zero Access to Patient Files'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void manualRefreshSubscriptions()}
              disabled={loadingList}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 transition-colors cursor-pointer"
              title={isAr ? 'تحديث القائمة' : 'Refresh'}
            >
              <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={toggleLanguage}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 cursor-pointer"
            >
              {isAr ? 'EN' : 'ع'}
            </button>

            <button
              onClick={() => void handleManagerLogout()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isAr ? 'خروج' : 'Logout'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Privacy Guarantee Notice */}
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-sky-900 dark:text-sky-200 font-semibold">
          <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>
            {isAr
              ? 'هذه الصفحة مستقلة وتعمل عبر Cloud Firestore لعرض أسماء وعدد حسابات الاشتراك وإجمالي عدد الملفات المدخلة فقط لتقييم التفاعل، مع منع تام للاطلاع على محتوى أي ملفات أو بيانات مرضى.'
              : 'Strict privacy isolation: Powered by Cloud Firestore storing only subscriber names, account count, and total entered file counts. Patient record contents stay 100% local and inaccessible.'}
          </span>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">
              {isAr ? 'إجمالي حسابات الاشتراك' : 'Total Subscriptions'}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1 block">
              {counts.total}
            </span>
          </div>

          <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block font-bold">
              {isAr ? 'حسابات مفعلة' : 'Active'}
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1 block">
              {counts.active}
            </span>
          </div>

          <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] text-rose-700 dark:text-rose-300 block font-bold">
              {isAr ? 'معطلة مؤقتاً' : 'Suspended'}
            </span>
            <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1 block">
              {counts.suspended}
            </span>
          </div>

          <div className="bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] text-sky-700 dark:text-sky-300 block font-bold">
              {isAr ? 'إجمالي الملفات المدخلة' : 'Total Entered Files'}
            </span>
            <span className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 font-mono mt-1 block">
              {counts.totalFiles}
            </span>
          </div>
        </div>

        {/* Subscription Accounts List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? 'قائمة حسابات الاشتراك' : 'Subscription Accounts'}
              </h2>
              <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-xl border border-sky-200 dark:border-sky-800 font-mono">
                {counts.total}
              </span>
            </div>

            {subscriptions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSortBy((prev) => (prev === 'recent' ? 'engagement' : 'recent'))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
                  title={isAr ? 'تبديل ترتيب الحسابات لتقييم التفاعل' : 'Toggle sort order'}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>
                    {sortBy === 'engagement'
                      ? isAr
                        ? 'ترتيب: الأكثر تفاعلاً'
                        : 'Sort: Most Active'
                      : isAr
                      ? 'ترتيب: الأحدث اشتراكاً'
                      : 'Sort: Newest'}
                  </span>
                </button>

                {isSelectionMode && (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAllAccounts}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      {selectedIds.length === subscriptions.length && subscriptions.length > 0 ? (
                        <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {selectedIds.length === subscriptions.length && subscriptions.length > 0
                          ? isAr
                            ? 'إلغاء تحديد الكل'
                            : 'Clear All'
                          : isAr
                          ? 'تحديد الكل'
                          : 'Select All'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={exitSelectionMode}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إنهاء التحديد' : 'Done'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => openBulkMessageModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-amber-950 rounded-xl text-xs font-extrabold shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>
                    {selectedIds.length > 0 && selectedIds.length < subscriptions.length
                      ? isAr
                        ? `رسالة جماعية (${selectedIds.length})`
                        : `Bulk Message (${selectedIds.length})`
                      : isAr
                      ? 'رسالة جماعية'
                      : 'Broadcast Message'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {fetchError && (
            <div className="mb-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-2xl p-3 text-xs font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={() => void manualRefreshSubscriptions()}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold shrink-0 cursor-pointer"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </div>
          )}

          {loadingList && !hasLoadedOnce ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <RefreshCw className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
              <p className="font-semibold">
                {isAr ? 'جاري تحميل جميع حسابات المشتركين...' : 'Loading subscriber accounts...'}
              </p>
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 stroke-[1.2]" />
              <p className="font-semibold">
                {isAr
                  ? 'لا توجد حسابات اشتراك مسجلة في السحابة حتى الآن'
                  : 'No user subscription accounts synced to Firestore yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(sortBy === 'engagement'
                ? [...subscriptions].sort((a, b) => (b.filesCount || 0) - (a.filesCount || 0))
                : subscriptions
              ).map((sub, index) => {
                const isActive = sub.status === 'active';
                const isSelected = selectedIds.includes(sub.id);
                const filesCount = sub.filesCount || 0;
                const lastSeenMs = sub.lastSeenAt ? new Date(sub.lastSeenAt).getTime() : 0;
                const isOnlineRecently =
                  Number.isFinite(lastSeenMs) && lastSeenMs > 0 && Date.now() - lastSeenMs <= ONLINE_WINDOW_MS;
                const engagementLabel =
                  filesCount === 0
                    ? isAr
                      ? 'بدون ملفات بعد'
                      : 'No files yet'
                    : filesCount < 10
                    ? isAr
                      ? 'تفاعل مبدئي'
                      : 'Starter'
                    : filesCount < 30
                    ? isAr
                      ? 'تفاعل متوسط'
                      : 'Moderate'
                    : isAr
                    ? 'تفاعل عالٍ'
                    : 'High Engagement';
                const engagementClasses =
                  filesCount === 0
                    ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    : filesCount < 10
                    ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
                    : filesCount < 30
                    ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';

                return (
                  <div
                    key={sub.id}
                    onPointerDown={(e) => startRowLongPress(sub.id, e)}
                    onPointerMove={handleRowPointerMove}
                    onPointerUp={clearRowLongPress}
                    onPointerCancel={clearRowLongPress}
                    onContextMenu={(e) => {
                      if (isSelectionMode || longPressTriggeredIdRef.current) {
                        e.preventDefault();
                      }
                    }}
                    onClick={() => {
                      if (longPressTriggeredIdRef.current === sub.id) {
                        longPressTriggeredIdRef.current = null;
                        return;
                      }
                      if (isSelectionMode) {
                        toggleSelectAccount(sub.id);
                      }
                    }}
                    className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 rounded-2xl transition-colors select-none ${
                      isSelectionMode ? 'cursor-pointer' : ''
                    } ${
                      isSelected ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isSelectionMode && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectAccount(sub.id);
                            }}
                            className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer shrink-0 p-0.5"
                            title={isAr ? 'تحديد لإرسال رسالة جماعية' : 'Select for bulk message'}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold font-mono flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {sub.fullName}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                          }`}
                        >
                          {isActive
                            ? isAr
                              ? 'مفعل (صلاحية كاملة)'
                              : 'Active'
                            : isAr
                            ? 'تعطيل مؤقت (بدون ملفات جديدة)'
                            : 'Suspended (No New Files)'}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            isOnlineRecently
                              ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800'
                              : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}
                        >
                          {isOnlineRecently ? (
                            <Wifi className="w-2.5 h-2.5 shrink-0" />
                          ) : (
                            <WifiOff className="w-2.5 h-2.5 shrink-0" />
                          )}
                          <span>
                            {isOnlineRecently
                              ? isAr
                                ? 'متصل الآن'
                                : 'Online'
                              : isAr
                              ? 'غير متصل حالياً'
                              : 'Offline'}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isAr ? 'عدد الملفات المدخلة:' : 'Total Files:'}{' '}
                            <span className="font-mono">{filesCount}</span>
                          </span>
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-xl border ${engagementClasses}`}
                        >
                          {engagementLabel}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          {isAr ? 'تاريخ الاشتراك:' : 'Subscribed:'}{' '}
                          <span className="font-mono">
                            {new Date(sub.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                          </span>
                        </span>

                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isAr ? 'آخر اتصال بالإنترنت:' : 'Last online:'}{' '}
                          <span className="font-mono">{formatLastSeen(sub.lastSeenAt)}</span>
                        </span>
                      </div>

                      {sub.adminMessage && (
                        <div className="mt-1.5 inline-flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-xl px-2.5 py-1.5 text-[11px] max-w-lg">
                          <MessageSquareText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{sub.adminMessage}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Icons Next to Each Account */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap"
                    >
                      {/* Icon 1: Green/Red Subscription Status Toggle */}
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(sub)}
                        disabled={togglingId === sub.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-extrabold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                          isActive
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                        }`}
                        title={
                          isActive
                            ? isAr
                              ? 'اضغط للتعطيل المؤقت (منع الملفات الجديدة)'
                              : 'Tap to temporarily suspend'
                            : isAr
                            ? 'اضغط لإعادة التفعيل الكامل'
                            : 'Tap to reactivate full access'
                        }
                      >
                        {isActive ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <PauseCircle className="w-4 h-4" />
                        )}
                        <span>
                          {isActive
                            ? isAr
                              ? 'مفعل'
                              : 'Active'
                            : isAr
                            ? 'معطل مؤقتاً'
                            : 'Suspended'}
                        </span>
                        <Power className="w-3.5 h-3.5 opacity-80" />
                      </button>

                      {/* Icon 2: Message to Client (رسالة للعميل) */}
                      <button
                        type="button"
                        onClick={() => openMessageModal(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 rounded-2xl text-xs font-extrabold shadow-xs transition-all cursor-pointer active:scale-95"
                        title={isAr ? 'إرسال رسالة تظهر في صفحة العميل الرئيسية' : 'Send message to client home screen'}
                      >
                        <MessageSquareText className="w-4 h-4" />
                        <span>{isAr ? 'رسالة للعميل' : 'Message Client'}</span>
                      </button>

                      {/* Icon 3: Delete Account from Saved List */}
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(sub)}
                        disabled={deletingId === sub.id}
                        className="p-2 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-2xl transition-colors cursor-pointer disabled:opacity-50"
                        title={isAr ? 'حذف الحساب من القائمة المحفوظة' : 'Delete account from list'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Send Message to Client Modal */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-400 text-amber-950 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessageSquareText className="w-5 h-5" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isAr ? 'رسالة للعميل' : 'Message to Client'}
                  </h3>
                  <p className="text-[11px] font-semibold opacity-90 truncate max-w-[230px]">
                    {messageTarget.fullName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMessageTarget(null)}
                className="p-1.5 hover:bg-black/10 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="p-5 space-y-3.5">
              {messageError && (
                <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl p-2.5 text-xs font-semibold">
                  {messageError}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {isAr
                      ? 'نص الرسالة (تظهر في مستطيل أصفر على الرئيسية):'
                      : 'Message text (shown in a yellow box on Home):'}
                  </label>
                  <span className="font-mono font-bold text-[11px] text-slate-500 dark:text-slate-400">
                    {trimmedLen} {isAr ? 'حرف' : 'chars'}
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اكتب رسالتك للعميل هنا...'
                      : 'Write your message to the client...'
                  }
                  className="w-full p-3.5 text-xs bg-amber-50/40 dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                {messageTarget.adminMessage ? (
                  <button
                    type="button"
                    onClick={() => void handleClearMessage()}
                    disabled={sendingMessage}
                    className="inline-flex items-center gap-1 px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'حذف الرسالة' : 'Clear'}</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMessageTarget(null)}
                    className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={sendingMessage || trimmedLen === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-amber-950 rounded-xl text-xs font-extrabold cursor-pointer shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إرسال للعميل' : 'Send Message'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk / Broadcast Message Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="bg-amber-400 text-amber-950 px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Megaphone className="w-5 h-5" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isAr ? 'رسالة جماعية للمشتركين' : 'Broadcast / Bulk Message'}
                  </h3>
                  <p className="text-[11px] font-semibold opacity-90">
                    {bulkScope === 'all'
                      ? isAr
                        ? `سيتم الإرسال لجميع الحسابات (${subscriptions.length})`
                        : `Sending to all accounts (${subscriptions.length})`
                      : isAr
                      ? `سيتم الإرسال لـ (${selectedIds.length}) حساب محدد`
                      : `Sending to ${selectedIds.length} selected account(s)`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 hover:bg-black/10 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendBulkMessage} className="p-5 space-y-3.5 overflow-y-auto">
              {bulkMessageError && (
                <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl p-2.5 text-xs font-semibold">
                  {bulkMessageError}
                </div>
              )}

              {/* Target Scope Selector: All vs Selected Subset */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkScope('all')}
                  className={`py-2 px-3 rounded-2xl text-xs font-extrabold border transition-all cursor-pointer ${
                    bulkScope === 'all'
                      ? 'bg-amber-400 border-amber-500 text-amber-950 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isAr
                    ? `جميع الحسابات (${subscriptions.length})`
                    : `All Accounts (${subscriptions.length})`}
                </button>

                <button
                  type="button"
                  onClick={() => setBulkScope('selected')}
                  className={`py-2 px-3 rounded-2xl text-xs font-extrabold border transition-all cursor-pointer ${
                    bulkScope === 'selected'
                      ? 'bg-amber-400 border-amber-500 text-amber-950 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isAr
                    ? `حسابات محددة (${selectedIds.length})`
                    : `Selected (${selectedIds.length})`}
                </button>
              </div>

              {/* Account Selector Checklist when 'selected' is active */}
              {bulkScope === 'selected' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-2.5 max-h-40 overflow-y-auto space-y-1 bg-slate-50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {isAr ? 'اختر الحسابات المستهدفة:' : 'Choose target accounts:'}
                    </span>
                    <button
                      type="button"
                      onClick={toggleSelectAllAccounts}
                      className="text-[11px] font-bold text-sky-600 dark:text-sky-400 cursor-pointer"
                    >
                      {selectedIds.length === subscriptions.length
                        ? isAr
                          ? 'إلغاء الكل'
                          : 'Unselect all'
                        : isAr
                        ? 'تحديد الكل'
                        : 'Select all'}
                    </button>
                  </div>
                  {subscriptions.map((sub) => {
                    const checked = selectedIds.includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-800 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectAccount(sub.id)}
                          className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {sub.fullName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {isAr
                      ? 'نص الرسالة الجماعية (تظهر في مستطيل أصفر على الرئيسية):'
                      : 'Broadcast message (shown in yellow box on Home):'}
                  </label>
                  <span className="font-mono font-bold text-[11px] text-slate-500 dark:text-slate-400">
                    {bulkTrimmedLen} {isAr ? 'حرف' : 'chars'}
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={bulkMessageText}
                  onChange={(e) => setBulkMessageText(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اكتب الرسالة لإرسالها للحسابات المختارة...'
                      : 'Write broadcast message...'
                  }
                  className="w-full p-3.5 text-xs bg-amber-50/40 dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={
                    sendingBulk ||
                    bulkTrimmedLen === 0 ||
                    (bulkScope === 'selected' && selectedIds.length === 0)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-amber-950 rounded-xl text-xs font-extrabold cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {sendingBulk
                      ? isAr
                        ? 'جاري الإرسال...'
                        : 'Sending...'
                      : bulkScope === 'all'
                      ? isAr
                        ? `إرسال للجميع (${subscriptions.length})`
                        : `Send to All (${subscriptions.length})`
                      : isAr
                      ? `إرسال لـ (${selectedIds.length}) حساب`
                      : `Send to (${selectedIds.length})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Subscription Account Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-extrabold">
                  {isAr ? 'تأكيد الحذف؟' : 'Confirm deletion?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !deletingId && setDeleteConfirmTarget(null)}
                className="p-1.5 hover:bg-black/15 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-semibold">
                {isAr
                  ? `هل أنت متأكد من حذف حساب (${deleteConfirmTarget.fullName}) من القائمة المحفوظة؟`
                  : `Are you sure you want to delete (${deleteConfirmTarget.fullName}) from the saved subscriptions list?`}
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(null)}
                  disabled={Boolean(deletingId)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteAccount()}
                  disabled={Boolean(deletingId)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {deletingId
                      ? isAr
                        ? 'جاري الحذف...'
                        : 'Deleting...'
                      : isAr
                      ? 'تأكيد الحذف'
                      : 'Delete'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
