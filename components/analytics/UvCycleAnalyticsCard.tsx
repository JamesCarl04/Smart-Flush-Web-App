'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Sparkles,
  RefreshCw,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ListChecks,
  AlertTriangle,
  X,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUvCycleAnalytics } from '@/hooks/useUvCycleAnalytics';
import {
  formatMonthDayLabel,
  formatShortCalendarDate,
  formatUvDuration,
  toPhtIsoDate,
  type UvCycleSeriesPoint,
  type UvDayGranularity,
  type UvPeriod,
} from '@/lib/uv-cycle-analytics';

const HYDRO_CYAN = '#0284C7';
const EMERALD = '#10B981';
const CRIMSON = '#EF4444';
const GRID_COLOR = 'rgba(148, 163, 184, 0.16)';

function shiftIsoDate(isoDate: string, period: UvPeriod, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (period === 'day') {
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return dt.toISOString().slice(0, 10);
  }
  if (period === 'week') {
    const dt = new Date(Date.UTC(y, m - 1, d + delta * 7));
    return dt.toISOString().slice(0, 10);
  }
  if (period === 'month') {
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    return dt.toISOString().slice(0, 10);
  }
  const dt = new Date(Date.UTC(y + delta, m - 1, 1));
  return dt.toISOString().slice(0, 10);
}

interface UvTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: UvCycleSeriesPoint;
  }>;
  period: UvPeriod;
  granularity: UvDayGranularity;
}

