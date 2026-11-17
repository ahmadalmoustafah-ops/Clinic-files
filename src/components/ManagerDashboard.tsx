import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Power,
  MessageSquareText,
  RefreshCw,
  LogOut,
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  PauseCircle,
  Send,
  Trash2,
  X,
  AlertCircle,
  Stethoscope,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { AuthService } from '../services/authService';
import { SubscriptionService } from '../services/subscriptionService';

interface ManagedSubscription {
  id: string;
  fullName: string;
  status: 'active' | 'suspended';
  adminMessage: string;
  adminMessageUpdatedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
}

const MANAGER_TOKEN_KEY = 'easy_clinic_manager_token_v1';
const MANAGER_SAVED_CRED_KEY = 'easy_clinic_manager_saved_cred_v1';
const MANAGER_OWNER_EMAIL = 'ahmad.almoustafah@gmail.com';

interface SavedManagerCred {
  email: string;
  password: string;
}

function readStoredManagerToken(): string | null {
  try {
    return (
      localStorage.getItem(MANAGER_TOKEN_KEY) ||
      sessionStorage.getItem(MANAGER_TOKEN_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

function saveStoredManagerToken(token: string): void {
  try {
    localStorage.setItem(MANAGER_TOKEN_KEY, token);
  } catch {}
  try {
    sessionStorage.setItem(MANAGER_TOKEN_KEY, token);
  } catch {}
}

function clearStoredManagerToken(): void {
  try {
    localStorage.removeItem(MANAGER_TOKEN_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(MANAGER_TOKEN_KEY);
  } catch {}
}

function readSavedManagerCred(): SavedManagerCred | null {
  try {
    const raw = localStorage.getItem(MANAGER_SAVED_CRED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedManagerCred>;
    if (
      typeof parsed?.email === 'string' &&
      typeof parsed?.password === 'string' &&
      parsed.email.trim() &&
      parsed.password.length >= 6
    ) {
      return { email: parsed.email.trim(), password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSavedManagerCred(email: string, password: string): void {
  try {
    localStorage.setItem(
      MANAGER_SAVED_CRED_KEY,
      JSON.stringify({ email: email.trim(), password })
    );
  } catch {}
}

function clearSavedManagerCred(): void {
  try {
    localStorage.removeItem(MANAGER_SAVED_CRED_KEY);
  } catch {}
}

export const ManagerDashboard: React.FC = () => {
  const { isRTL, language, toggleLanguage } = useLanguage();
  const isAr = language === 'ar';

  const [token, setToken] = useState<string | null>(readStoredManagerToken);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState(() => readSavedManagerCred()?.email || MANAGER_OWNER_EMAIL);
  const [password, setPassword] = useState(() => readSavedManagerCred()?.password || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(true);
  const [autoLoggingIn, setAutoLoggingIn] = useState<boolean>(
    () => !readStoredManagerToken() && Boolean(readSavedManagerCred())
  );
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[]>([]);
  const [counts, setCounts] = useState({ total: 0, active: 0, suspended: 0 });
  const [loadingList, setLoadingList] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Message modal state
  const [messageTarget, setMessageTarget] = useState<ManagedSubscription | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const initAuthAndAutoLogin = useCallback(async () => {
    let configured = true;
    try {
      const res = await fetch(`/api/manager/auth-status?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { isConfigured?: boolean };
        configured = Boolean(data.isConfigured);
        setIsConfigured(configured);
      } else {
        setIsConfigured(true);
      }
    } catch {
      setIsConfigured(true);
    }

    const saved = readSavedManagerCred();
    if (saved && saved.email.toLowerCase() === MANAGER_OWNER_EMAIL) {
      setAutoLoggingIn(true);
      try {
        const endpoint = configured ? '/api/manager/login' : '/api/manager/setup';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: saved.email, password: saved.password }),
        });
        const data = (await res.json()) as { token?: string };
        if (res.ok && data.token) {
          saveStoredManagerToken(data.token);
          setToken(data.token);
          setAuthError(null);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          clearSavedManagerCred();
        }
      } catch {
        // Network issue; fall back cleanly to login view
      } finally {
        setAutoLoggingIn(false);
      }
    } else {
      setAutoLoggingIn(false);
    }
  }, []);

  const fetchSubscriptions = useCallback(async (activeToken: string) => {
    setLoadingList(true);
    setFetchError(null);
    try {
      // Ensure any locally registered accounts in this browser are synced before listing
      await SubscriptionService.syncAllAccounts(AuthService.getAllAccountSummaries());

      const res = await fetch(`/api/manager/subscriptions?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
        cache: 'no-store',
      });

      if (res.status === 401) {
        clearStoredManagerToken();
        setToken(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        totalCount: number;
        activeCount: number;
        suspendedCount: number;
        subscriptions: ManagedSubscription[];
      };
      setSubscriptions(data.subscriptions || []);
      setCounts({
        total: data.totalCount || 0,
        active: data.activeCount || 0,
        suspended: data.suspendedCount || 0,
      });
      setHasLoadedOnce(true);
    } catch {
      setFetchError(
        isAr
          ? 'تعذر تحميل قائمة المشتركين من الخادم حالياً. يرجى الضغط على تحديث لإعادة المحاولة.'
          : 'Failed to load subscriber accounts from server. Tap refresh to retry.'
      );
    } finally {
      setLoadingList(false);
    }
  }, [isAr]);

  useEffect(() => {
    document.title = 'Easy clinic manager';
    SubscriptionService.syncAllAccounts(AuthService.getAllAccountSummaries());
  }, []);

  useEffect(() => {
    if (!token) {
      initAuthAndAutoLogin();
    } else {
      fetchSubscriptions(token);
      const timer = window.setInterval(() => fetchSubscriptions(token), 15000);
      const onFocusOrVisible = () => {
        if (document.visibilityState === 'visible') {
          fetchSubscriptions(token);
        }
      };
      window.addEventListener('focus', onFocusOrVisible);
      window.addEventListener('online', onFocusOrVisible);
      document.addEventListener('visibilitychange', onFocusOrVisible);
      return () => {
        clearInterval(timer);
        window.removeEventListener('focus', onFocusOrVisible);
        window.removeEventListener('online', onFocusOrVisible);
        document.removeEventListener('visibilitychange', onFocusOrVisible);
      };
    }
  }, [token, initAuthAndAutoLogin, fetchSubscriptions]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;
    setAuthError(null);

    if (isConfigured === false) {
      if (password.length < 6) {
        setAuthError(
          isAr
            ? 'كلمة سر المدير يجب أن تتكون من 6 أحرف على الأقل.'
            : 'Manager password must be at least 6 characters.'
        );
        return;
      }
      if (password !== confirmPassword) {
        setAuthError(isAr ? 'كلمتا السر غير متطابقتين.' : 'Passwords do not match.');
        return;
      }

      setAuthLoading(true);
      try {
        const res = await fetch('/api/manager/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) {
          setAuthError(data.error || (isAr ? 'فشل إعداد كلمة السر' : 'Setup failed'));
          return;
        }
        saveStoredManagerToken(data.token);
        if (rememberPassword) {
          saveSavedManagerCred(email, password);
        } else {
          clearSavedManagerCred();
        }
        setToken(data.token);
        setPassword('');
        setConfirmPassword('');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/manager/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(
          isAr
            ? 'بيانات الدخول غير صحيحة. هذا الرابط مخصص لصاحب التطبيق فقط.'
            : data.error || 'Invalid owner credentials.'
        );
        return;
      }
      saveStoredManagerToken(data.token);
      if (rememberPassword) {
        saveSavedManagerCred(email, password);
      } else {
        clearSavedManagerCred();
      }
      setToken(data.token);
      setPassword('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleStatus = async (sub: ManagedSubscription) => {
    if (!token || togglingId) return;
    const nextStatus: 'active' | 'suspended' =
      sub.status === 'active' ? 'suspended' : 'active';

    setTogglingId(sub.id);
    try {
      const res = await fetch(`/api/manager/subscriptions/${encodeURIComponent(sub.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.status === 401) {
        clearStoredManagerToken();
        setToken(null);
        return;
      }

      if (res.ok) {
        await fetchSubscriptions(token);
        showToast(
          nextStatus === 'suspended'
            ? isAr
              ? `تم التعطيل المؤقت لحساب (${sub.fullName}) — مُنع من إنشاء ملفات جديدة`
              : `Temporarily suspended (${sub.fullName})`
            : isAr
            ? `تم تفعيل حساب (${sub.fullName}) وعاد للعمل بشكل كامل`
            : `Activated (${sub.fullName}) for full access`
        );
      }
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
    if (!token || !messageTarget || sendingMessage) return;

    const trimmed = messageText.trim();
    if (!trimmed) {
      setMessageError(
        isAr ? 'يرجى كتابة نص الرسالة قبل الإرسال.' : 'Please enter a message before sending.'
      );
      return;
    }

    setSendingMessage(true);
    setMessageError(null);
    try {
      const res = await fetch(
        `/api/manager/subscriptions/${encodeURIComponent(messageTarget.id)}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: trimmed }),
        }
      );

      if (res.status === 401) {
        clearStoredManagerToken();
        setToken(null);
        return;
      }

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        setMessageError(errData.error || 'Failed to send message');
        return;
      }

      await fetchSubscriptions(token);
      showToast(
        isAr
          ? `تم إرسال الرسالة إلى (${messageTarget.fullName}) وستظهر في صفحته الرئيسية`
          : `Message sent to ${messageTarget.fullName}`
      );
      setMessageTarget(null);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleClearMessage = async () => {
    if (!token || !messageTarget || sendingMessage) return;
    setSendingMessage(true);
    try {
      const res = await fetch(
        `/api/manager/subscriptions/${encodeURIComponent(messageTarget.id)}/message`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        await fetchSubscriptions(token);
        showToast(isAr ? 'تمت إزالة الرسالة من حساب العميل' : 'Client message cleared');
        setMessageTarget(null);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const handleManagerLogout = () => {
    clearStoredManagerToken();
    clearSavedManagerCred();
    setToken(null);
    setPassword('');
    setConfirmPassword('');
    setSubscriptions([]);
    setHasLoadedOnce(false);
  };

  const trimmedLen = messageText.trim().length;

  // --- Seamless Auto-Login Splash while verifying remembered credentials ---
  if (!token && autoLoggingIn) {
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
            {isAr ? 'جاري الدخول التلقائي بكلمة السر المحفوظة...' : 'Signing in automatically with saved credentials...'}
          </p>
        </div>
      </div>
    );
  }

  // --- Manager Login / First-Time Owner Setup View ---
  if (!token) {
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
              {isConfigured === false
                ? isAr
                  ? 'إعداد كلمة سر المدير الوحيد لإدارة الاشتراكات'
                  : 'First-time Owner Password Setup'
                : isAr
                ? 'بوابة المالك الخاصة لإدارة حسابات الاشتراك فقط'
                : 'Owner-Only Subscription Management Portal'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="p-6 space-y-4">
            {authError && (
              <div className="bg-rose-950/60 border border-rose-800 text-rose-200 rounded-2xl p-3 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {isAr ? 'البريد الإلكتروني المعتمد للمالك' : 'Authorized Owner Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  className="w-full py-2.5 pl-10 pr-3.5 bg-slate-950 border border-slate-700 rounded-2xl text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {isConfigured === false
                  ? isAr
                    ? 'إنشاء كلمة سر المدير'
                    : 'Create Manager Password'
                  : isAr
                  ? 'كلمة سر المدير'
                  : 'Manager Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  dir="ltr"
                  className="w-full py-2.5 pl-10 pr-10 bg-slate-950 border border-slate-700 rounded-2xl text-sm text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isConfigured === false && (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  {isAr ? 'تأكيد كلمة السر' : 'Confirm Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    dir="ltr"
                    className="w-full py-2.5 pl-10 pr-3.5 bg-slate-950 border border-slate-700 rounded-2xl text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
              />
              <span>
                {isAr
                  ? 'حفظ كلمة السر على هذا الجهاز للدخول التلقائي مستقبلاً'
                  : 'Keep password on this device for automatic sign-in'}
              </span>
            </label>

            <button
              type="submit"
              disabled={authLoading || isConfigured === null}
              className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-2xl text-xs font-extrabold transition-colors cursor-pointer shadow-lg shadow-sky-600/20"
            >
              {authLoading
                ? isAr
                  ? 'جاري التحقق...'
                  : 'Verifying...'
                : isConfigured === false
                ? isAr
                  ? 'حفظ كلمة السر ودخول Easy clinic manager'
                  : 'Set Password & Enter Manager'
                : isAr
                ? 'دخول Easy clinic manager'
                : 'Sign In to Easy clinic manager'}
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-800">
              {isAr
                ? 'ملاحظة الخصوصية: تعرض هذه اللوحة أسماء وعدد حسابات الاشتراك فقط دون أي وصول لملفات أو بيانات المرضى.'
                : 'Privacy guarantee: Only subscription account names and counts are visible. Patient files remain strictly inaccessible.'}
            </p>
          </form>
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
                  ? 'إدارة حسابات الاشتراك · خصوصية ملفات المرضى محمية بالكامل'
                  : 'Subscription Accounts Manager · Zero Access to Patient Files'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSubscriptions(token)}
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
              onClick={handleManagerLogout}
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
              ? 'هذه الصفحة مستقلة وتعرض عدد وأسماء حسابات الاشتراك فقط، مع منع تام للاطلاع على أي سجلات مرضى أو ملفات مسجلة داخل الحسابات.'
              : 'Strict privacy isolation: Only subscriber names and account count are displayed. Patient records and clinic files remain 100% private and inaccessible.'}
          </span>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-3 gap-3">
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
        </div>

        {/* Subscription Accounts List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? 'قائمة حسابات الاشتراك' : 'Subscription Accounts'}
              </h2>
            </div>
            <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 rounded-xl border border-sky-200 dark:border-sky-800 font-mono">
              {counts.total}
            </span>
          </div>

          {fetchError && (
            <div className="mb-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-2xl p-3 text-xs font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchSubscriptions(token)}
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
                  ? 'لا توجد حسابات اشتراك مسجلة حتى الآن'
                  : 'No user subscription accounts registered yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {subscriptions.map((sub, index) => {
                const isActive = sub.status === 'active';
                return (
                  <div
                    key={sub.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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
                      </div>

                      <p className="text-[11px] text-slate-400">
                        {isAr ? 'تاريخ الاشتراك:' : 'Subscribed:'}{' '}
                        <span className="font-mono">
                          {new Date(sub.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                        </span>
                      </p>

                      {sub.adminMessage && (
                        <div className="mt-1.5 inline-flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-xl px-2.5 py-1.5 text-[11px] max-w-lg">
                          <MessageSquareText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{sub.adminMessage}</span>
                        </div>
                      )}
                    </div>

                    {/* Two Required Action Icons Next to Each Account */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Icon 1: Green/Red Subscription Status Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(sub)}
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Send Message to Client Modal (>= 50 chars) */}
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
                    onClick={handleClearMessage}
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
    </div>
  );
};
