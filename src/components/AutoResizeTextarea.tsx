import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface AutoResizeTextareaProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  minRows?: number;
  icon?: React.ReactNode;
  hint?: string;
  badge?: string;
}

export const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  minRows = 2,
  icon,
  hint,
  badge,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isRTL } = useLanguage();

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      const newHeight = Math.max(el.scrollHeight, minRows * 24 + 18);
      el.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5 transition-all">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
          {icon && <span className="text-sky-600 dark:text-sky-400">{icon}</span>}
          <span>{label}</span>
          {required && <span className="text-rose-500 text-sm">*</span>}
        </label>
        {badge && (
          <span className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded border border-sky-100 dark:border-sky-800">
            {badge}
          </span>
        )}
      </div>

      <div className="relative group">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight();
          }}
          placeholder={placeholder || label}
          rows={minRows}
          className="w-full text-sm leading-relaxed px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all resize-none shadow-xs group-hover:border-slate-300 dark:group-hover:border-slate-700"
          dir={isRTL ? 'rtl' : 'ltr'}
        />
        {/* Subtle expand indicator icon at corner */}
        <div
          className={`absolute ${
            isRTL ? 'left-2.5' : 'right-2.5'
          } bottom-2 text-slate-300 dark:text-slate-600 pointer-events-none group-focus-within:text-sky-400 transition-colors`}
        >
          <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      {hint && <span className="text-[11px] text-slate-400 px-1">{hint}</span>}
    </div>
  );
};
