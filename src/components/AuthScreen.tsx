import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  ShieldCheck,
  Languages,
  User,
  AlertCircle,
  KeyRound,
  Trash2,
} from 'lucide-react';
import { UserSession } from '../types';
import {
  AuthService,
  AuthErrorCode,
  RememberedAccountCredential,
} from '../services/authService';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../context/LanguageContext';
import { OfflineBadge } from './OfflineIndicator';

interface AuthScreenProps {
  onAuthenticated: (session: UserSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const { t, isRTL, toggleLanguage } = useLanguage();
  const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccountCredential[]>(() =>
    AuthService.getRememberedAccounts()
  );

  const initialLatest = rememberedAccounts[0];
  const hasExistingAccounts = rememberedAccounts.length > 0;

  const [mode, setMode] = useState<'login' | 'register'>(
    hasExistingAccounts ? 'login' : 'register'
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialLatest ? initialLatest.accountId : null
  );
  const [fullName, setFullName] = useState('');
  const [identifierInput, setIdentifierInput] = useState(
    initialLatest ? initialLatest.displayIdentifier : ''
  );
  const [password, setPassword] = useState(initialLatest?.password || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hydrate accounts & remembered credentials from IndexedDB backup if localStorage missed them
  useEffect(() => {
    let cancelled = false;
    AuthService.hydrateFromPersistentBackup().then((restored) => {
      if (cancelled) return;
      const list = AuthService.getRememberedAccounts();
      setRememberedAccounts(list);
      if (restored && list.length > 0) {
        setMode('login');
        if (!identifierInput) {
          setSelectedAccountId(list[0].accountId);
          setIdentifierInput(list[0].displayIdentifier);
          setPassword(list[0].password || '');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapErrorCode = (code?: AuthErrorCode): string => {
    switch (code) {
      case 'INVALID_NAME':
        return t.authErrInvalidName;
      case 'INVALID_IDENTIFIER':
        return t.authErrInvalidIdentifier;
      case 'WEAK_PASSWORD':
        return t.authErrWeakPassword;
      case 'ACCOUNT_EXISTS':
        return t.authErrAccountExists;
      case 'INVALID_CREDENTIALS':
      default:
        return t.authErrInvalidCredentials;
    }
  };

  const handleSelectRememberedAccount = (acc: RememberedAccountCredential) => {
    setErrorMsg(null);
    setSelectedAccountId(acc.accountId);
    setIdentifierInput(acc.displayIdentifier);
    setPassword(acc.password || '');
    setMode('login');
  };

  const handleQuickLoginAccount = async (acc: RememberedAccountCredential) => {
    if (isSubmitting) return;
    handleSelectRememberedAccount(acc);
    if (!acc.password) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await AuthService.login({
        identifierInput: acc.displayIdentifier,
        password: acc.password,
        rememberCredentials: true,
      });

      if (!res.success || !res.session) {
        setErrorMsg(mapErrorCode(res.errorCode));
        return;
      }

      StorageService.setActiveUser(res.session.id);
      onAuthenticated(res.session);
    } catch {
      setErrorMsg(t.authGenericLoginError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgetPassword = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    AuthService.forgetSavedPassword(accountId);
    const updated = AuthService.getRememberedAccounts();
    setRememberedAccounts(updated);
    if (selectedAccountId === accountId) {
      setPassword('');
    }
  };

  const handleUseAnotherAccount = () => {
    setSelectedAccountId(null);
    setIdentifierInput('');
    setPassword('');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setErrorMsg(t.authErrPasswordMismatch);
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await AuthService.registerAccount({
          fullName,
          identifierInput,
          password,
          rememberCredentials,
        });

        if (!res.success || !res.session) {
          setErrorMsg(mapErrorCode(res.errorCode));
          return;
        }

        // If this is the very first account created on an upgraded device, migrate legacy real records once
        if (res.isFirstAccountOnDevice) {
          await StorageService.migrateLegacyDataToFirstUser(res.session.id);
        }

        StorageService.setActiveUser(res.session.id);
        onAuthenticated(res.session);
      } catch {
        setErrorMsg(t.authGenericLoginError);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Login mode
    setIsSubmitting(true);
    try {
      const res = await AuthService.login({
        identifierInput,
        password,
        rememberCredentials,
      });

      if (!res.success || !res.session) {
        setErrorMsg(mapErrorCode(res.errorCode));
        return;
      }

      StorageService.setActiveUser(res.session.id);
      onAuthenticated(res.session);
    } catch {
      setErrorMsg(t.authGenericLoginError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setErrorMsg(null);
    if (nextMode === 'register') {
      setSelectedAccountId(null);
      setIdentifierInput('');
      setPassword('');
      setConfirmPassword('');
    } else if (rememberedAccounts.length > 0) {
      const target = rememberedAccounts[0];
      setSelectedAccountId(target.accountId);
      setIdentifierInput(target.displayIdentifier);
      setPassword(target.password || '');
    }
  };

  const looksLikeEmail = identifierInput.includes('@');

  return (
    <div
      className="min-h-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-teal-700 text-white px-5 pt-5 pb-10 rounded-b-[2rem] shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between mb-5 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/25">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight block leading-none font-sans">
                {t.appName}
              </span>
              <span className="text-[10px] text-sky-100 block mt-0.5">{t.appSubtitle}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl text-xs font-bold transition-colors border border-white/20 cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{t.toggleLanguage}</span>
          </button>
        </div>

        <div className="relative z-10 text-center space-y-1.5">
          <div className="inline-flex justify-center mb-1">
            <OfflineBadge />
          </div>
          <h1 className="text-lg font-extrabold text-white">{t.authWelcomeTitle}</h1>
          <p className="text-xs text-sky-100/95 max-w-xs mx-auto leading-relaxed">
            {t.authWelcomeSubtitle}
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div className="px-4 -mt-6 pb-6 flex-1 flex flex-col justify-start">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t.authRegisterTab}</span>
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t.authLoginTab}</span>
            </button>
          </div>

          {!hasExistingAccounts && mode === 'register' && (
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 rounded-2xl px-3.5 py-2.5 text-[11px] text-sky-800 dark:text-sky-300 font-semibold text-center">
              {t.authFirstAccountHint}
            </div>
          )}

          {/* Remembered Accounts List (on Login tab) */}
          {mode === 'login' && rememberedAccounts.length > 0 && (
            <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>{t.authSavedAccountsTitle}</span>
                </span>
                <button
                  type="button"
                  onClick={handleUseAnotherAccount}
                  className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  {t.authUseAnotherAccount}
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {rememberedAccounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.accountId;
                  const hasSavedPass = Boolean(acc.password);
                  return (
                    <div
                      key={acc.accountId}
                      onClick={() => handleSelectRememberedAccount(acc)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-50/90 dark:bg-sky-950/50 border-sky-400 dark:border-sky-600 shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-sky-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {acc.fullName}
                          </span>
                          {hasSavedPass && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-md shrink-0">
                              <KeyRound className="w-2.5 h-2.5" />
                              <span>{t.authSavedPasswordBadge}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5" dir="ltr">
                          {acc.displayIdentifier}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {hasSavedPass && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleForgetPassword(e, acc.accountId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title={t.authForgetPasswordTitle}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleQuickLoginAccount(acc);
                              }}
                              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-xl text-[11px] font-extrabold transition-colors cursor-pointer shadow-2xs"
                            >
                              {t.authQuickSignInBtn}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl p-3 text-xs font-semibold flex items-start gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t.authFullNameLabel} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User
                    className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                      isRTL ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t.authFullNamePlaceholder}
                    required
                    className={`w-full py-2.5 ${
                      isRTL ? 'pr-10 pl-3.5' : 'pl-10 pr-3.5'
                    } text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500 transition-all`}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t.authIdentifierLabel} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                {looksLikeEmail ? (
                  <Mail
                    className={`w-4 h-4 text-sky-600 absolute top-1/2 -translate-y-1/2 ${
                      isRTL ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                ) : (
                  <Phone
                    className={`w-4 h-4 text-teal-600 absolute top-1/2 -translate-y-1/2 ${
                      isRTL ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                )}
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={identifierInput}
                  onChange={(e) => {
                    setIdentifierInput(e.target.value);
                    setSelectedAccountId(null);
                  }}
                  placeholder={t.authIdentifierPlaceholder}
                  required
                  dir="ltr"
                  className={`w-full py-2.5 ${
                    isRTL ? 'pr-10 pl-3.5 text-left' : 'pl-10 pr-3.5 text-left'
                  } text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500 transition-all font-mono`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t.authPasswordLabel} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                    isRTL ? 'right-3.5' : 'left-3.5'
                  }`}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.authPasswordPlaceholder}
                  required
                  minLength={6}
                  dir="ltr"
                  className="w-full py-2.5 pl-10 pr-10 text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500 transition-all text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className={`p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute top-1/2 -translate-y-1/2 ${
                    isRTL ? 'left-2.5' : 'right-2.5'
                  } cursor-pointer`}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t.authConfirmPasswordLabel} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock
                    className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                      isRTL ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t.authConfirmPasswordPlaceholder}
                    required
                    minLength={6}
                    dir="ltr"
                    className="w-full py-2.5 pl-10 pr-10 text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500 transition-all text-left"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={rememberCredentials}
                onChange={(e) => setRememberCredentials(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-600 cursor-pointer shrink-0"
              />
              <span>{t.authRememberMeLabel}</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-700 hover:to-teal-700 disabled:opacity-60 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer mt-2"
            >
              {mode === 'register' ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>{t.authCreateAccountBtn}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{t.authSignInBtn}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{t.authIsolationBadge}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
