import React, { useState, useEffect } from 'react';
import { Wifi, BatteryMedium, Signal } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface AndroidFrameProps {
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  const [time, setTime] = useState('');
  const { language } = useLanguage();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, [language]);

  // Exclusive Android Mobile UI
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-0 sm:p-4 select-none">
      {/* Android Device Mockup Container */}
      <div className="relative w-full sm:w-[430px] h-[100dvh] sm:h-[880px] max-h-[100dvh] bg-slate-950 sm:rounded-[44px] shadow-2xl sm:ring-12 sm:ring-slate-800 overflow-hidden flex flex-col border border-slate-800">
        {/* Android Punch Hole Camera */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black z-50 pointer-events-none ring-1 ring-slate-800 hidden sm:block" />

        {/* Android Status Bar */}
        <div className="h-7 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-5 flex items-center justify-between text-[11px] font-mono text-slate-700 dark:text-slate-300 z-40 shrink-0 border-b border-slate-100 dark:border-slate-800 select-none">
          <span className="font-bold">{time || '10:45'}</span>
          <div className="flex items-center gap-2">
            <Signal className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <Wifi className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <div className="flex items-center gap-1">
              <span className="text-[10px]">98%</span>
              <BatteryMedium className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
        </div>

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