function UvCycleLineTooltip({
  active,
  payload,
  period,
  granularity,
}: UvTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const isExactSecond = period === 'day' && granularity === 'second';

  return (
    <div className="min-w-[210px] max-w-[280px] rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
      <p className="mb-1.5 border-b border-slate-100 pb-1 text-[11px] font-semibold tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {point.tooltipTitle}
      </p>

      {isExactSecond ? (
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-400">
              Cumulative Cycle #
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              #{point.cumulativeCount ?? point.count}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-400">
              Logged Duration
            </span>
            <span className="font-mono font-bold tabular-nums text-sky-700 dark:text-sky-400">
              {point.eventDurationSeconds ?? point.avgDurationSeconds}s
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-400">Status</span>
            <span
              className={`font-semibold ${
                point.reason
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {point.reason ? `Interrupted (${point.reason})` : 'Completed'}
            </span>
          </div>
          {point.deviceId && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-400">Device</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {point.deviceId}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-600" />
              <span className="text-slate-600 dark:text-slate-300">
                Total Cycles
              </span>
            </div>
            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {point.count.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300">
                Completed
              </span>
            </div>
            <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {point.completed.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="text-slate-600 dark:text-slate-300">
                Interrupted
              </span>
            </div>
            <span className="font-mono font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {point.interrupted.toLocaleString()}
            </span>
          </div>

          {point.count > 0 && (
            <div className="space-y-1 border-t border-slate-100 pt-1 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  Total Duration
                </span>
                <span className="font-mono font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                  {formatUvDuration(point.totalDurationSeconds, {
                    includeRawSeconds: true,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  Avg Duration
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  {point.avgDurationSeconds.toFixed(1)}s
                </span>
              </div>
            </div>
          )}

          {point.exactTimes && point.exactTimes.length > 0 && (
            <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Logged Times (HH:mm:ss)
              </p>
              <p className="font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                {point.exactTimes.slice(0, 5).join(', ')}
                {point.count > 5 ? ` (+${point.count - 5} more)` : ''}
              </p>
            </div>
          )}

          {(period === 'week' ||
            period === 'month' ||
            period === 'year' ||
            (period === 'day' && granularity === 'hour' && point.count > 0)) && (
            <p className="pt-1 text-[10px] font-medium text-sky-600 dark:text-sky-400">
              Click point to inspect details
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface UvCycleAnalyticsCardProps {
  className?: string;
}

export function UvCycleAnalyticsCard({
  className = '',
}: UvCycleAnalyticsCardProps) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<UvPeriod>('day');
  const [anchorDate, setAnchorDate] = useState<string>(() => toPhtIsoDate());
  const [granularity, setGranularity] = useState<UvDayGranularity>('hour');
  const [hourFilter, setHourFilter] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [timeSearch, setTimeSearch] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    data,
    loading,
    refreshing,
    error,
    todayPht,
    refreshNow,
  } = useUvCycleAnalytics({
    period,
    anchorDate,
    granularity,
    hourFilter,
  });

  const series = useMemo(() => data?.series ?? [], [data?.series]);
  const hasInterrupted = useMemo(
    () => series.some((pt) => pt.interrupted > 0),
    [series],
  );
  const isExactSecond = period === 'day' && granularity === 'second';

  const filteredLogs = useMemo(() => {
    const logs = data?.logs ?? [];
    const q = timeSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        log.phtTime.toLowerCase().includes(q) ||
        log.phtDate.toLowerCase().includes(q) ||
        log.deviceId.toLowerCase().includes(q) ||
        log.id.toLowerCase().includes(q),
    );
  }, [data?.logs, timeSearch]);

  const handlePeriodChange = (nextPeriod: UvPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== 'day') {
      setHourFilter(null);
    }
  };

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) return;
    setAnchorDate(nextDate);
    setHourFilter(null);
  };

  const handleJumpToday = () => {
    setAnchorDate(todayPht);
    setHourFilter(null);
  };

  const exportFromDate = data?.meta.fromDate ?? anchorDate;
  const exportToDate = data?.meta.toDate ?? anchorDate;
  const reportsPageHref = `/reports?type=uv_cycles&from=${encodeURIComponent(exportFromDate)}&to=${encodeURIComponent(exportToDate)}&granularity=${encodeURIComponent(granularity)}`;

  const handleQuickExport = async (format: 'csv' | 'pdf') => {
    if (!user || typeof user.getIdToken !== 'function') {
      setExportError('Sign in to export UV cycle reports.');
      return;
    }
    setExportMenuOpen(false);
    setExportingFormat(format);
    setExportError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'uv_cycles',
          from: exportFromDate,
          to: exportToDate,
          format,
          ...(period === 'day' ? { granularity } : {}),
          ...(period === 'day' && hourFilter !== null ? { hour: hourFilter } : {}),
        }),
      });
      if (!res.ok) {
        let message = `Failed to export UV report (${res.status})`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody?.error) message = errBody.error;
        } catch {
          // keep fallback status message
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const disposition = res.headers.get('Content-Disposition');
      let filename = `smart-flush-uv-cycles-${exportFromDate}-${exportToDate}.${format}`;
      if (disposition && disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/"/g, '');
      }
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportError(
        err instanceof Error ? err.message : 'Failed to export UV cycle report',
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handleChartPointClick = (chartState: {
    activeTooltipIndex?: number | string | null;
  }) => {
    const rawIdx = chartState?.activeTooltipIndex;
    const idx = typeof rawIdx === 'number' ? rawIdx : Number(rawIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= series.length) return;
    const pt = series[idx];
    if (!pt) return;

    if (period === 'year' && pt.drillDate) {
      setAnchorDate(pt.drillDate);
      setPeriod('month');
      setHourFilter(null);
      return;
    }

    if ((period === 'month' || period === 'week') && pt.drillDate) {
      setAnchorDate(pt.drillDate);
      setPeriod('day');
      setGranularity('hour');
      setHourFilter(null);
      return;
    }

    if (
      period === 'day' &&
      granularity === 'hour' &&
      typeof pt.drillHour === 'number'
    ) {
      setHourFilter(pt.drillHour);
      setGranularity(pt.count > 0 ? 'second' : 'minute');
    }
  };

  const weekRangeSubtext = data?.meta
    ? `${formatMonthDayLabel(data.meta.weekFrom)} – ${formatMonthDayLabel(data.meta.weekTo)}`
    : 'Mon – Sun (PHT)';

  const summaryCards: Array<{
    id: UvPeriod;
    label: string;
    value: number | undefined;
    durationSeconds: number | undefined;
    subtext: string;
  }> = [
    {
      id: 'day',
      label: anchorDate === todayPht ? 'Today' : 'Selected Day',
      value: data?.totals.selectedDay,
      durationSeconds: data?.totals.selectedDayDurationSeconds,
      subtext: formatShortCalendarDate(anchorDate),
    },
    {
      id: 'week',
      label: anchorDate === todayPht ? 'This Week' : 'Selected Week',
      value: data?.totals.thisWeek,
      durationSeconds: data?.totals.thisWeekDurationSeconds,
      subtext: weekRangeSubtext,
    },
    {
      id: 'month',
      label: anchorDate === todayPht ? 'This Month' : 'Selected Month',
      value: data?.totals.thisMonth,
      durationSeconds: data?.totals.thisMonthDurationSeconds,
      subtext: data?.meta.monthLabel ?? anchorDate.slice(0, 7),
    },
    {
      id: 'year',
      label: anchorDate === todayPht ? 'This Year' : 'Selected Year',
      value: data?.totals.thisYear,
      durationSeconds: data?.totals.thisYearDurationSeconds,
      subtext: `Jan – Dec ${data?.meta.yearLabel ?? anchorDate.slice(0, 4)}`,
    },
  ];

  const hasAnyPlotData = series.length > 0;

  return (
    <section
      aria-label="UV Sanitization Cycle Activity"
      className={`rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-6 ${className}`}
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
              UV Sanitization Cycle Activity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified 5-second UV cycle counts from telemetry logs · Philippine Time (UTC+8)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshNow}
            disabled={refreshing}
            aria-label="Refresh UV cycle logs"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>

          {/* Export Shortcut Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={exportingFormat !== null}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-1 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {exportingFormat
                  ? `Exporting ${exportingFormat.toUpperCase()}...`
                  : 'Export'}
              </span>
              <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
            </button>

            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleQuickExport('pdf')}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Download PDF (Lab Report)</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleQuickExport('csv')}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Download CSV (Exact Logs)</span>
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <Link
                  href={reportsPageHref}
                  role="menuitem"
                  onClick={() => setExportMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in Reports Page</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4-Period Objective Summary Strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const isActive = period === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handlePeriodChange(card.id)}
              className={`flex min-h-[92px] flex-col items-start justify-between rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                isActive
                  ? 'border-sky-600 bg-white ring-1 ring-sky-600/15 dark:border-sky-500 dark:bg-slate-900 dark:ring-sky-500/20'
                  : 'border-slate-200/80 bg-slate-50/50 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
              }`}
            >
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  isActive
                    ? 'text-sky-700 dark:text-sky-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {card.label}
              </span>
              {loading && !data ? (
                <div className="my-1 h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <div className="my-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {typeof card.value === 'number'
                      ? card.value.toLocaleString()
                      : '--'}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    cycles
                  </span>
                </div>
              )}
              <div className="flex w-full items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{card.subtext}</span>
                {typeof card.durationSeconds === 'number' && (
                  <span
                    className="shrink-0 font-mono font-semibold tabular-nums text-slate-600 dark:text-slate-300"
                    title={`Total UV duration: ${card.durationSeconds.toFixed(0)}s`}
                  >
                    {formatUvDuration(card.durationSeconds)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Controls Bar (Fixed-height rows to eliminate layout shift across Day/Week/Month/Year) */}
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period Switcher */}
          <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {(
              [
                { id: 'day', label: 'Day' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'year', label: 'Year' },
              ] as const
            ).map((tab) => {
              const active = period === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handlePeriodChange(tab.id)}
                  className={`h-8 min-w-[60px] rounded-md px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Calendar Date Navigator (Fixed button cluster to prevent lateral jitter) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                handleDateChange(shiftIsoDate(anchorDate, period, -1))
              }
              aria-label={`Previous ${period}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <label className="relative inline-flex items-center">
              <span className="sr-only">Select anchor date</span>
              <Calendar
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="date"
                value={anchorDate}
                max={todayPht}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 font-mono text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <button
              type="button"
              onClick={() =>
                handleDateChange(shiftIsoDate(anchorDate, period, 1))
              }
              disabled={anchorDate >= todayPht}
              aria-label={`Next ${period}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleJumpToday}
              disabled={anchorDate === todayPht}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-default disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Today
            </button>
          </div>
        </div>

        {/* Sub-Toolbar: Locked height across Day / Week / Month / Year so chart never jumps */}
        <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
          {period === 'day' ? (
            <div className="flex min-h-[34px] flex-wrap items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                {(
                  [
                    { id: 'hour', label: 'Hourly' },
                    { id: 'minute', label: 'Minute' },
                    { id: 'second', label: 'Exact (HH:mm:ss)' },
                  ] as const
                ).map((g) => {
                  const active = granularity === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGranularity(g.id)}
                      className={`h-7 rounded-md px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>

              {/* Hour Filter Selector */}
              <label className="inline-flex items-center text-xs">
                <span className="sr-only">Filter by hour</span>
                <select
                  value={hourFilter === null ? '' : String(hourFilter)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHourFilter(val === '' ? null : Number(val));
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">All hours</option>
                  {Array.from({ length: 24 }, (_, h) => {
                    const hh = String(h).padStart(2, '0');
                    return (
                      <option key={h} value={String(h)}>
                        {hh}:00–{hh}:59
                      </option>
                    );
                  })}
                </select>
              </label>

              {hourFilter !== null && (
                <button
                  type="button"
                  onClick={() => setHourFilter(null)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span>{String(hourFilter).padStart(2, '0')}:00</span>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-h-[34px] items-center text-xs text-slate-500 dark:text-slate-400">
              Click any point to drill down into{' '}
              {period === 'year'
                ? 'that month'
                : 'hourly, minute, and exact second logs'}
              .
            </div>
          )}

          {/* Clean Inline Telemetry Summary */}
          <div className="flex min-h-[34px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              Total Duration:{' '}
              {formatUvDuration(data?.totals.totalDurationSeconds, {
                includeRawSeconds: true,
              })}
            </span>
            <span className="hidden h-3.5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" aria-hidden="true" />
            <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              Avg Duration:{' '}
              {typeof data?.totals.avgDurationSeconds === 'number'
                ? `${data.totals.avgDurationSeconds.toFixed(1)}s`
                : '--'}
            </span>
            <span className="hidden h-3.5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" aria-hidden="true" />
            <span
              className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200"
              title="Duration-based relative UV-C exposure for interrupted cycles: (Interrupted Avg ÷ Completed Avg) × 100, assuming constant UV-C irradiance (H = I × t)."
              data-testid="uv-relative-effectivity"
            >
              Relative Effectivity:{' '}
              {typeof data?.totals.relativeEffectivityPercent === 'number'
                ? `${data.totals.relativeEffectivityPercent.toFixed(1)}% (${(data.totals.interruptedAvgDurationSeconds ?? 0).toFixed(1)}s / ${(data.totals.completedAvgDurationSeconds ?? 0).toFixed(1)}s)`
                : (data?.totals.periodInterrupted ?? 0) === 0
                  ? 'N/A (0 interrupted)'
                  : 'N/A (no completed avg)'}
            </span>
            <span className="hidden h-3.5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Completed: {data?.totals.periodCompleted ?? 0}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
              <span>Interrupted: {data?.totals.periodInterrupted ?? 0}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Error State */}
      {(error || exportError) && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{exportError || error}</span>
          </div>
          {exportError && (
            <button
              type="button"
              onClick={() => setExportError(null)}
              className="rounded px-2 py-0.5 text-[11px] font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/50"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Main Recharts Line Graph (Fixed 300px height + fixed YAxis width to prevent layout jump) */}
      {loading && !data ? (
        <div className="flex h-[300px] w-full flex-col justify-end gap-3 rounded-xl bg-slate-100/50 p-6 dark:bg-slate-800/30">
          <div className="h-full w-full animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/40" />
        </div>
      ) : !hasAnyPlotData ? (
        <div className="flex h-[300px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No UV Cycles Logged
          </p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            No UV sanitization cycle events were recorded for this{' '}
            {period === 'day' && hourFilter !== null
              ? `hour (${String(hourFilter).padStart(2, '0')}:00–${String(hourFilter).padStart(2, '0')}:59)`
              : period}
            .
          </p>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={series}
              margin={{ top: 14, right: 16, left: 0, bottom: 4 }}
              onClick={handleChartPointClick}
            >
              <CartesianGrid
                stroke={GRID_COLOR}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                width={36}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip
                content={
                  <UvCycleLineTooltip
                    period={period}
                    granularity={granularity}
                  />
                }
              />
              <Line
                type={isExactSecond ? 'stepAfter' : 'monotone'}
                dataKey="count"
                name={
                  isExactSecond
                    ? 'Cumulative UV Cycles'
                    : 'UV Cycles Logged'
                }
                stroke={HYDRO_CYAN}
                strokeWidth={2.5}
                dot={{
                  r: isExactSecond || series.length <= 31 ? 3.5 : 2,
                  fill: EMERALD,
                  stroke: HYDRO_CYAN,
                  strokeWidth: 1.5,
                }}
                activeDot={{
                  r: 6,
                  fill: HYDRO_CYAN,
                  stroke: '#ffffff',
                  strokeWidth: 2,
                  cursor: 'pointer',
                }}
                isAnimationActive={false}
              />
              {hasInterrupted && !isExactSecond && (
                <Line
                  type="monotone"
                  dataKey="interrupted"
                  name="Interrupted Cycles"
                  stroke={CRIMSON}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: CRIMSON }}
                  activeDot={{
                    r: 5,
                    fill: CRIMSON,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Consistent Chart Legend Footer (Always rendered so total card height never jumps) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded bg-sky-600" />
            <span>
              {isExactSecond
                ? 'Cumulative UV Cycles (plotted at exact HH:mm:ss)'
                : 'UV Cycles Logged (real log count)'}
            </span>
          </div>
          {hasInterrupted && !isExactSecond && (
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-rose-500" />
              <span>Interrupted Cycles</span>
            </div>
          )}
        </div>
      </div>

      {/* Verified Raw UV Cycle Logs Drawer/Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-2.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowLogs((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-slate-200 dark:hover:text-sky-400"
          >
            <ListChecks className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>Verified UV Cycle Logs</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {data?.totalLogsInScope ?? 0}
            </span>
            {showLogs ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>

          {showLogs && (
            <input
              type="search"
              value={timeSearch}
              onChange={(e) => setTimeSearch(e.target.value)}
              placeholder="Filter HH:mm:ss, date, or ID..."
              aria-label="Filter UV cycle logs by timestamp, date, or ID"
              className="h-8 w-52 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          )}
        </div>

        {showLogs && (
          <div className="max-h-[260px] overflow-auto">
            {filteredLogs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No matching UV cycle log entries for this selection.
              </p>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100/95 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur-xs dark:bg-slate-900/95 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Date (PHT)</th>
                    <th className="px-4 py-2">Exact Time (HH:mm:ss)</th>
                    <th className="px-4 py-2">Duration</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Device</th>
                    <th className="px-4 py-2">Log ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-white/80 dark:hover:bg-slate-900/60"
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-700 dark:text-slate-300">
                        {log.phtDate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {log.phtTime}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-sky-700 dark:text-sky-400">
                        {log.duration}s
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {log.completed ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                              aria-hidden="true"
                            />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400"
                              aria-hidden="true"
                            />
                            Interrupted{log.reason ? ` (${log.reason})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {log.deviceId}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-slate-400"
                        title={log.id}
                      >
                        {log.id.length > 12 ? `${log.id.slice(0, 12)}…` : log.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
