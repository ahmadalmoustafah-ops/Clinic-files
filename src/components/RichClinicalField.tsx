import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  hasRichContent,
  sanitizeClinicalHtml,
  toDisplayHtml,
} from '../utils/richTextUtils';

interface RichClinicalFieldProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minRows?: number;
  icon?: React.ReactNode;
  hint?: string;
  badge?: string;
  /** When true (e.g., previously saved patient file), non-empty fields start in Read Mode and switch to Edit Mode on tap. */
  readOnlyByDefault?: boolean;
  /** Permanently displays text in Bold Purple (used for Differential Diagnosis). */
  alwaysBoldPurple?: boolean;
  autoFocus?: boolean;
}

export const RichClinicalField: React.FC<RichClinicalFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  minRows = 2,
  icon,
  hint,
  badge,
  readOnlyByDefault = false,
  alwaysBoldPurple = false,
  autoFocus = false,
}) => {
  const { isRTL, language } = useLanguage();
  const isAr = language === 'ar';

  const hasContent = hasRichContent(value);
  const [isEditing, setIsEditing] = useState<boolean>(
    () => !readOnlyByDefault || !hasContent
  );
  const [hasSelection, setHasSelection] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const latestValueRef = useRef<string>(value);
  latestValueRef.current = value;

  // Keep DOM content synced into contentEditable only when entering edit mode
  // or when external value updates outside current focus.
  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    const expectedHtml = toDisplayHtml(value);
    const currentSanitized = sanitizeClinicalHtml(editorRef.current.innerHTML);
    if (
      document.activeElement !== editorRef.current &&
      currentSanitized !== expectedHtml
    ) {
      editorRef.current.innerHTML = expectedHtml;
    }
  }, [value, isEditing]);

  // Initialize innerHTML & focus right when switching into edit mode
  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    const html = toDisplayHtml(latestValueRef.current);
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
    if (autoFocus || readOnlyByDefault) {
      const el = editorRef.current;
      requestAnimationFrame(() => {
        el.focus();
        // Move caret cleanly to end of text
        try {
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch {}
      });
    }
  }, [isEditing]);

  // Track text selection inside this editor cleanly across desktop & Android touch
  const updateSelection = () => {
    if (!isEditing || !editorRef.current) {
      setHasSelection(false);
      return;
    }
    try {
      const sel = window.getSelection();
      if (
        sel &&
        sel.rangeCount > 0 &&
        !sel.isCollapsed &&
        sel.toString().trim().length > 0
      ) {
        const range = sel.getRangeAt(0);
        if (
          editorRef.current.contains(range.startContainer) &&
          editorRef.current.contains(range.endContainer)
        ) {
          savedRangeRef.current = range.cloneRange();
          setHasSelection(true);
          return;
        }
      }
    } catch {}
    setHasSelection(false);
  };

  useEffect(() => {
    if (!isEditing) {
      setHasSelection(false);
      savedRangeRef.current = null;
      return;
    }
    document.addEventListener('selectionchange', updateSelection);
    return () => {
      document.removeEventListener('selectionchange', updateSelection);
    };
  }, [isEditing]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const clean = sanitizeClinicalHtml(editorRef.current.innerHTML);
    if (!clean && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
    }
    onChange(clean);
  };

  const applySelectionColor = (colorHex: '#0284c7' | '#dc2626' | 'reset') => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      try {
        el.focus();
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } catch {}
    }

    if (colorHex === 'reset') {
      const defaultColor = alwaysBoldPurple ? '#7e22ce' : '#0f172a';
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, defaultColor);
      } catch {}
    } else {
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, colorHex);
      } catch {}
    }

    const clean = sanitizeClinicalHtml(el.innerHTML);
    onChange(clean);

    // Clear selection highlight gracefully after applying color
    try {
      const activeSel = window.getSelection();
      if (activeSel && activeSel.rangeCount > 0) {
        activeSel.collapseToEnd();
      }
    } catch {}
    savedRangeRef.current = null;
    setHasSelection(false);
  };

  const handlePastePlainText = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    try {
      document.execCommand('insertText', false, text);
    } catch {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
    }
    handleInput();
  };

  const handleContainerBlur = () => {
    window.setTimeout(() => {
      if (
        containerRef.current &&
        containerRef.current.contains(document.activeElement)
      ) {
        return;
      }
      setHasSelection(false);
      savedRangeRef.current = null;
      if (readOnlyByDefault && hasRichContent(latestValueRef.current)) {
        setIsEditing(false);
      }
    }, 120);
  };

  const minHeightPx = Math.max(58, minRows * 24 + 18);

  const textStyleClasses = alwaysBoldPurple
    ? 'font-bold text-purple-700 dark:text-purple-400'
    : 'text-slate-900 dark:text-white';

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-1.5 transition-all select-text"
    >
      {label && (
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
            {icon && <span className="text-sky-600 dark:text-sky-400">{icon}</span>}
            <span>{label}</span>
          </label>
          {badge && (
            <span className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded border border-sky-100 dark:border-sky-800">
              {badge}
            </span>
          )}
        </div>
      )}

      {/* Selection Color Toolbar (Floating pinned at top so Android native selection bar / keyboard never overlaps it) */}
      {isEditing && hasSelection && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 w-max max-w-[94vw] flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700 text-xs animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <span className="text-[11px] font-bold text-slate-300 hidden sm:inline">
            {isAr ? 'تلوين الكلمات:' : 'Color:'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySelectionColor('#0284c7')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-[11px] font-bold cursor-pointer active:scale-95 shadow-xs"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white ring-2 ring-sky-300" />
              <span>{isAr ? 'أزرق' : 'Blue'}</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySelectionColor('#dc2626')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[11px] font-bold cursor-pointer active:scale-95 shadow-xs"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white ring-2 ring-rose-300" />
              <span>{isAr ? 'أحمر' : 'Red'}</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySelectionColor('reset')}
              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-[11px] font-semibold cursor-pointer"
              title={isAr ? 'إزالة التلوين' : 'Reset color'}
            >
              {isAr ? 'عادي' : 'Reset'}
            </button>
          </div>
        </div>
      )}

      {/* Read Mode vs Edit Mode */}
      {!isEditing && hasContent ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsEditing(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsEditing(true);
            }
          }}
          style={{ minHeight: `${minHeightPx}px` }}
          className={`relative w-full text-sm leading-relaxed px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-700/80 rounded-xl cursor-pointer hover:border-sky-400 dark:hover:border-sky-600 hover:bg-sky-50/30 transition-all select-text ${textStyleClasses}`}
          dir={isRTL ? 'rtl' : 'ltr'}
          title={isAr ? 'اضغط للتعديل والكتابة' : 'Tap to edit'}
        >
          <div
            className="break-words whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: toDisplayHtml(value) }}
          />
          <span
            className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 opacity-80`}
          >
            <Pencil className="w-2.5 h-2.5" />
            <span>{isAr ? 'وضع القراءة · اضغط للتعديل' : 'Read mode · Tap to edit'}</span>
          </span>
        </div>
      ) : (
        <div className="relative group">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onMouseUp={updateSelection}
            onTouchEnd={() => setTimeout(updateSelection, 30)}
            onKeyUp={updateSelection}
            onPaste={handlePastePlainText}
            onBlur={handleContainerBlur}
            style={{ minHeight: `${minHeightPx}px` }}
            data-placeholder={placeholder || label || ''}
            className={`w-full text-sm leading-relaxed px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-xs select-text break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none ${textStyleClasses}`}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>
      )}

      {hint && <span className="text-[11px] text-slate-400 px-1">{hint}</span>}
    </div>
  );
};
