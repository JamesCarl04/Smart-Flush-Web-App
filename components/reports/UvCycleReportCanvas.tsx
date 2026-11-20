'use client';

import { useEffect, useMemo, useState } from 'react';
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
  AlertCircle,
  Calendar,
  Clock,
  FileX,
  ListChecks,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import {
  formatUvDuration,
  type UvCycleReportExportData,
  type UvCycleSeriesPoint,
  type UvDayGranularity,
} from '@/lib/uv-cycle-analytics';

const HYDRO_CYAN = '#0284C7';
const EMERALD = '#10B981';
const CRIMSON = '#EF4444';
const GRID_COLOR = 'rgba(148, 163, 184, 0.18)';

interface UvRangeApiResponse {
  success: boolean;
  error?: string;
  degraded?: boolean;
  data?: UvCycleReportExportData;
}

function ReportLineTooltip({
  active,
  payload,
  isExactSecond,
}: {
  active?: boolean;
  payload?: Array<{ payload?: UvCycleSeriesPoint }>;
  isExactSecond: boolean;
}) {
  const pt = payload?.[0]?.payload;
  if (!active || !pt) return null;

  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-1 border-b border-slate-100 pb-1 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {pt.tooltipTitle}
      </p>
      {isExactSecond ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Cycle #</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              #{pt.cumulativeCount ?? pt.count}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Duration</span>
            <span className="font-mono font-bold text-sky-700 dark:text-sky-400">
              {pt.eventDurationSeconds ?? pt.avgDurationSeconds}s
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Total Cycles</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              {pt.count.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Completed / Interrupted</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
              {pt.completed} / {pt.interrupted}
            </span>
          </div>
          {pt.count > 0 && (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Total Duration</span>
                <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                  {formatUvDuration(pt.totalDurationSeconds, {
                    includeRawSeconds: true,
                  })}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Avg Duration</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {pt.avgDurationSeconds.toFixed(1)}s
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export interface UvCycleReportCanvasProps {
  range: { from: string; to: string };
  granularity: UvDayGranularity;
  onGranularityChange: (g: UvDayGranularity) => void;
}

export function UvCycleReportCanvas({
  range,
  granularity,
  onGranularityChange,
}: UvCycleReportCanvasProps) {
  const { user } = useAuth();
  const [report, setReport] = useState<UvCycleReportExportData | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isSingleDay = range.from === range.to;
  const canQuery = Boolean(user) && range.from <= range.to;
  const requestKey = `${range.from}:${range.to}:${granularity}:${user?.uid ?? ''}`;
  const loading = canQuery && loadedKey !== requestKey;

  useEffect(() => {
    if (!canQuery || !user) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      granularity,
    });

    apiFetch<UvRangeApiResponse>(
      `/api/analytics/uv-cycles?${params.toString()}`,
      user,
      { cache: 'no-store' },
    )
      .then((res) => {
        if (cancelled) return;
        if (!res?.success || !res.data) {
          throw new Error(res?.error || 'Failed to load UV cycle report preview');
        }
        setReport(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load UV cycle report preview',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedKey(requestKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canQuery, granularity, range.from, range.to, requestKey, user]);

  const series = useMemo(() => report?.series ?? [], [report?.series]);
  const hasInterrupted = useMemo(
    () => series.some((pt) => pt.interrupted > 0),
    [series],
  );
  const isExactSecond = report?.bucketMode === 'second';

  const displayedLogs = useMemo(() => {
    const logs = [...(report?.logs ?? [])].reverse();
    const q = searchTerm.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.phtDate.toLowerCase().includes(q) ||
        l.phtTime.toLowerCase().includes(q) ||
        l.deviceId.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    );
  }, [report?.logs, searchTerm]);

  const summary = report?.summary;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* 4 Objective Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <KpiTile
          icon={<Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          label="UV Cycles in Range"
          value={
            summary ? summary.totalCycles.toLocaleString() : '--'
          }
          sublabel={
            summary
              ? `${summary.completedCycles} completed · ${summary.interruptedCycles} interrupted`
              : `${range.from} to ${range.to}`
          }
          loading={loading}
        />
        <KpiTile
          icon={<Timer className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          label="Total UV Duration"
          value={
            summary
              ? formatUvDuration(summary.totalDurationSeconds)
              : '--'
          }
          sublabel={
            summary && summary.avgDurationSeconds !== null
              ? `${summary.totalDurationSeconds.toFixed(0)}s total · Avg ${summary.avgDurationSeconds.toFixed(1)}s/cycle`
              : 'Measured from logs'
          }
          loading={loading}
        />
        <KpiTile
          icon={<Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
          label="Today / This Week"
          value={
            summary
              ? `${summary.todayCount} / ${summary.thisWeekCount}`
              : '--'
          }
          sublabel="Today vs Mon–Sun (PHT)"
          loading={loading}
        />
        <KpiTile
          icon={<Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          label="This Month / Year"
          value={
            summary
              ? `${summary.thisMonthCount} / ${summary.thisYearCount}`
              : '--'
          }
          sublabel="Cumulative PHT log counts"
          loading={loading}
        />
      </div>

      {/* Relative Effectivity Strip (Duration-based UV-C exposure ratio) */}
      {summary && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
          data-testid="uv-report-relative-effectivity"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Relative Effectivity:
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {typeof summary.relativeEffectivityPercent === 'number'
                ? `${summary.relativeEffectivityPercent.toFixed(1)}%`
                : summary.interruptedCycles === 0
                  ? 'N/A (0 interrupted cycles)'
                  : 'N/A (no completed baseline)'}
            </span>
            {typeof summary.completedAvgDurationSeconds === 'number' && (
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                Completed avg: {summary.completedAvgDurationSeconds.toFixed(1)}s
                {typeof summary.interruptedAvgDurationSeconds === 'number'
                  ? ` · Interrupted avg: ${summary.interruptedAvgDurationSeconds.toFixed(1)}s`
                  : ''}
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            Formula: (Interrupted Avg ÷ Completed Avg) × 100 · H = I × t
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Printable Line Graph Preview */}
      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 print:bg-slate-200 print:text-black">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                UV Sanitization Cycle Line Graph Preview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                Period: {range.from} to {range.to} · Resolution:{' '}
                <span className="font-mono font-semibold uppercase">
                  {report?.bucketMode ?? (isSingleDay ? granularity : 'day')}
                </span>{' '}
                · Philippine Time (UTC+8)
              </p>
            </div>
          </div>

          {isSingleDay && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800 print:hidden">
              {(
                [
                  { id: 'hour', label: 'By Hour' },
                  { id: 'minute', label: 'By Minute' },
                  { id: 'second', label: 'Exact (HH:mm:ss)' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onGranularityChange(item.id)}
                  className={`min-h-[32px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    granularity === item.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 print:p-3">
          {loading ? (
            <div className="h-[280px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
          ) : series.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <FileX className="mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No UV cycle logs recorded in this range
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try switching the date range to Today, This Week, This Month, or This Year.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={series}
                margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
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
                  content={<ReportLineTooltip isExactSecond={isExactSecond} />}
                />
                <Line
                  type={isExactSecond ? 'stepAfter' : 'monotone'}
                  dataKey="count"
                  name={isExactSecond ? 'Cumulative UV Cycles' : 'UV Cycles Logged'}
                  stroke={HYDRO_CYAN}
                  strokeWidth={2.5}
                  dot={{
                    r: series.length <= 36 ? 3.5 : 2,
                    fill: EMERALD,
                    stroke: HYDRO_CYAN,
                    strokeWidth: 1.5,
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
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Verified UV Cycle Logs Audit Table */}
      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:overflow-visible print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                Verified UV Cycle Logs ({report?.logs.length ?? 0})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                Exact timestamps down to the second (PHT, UTC+8) — included in PDF, CSV, and JSON exports
              </p>
            </div>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter HH:mm:ss, date, device..."
            aria-label="Filter UV cycle report logs"
            className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 print:hidden"
          />
        </div>

        {loading ? (
          <div className="space-y-2.5 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : displayedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <FileX className="mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No matching UV cycle log records
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] w-full overflow-auto print:max-h-none print:overflow-visible">
            <table
              className="w-full text-left text-xs print:border-collapse print:text-black"
              aria-label="Verified UV cycle logs"
            >
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-300 print:static print:border-b-2 print:border-slate-400 print:bg-slate-100 print:text-black">
                  <th scope="col" className="px-4 py-3">Date (PHT)</th>
                  <th scope="col" className="px-4 py-3">Exact Time (HH:mm:ss)</th>
                  <th scope="col" className="px-4 py-3">Duration</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Device</th>
                  <th scope="col" className="px-4 py-3">Log ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                {displayedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="break-inside-avoid hover:bg-slate-50/60 dark:hover:bg-slate-800/40 print:hover:bg-transparent"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                      {log.phtDate}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {log.phtTime}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold text-sky-700 dark:text-sky-400">
                      {log.duration}s
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {log.completed ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 print:text-black">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 print:hidden"
                            aria-hidden="true"
                          />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 print:text-black">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400 print:hidden"
                            aria-hidden="true"
                          />
                          Interrupted{log.reason ? ` (${log.reason})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                      {log.deviceId}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-slate-400"
                      title={log.id}
                    >
                      {log.id.length > 14 ? `${log.id.slice(0, 14)}…` : log.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sublabel,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col justify-between rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 print:border-slate-300 print:p-3 print:shadow-none">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 print:hidden">
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
        </div>
      ) : (
        <div>
          <p className="font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-slate-100 print:text-lg print:text-black">
            {value}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {sublabel}
          </p>
        </div>
      )}
    </div>
  );
}
