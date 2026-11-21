import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const rawMsg = error instanceof Error ? error.message : String(error || '');
    return {
      hasError: true,
      errorMessage: rawMsg,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  private getFriendlyMessage(): string {
    const raw = this.state.errorMessage;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission')) {
          return 'تعذر إتمام العملية السحابية بسبب صلاحيات الوصول. يرجى تسجيل الدخول بالحساب المخوّل وإعادة المحاولة.';
        }
        return parsed.error;
      }
    } catch {
      // Plain error string
    }
    return raw || 'حدث خطأ غير متوقع في التطبيق.';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <h2 className="text-base font-extrabold text-white">
              حدث عارض أثناء التشغيل
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.getFriendlyMessage()}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-extrabold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
