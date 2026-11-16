import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { TrendingUp, PieChart as PieChartIcon, Calendar, Clock } from 'lucide-react';
import { PatientRecord } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  formatUsageDuration,
  formatYYYYMMDD,
  getActualAppUsageStart,
  getActualUsageDays,
  getPatientEffectiveDate,
} from '../utils/analyticsUtils';

interface ClinicAnalyticsProps {
  patients: PatientRecord[];
}

const AGE_COLORS = ['#0284c7', '#0d9488', '#f59e0b', '#8b5cf6', '#94a3b8'];

export const ClinicAnalytics: React.FC<ClinicAnalyticsProps> = ({ patients }) => {
  const { t, isRTL, language } = useLanguage();

  const usageStart = useMemo(() => getActualAppUsageStart(patients), [patients]);
  const usageDays = useMemo(() => getActualUsageDays(usageStart), [usageStart]);
  const usageDurationText = useMemo(
    () => formatUsageDuration(usageDays, t, language),
    [usageDays, t, language]
  );

  // 1. Real Patient Registrations across Actual Usage / Record Span
  const { trendData, isDailyMode } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (patients.length === 0) {
      return { trendData: [], isDailyMode: true };
    }

    let chartStart = new Date(usageStart.getFullYear(), usageStart.getMonth(), usageStart.getDate());
    patients.forEach((p) => {
      const pDate = getPatientEffectiveDate(p);
      if (pDate.getTime() < chartStart.getTime()) {
        chartStart = pDate;
      }
    });

    const sameMonth =
      chartStart.getFullYear() === today.getFullYear() &&
      chartStart.getMonth() === today.getMonth();

    if (sameMonth) {
      // Plot exact daily points from chartStart up to today
      const daysMap = new Map<string, number>();
      const points: { key: string; name: string; count: number }[] = [];

      const cursor = new Date(chartStart);
      while (cursor.getTime() <= today.getTime()) {
        const key = formatYYYYMMDD(cursor);
        const label = `${cursor.getDate()}/${cursor.getMonth() + 1}`;
        daysMap.set(key, 0);
        points.push({ key, name: label, count: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      patients.forEach((p) => {
        const pDate = getPatientEffectiveDate(p);
        const key = formatYYYYMMDD(pDate);
        if (daysMap.has(key)) {
          daysMap.set(key, (daysMap.get(key) || 0) + 1);
        }
      });

      return {
        trendData: points.map((pt) => ({ ...pt, count: daysMap.get(pt.key) || 0 })),
        isDailyMode: true,
      };
    }

    // Multiple months: build exact real calendar months from chartStart month through today's month
    const monthBuckets: { key: string; name: string; count: number }[] = [];
    const mCursor = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    while (mCursor.getTime() <= endMonth.getTime()) {
      const mIdx = mCursor.getMonth();
      const y = mCursor.getFullYear();
      const monthKey = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
      const monthName = `${t.months[mIdx] || ''}${y !== today.getFullYear() ? ` ${y}` : ''}`;
      monthBuckets.push({
        key: monthKey,
        name: monthName,
        count: 0,
      });
      mCursor.setMonth(mCursor.getMonth() + 1);
    }

    patients.forEach((p) => {
      const pDate = getPatientEffectiveDate(p);
      const pKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
      const match = monthBuckets.find((m) => m.key === pKey);
      if (match) {
        match.count += 1;
      }
    });

    return {
      trendData: monthBuckets,
      isDailyMode: false,
    };
  }, [patients, usageStart, t.months]);

  // 2. Exact Age Group Distribution (no mocked numbers)
  const { ageDistributionData, mostFrequentSummary } = useMemo(() => {
    if (patients.length === 0) {
      return {
        ageDistributionData: [] as { name: string; value: number; color: string }[],
        mostFrequentSummary: t.noAgeDataYet,
      };
    }

    let kids = 0; // 0 - 18
    let youth = 0; // 19 - 35
    let middle = 0; // 36 - 55
    let seniors = 0; // 56+
    let unspecified = 0;

    patients.forEach((p) => {
      const digits = p.age?.replace(/\D/g, '') || '';
      const ageNum = parseInt(digits, 10);
      if (digits && !isNaN(ageNum) && ageNum >= 0 && ageNum <= 130) {
        if (ageNum <= 18) kids++;
        else if (ageNum <= 35) youth++;
        else if (ageNum <= 55) middle++;
        else seniors++;
      } else {
        unspecified++;
      }
    });

    const buckets = [
      { name: t.ageKids, value: kids, color: AGE_COLORS[0], isKnown: true },
      { name: t.ageYouth, value: youth, color: AGE_COLORS[1], isKnown: true },
      { name: t.ageAdults, value: middle, color: AGE_COLORS[2], isKnown: true },
      { name: t.ageSeniors, value: seniors, color: AGE_COLORS[3], isKnown: true },
      { name: t.ageUnspecified, value: unspecified, color: AGE_COLORS[4], isKnown: false },
    ].filter((item) => item.value > 0);

    const knownBuckets = buckets.filter((b) => b.isKnown);
    const rankedPool = knownBuckets.length > 0 ? knownBuckets : buckets;
    const top = rankedPool.reduce(
      (best, cur) => (cur.value > best.value ? cur : best),
      rankedPool[0]
    );

    const pct = Math.round((top.value / patients.length) * 100);
    const summary = `${top.name} (${top.value} · ${pct}%)`;

    return {
      ageDistributionData: buckets.map(({ name, value, color }) => ({ name, value, color })),
      mostFrequentSummary: summary,
    };
  }, [patients, t.ageKids, t.ageYouth, t.ageAdults, t.ageSeniors, t.ageUnspecified, t.noAgeDataYet]);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sky-600" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            {t.clinicAnalyticsTitle}
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">{t.liveAnalysis}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chart 1: Actual Patient Registrations Over Real Usage Period */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {isDailyMode ? t.dailyPatientsTrend : t.newPatientsLast6Months}
              </h4>
            </div>
            <span className="text-[10px] text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300 px-2 py-0.5 rounded-full font-semibold shrink-0">
              {t.actualTotalBadge} {patients.length}
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center" dir="ltr">
            {trendData.length === 0 ? (
              <p className="text-xs text-slate-400 text-center px-4" dir={isRTL ? 'rtl' : 'ltr'}>
                {t.noPatientsForChart}
              </p>
            ) : trendData.length === 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div
                            className={`bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-slate-800 ${
                              isRTL ? 'text-right' : 'text-left'
                            }`}
                            dir={isRTL ? 'rtl' : 'ltr'}
                          >
                            <p className="font-bold text-sky-400 mb-1">{label}</p>
                            <p className="font-mono text-slate-200">
                              {t.patientsLabel}:{' '}
                              <span className="font-bold text-white">{payload[0].value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#0284c7" radius={[10, 10, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clinicPatientsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div
                            className={`bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-slate-800 ${
                              isRTL ? 'text-right' : 'text-left'
                            }`}
                            dir={isRTL ? 'rtl' : 'ltr'}
                          >
                            <p className="font-bold text-sky-400 mb-1">{label}</p>
                            <p className="font-mono text-slate-200">
                              {t.patientsLabel}:{' '}
                              <span className="font-bold text-white">{payload[0].value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#clinicPatientsGradient)"
                    dot={{ r: 3.5, fill: '#0284c7', strokeWidth: 1.5, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#0369a1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1 gap-2 flex-wrap">
            <span>
              {t.monthlyUpdate} <strong className="font-mono">{formatYYYYMMDD(usageStart)}</strong>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
              <Clock className="w-3 h-3" />
              {t.growthRate} {usageDurationText}
            </span>
          </div>
        </div>

        {/* Chart 2: Actual Age Demographics Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <PieChartIcon className="w-4 h-4 text-teal-600 shrink-0" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {t.ageDistributionTitle}
              </h4>
            </div>
            <span className="text-[10px] text-teal-700 bg-teal-50 dark:bg-teal-950 dark:text-teal-300 px-2 py-0.5 rounded-full font-semibold shrink-0">
              {t.clinicalDemographics} ({patients.length})
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center" dir="ltr">
            {ageDistributionData.length === 0 ? (
              <p className="text-xs text-slate-400 text-center px-4" dir={isRTL ? 'rtl' : 'ltr'}>
                {t.noAgeDataYet}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ageDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={ageDistributionData.length > 1 ? 4 : 0}
                    dataKey="value"
                  >
                    {ageDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        return (
                          <div
                            className={`bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-slate-800 ${
                              isRTL ? 'text-right' : 'text-left'
                            }`}
                            dir={isRTL ? 'rtl' : 'ltr'}
                          >
                            <p className="font-bold text-white mb-0.5">{data.name}</p>
                            <p className="text-slate-300 font-mono">
                              {t.patientsStat}:{' '}
                              <span className="font-bold text-teal-400">{data.value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 px-1 font-sans">
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1 gap-2 flex-wrap">
            <span>
              {t.mostVisitedGroup} <strong className="text-slate-700 dark:text-slate-200">{mostFrequentSummary}</strong>
            </span>
            <span>
              {t.recordsAnalyzed} <strong className="font-mono">{patients.length}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

