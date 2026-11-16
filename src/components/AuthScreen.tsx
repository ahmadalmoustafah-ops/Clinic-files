import React, { useState } from 'react';
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
} from 'lucide-react';
import { UserSession } from '../types';
import { AuthService, AuthErrorCode } from '../services/authService';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../context/LanguageContext';
import { OfflineBadge } from './OfflineIndicator';

interface AuthScreenProps {
  onAuthenticated: (session: UserSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const { t, isRTL, toggleLanguage } = useLanguage();
  const hasExistingAccounts = AuthService.getAccountsCount() > 0;

  const [mode, setMode] = useState<'login' | 'register'>(
    hasExistingAccounts ? 'login' : 'register'
  );
  const [fullName, setFullName] = useState('');
  const [identifierInput, setIdentifierInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      });

      if (!res.success || !res.session) {
        setErrorMsg(mapErrorCode(res.errorCode));
        return;
      }

      StorageService.setActiveUser(res.session.id);
      onAuthenticated(res.session);
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setErrorMsg(null);
    setPassword('');
    setConfirmPassword('');
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
                  onChange={(e) => setIdentifierInput(e.target.value)}
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
