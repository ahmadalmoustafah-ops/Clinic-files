import React from 'react';

interface AndroidFrameProps {
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  // Exclusive Android Mobile UI (without simulated clock/battery status bar)
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-0 sm:p-4 select-none">
      {/* Android Device Container */}
      <div className="relative w-full sm:w-[430px] h-[100dvh] sm:h-[880px] max-h-[100dvh] bg-slate-950 sm:rounded-[44px] shadow-2xl sm:ring-12 sm:ring-slate-800 overflow-hidden flex flex-col border border-slate-800">
        {/* Screen Viewport with smooth scroll */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-50 dark:bg-slate-950">
          {children}
        </div>

        {/* Android Bottom Navigation Pill Gesture Bar */}
        <div className="h-4 bg-white/95 dark:bg-slate-900/95 shrink-0 flex items-center justify-center z-40 border-t border-slate-100 dark:border-slate-800">
          <div className="w-32 h-1 bg-slate-400 dark:bg-slate-600 rounded-full" />
        </div>
      </div>
    </div>
  );
};
