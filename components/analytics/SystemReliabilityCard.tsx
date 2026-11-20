'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { BarChart3, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import type { UptimeLogDay, UptimeSummary } from '@/hooks/useAnalytics';
import { formatShortCalendarDate } from '@/lib/uv-cycle-analytics';

const HYDRO_CYAN = '#0284C7';
const CRIMSON = '#EF4444';
const GRID_COLOR = 'rgba(148, 163, 184, 0.16)';

export function formatUptimeDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '0m';
  }
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getStatusMeta(status: UptimeLogDay['status']): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  if (status === 'tracked') {
    return {
      label: 'Tracked SLA',
      dotClass: 'bg-emerald-500 dark:bg-emerald-400',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (status === 'active_only') {
    return {
      label: 'Activity Logged',
      dotClass: 'bg-sky-500 dark:bg-sky-400',
      textClass: 'text-sky-700 dark:text-sky-400',
    };
  }
  return {
    label: 'Not Monitored',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    textClass: 'text-slate-500 dark:text-slate-400',
  };
}

function UptimeLineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: UptimeLogDay }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const meta = getStatusMeta(row.status);

  return (
    <div className="min-w-[205px] rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
      <p className="mb-1.5 border-b border-slate-100 pb-1 text-[11px] font-semibold tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {formatShortCalendarDate(row.date)}
      </p>

      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Status</span>
          <span className={`inline-flex items-center gap-1.5 font-semibold ${meta.textClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
            {meta.label}
          </span>
        </div>

        {row.status === 'tracked' ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Availability</span>
              <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {row.uptimePercent?.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Online</span>
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatUptimeDuration(row.onlineMinutes)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Downtime</span>
              <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                {formatUptimeDuration(row.offlineMinutes)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Tracked</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {formatUptimeDuration(row.totalMinutes)}
              </span>
            </div>
          </>
        ) : row.status === 'active_only' ? (
          <p className="pt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Telemetry events recorded on this day; minute-level SLA logs were unavailable.
          </p>
        ) : (
          <p className="pt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            No monitoring session recorded (unit powered off or idle). Excluded from outage rate.
          </p>
        )}
      </div>
    </div>
  );
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: UptimeLogDay;
}

function UptimeStatusDot({ cx, cy, payload }: CustomDotProps) {
  if (
    typeof cx !== 'number' ||
    typeof cy !== 'number' ||
    !payload ||
    payload.uptimePercent === null
  ) {
    return null;
  }

  if (payload.status === 'active_only') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#ffffff"
        stroke={HYDRO_CYAN}
        strokeWidth={2}
      />
    );
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={HYDRO_CYAN}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}

export function SystemReliabilityCard({
  logs,
  summary,
  liveSnapshotUptime,
  loading,
  className = '',
}: {
  logs: UptimeLogDay[];
  summary?: UptimeSummary;
  liveSnapshotUptime?: number;
  loading: boolean;
  className?: string;
}) {
  const [showLogTable, setShowLogTable] = useState(false);

  const hasTrackedMinutes = (summary?.totalTrackedMinutes ?? 0) > 0;
  const windowDays = summary?.windowDays ?? logs.length;
  const activeDays =
    summary?.activeTelemetryDays ??
    logs.filter((r) => r.status !== 'unmonitored').length;
  const monitoredDays = summary?.monitoredDays ?? 0;
  const unmonitoredDays =
    summary?.unmonitoredDays ?? Math.max(0, windowDays - activeDays);
  const isLiveOnline = (liveSnapshotUptime ?? 0) > 0;
  const hasAnyPlotPoints = logs.some((r) => r.uptimePercent !== null);

  const activeDayLabels = logs
    .filter((r) => r.status !== 'unmonitored')
    .map((r) => r.label);
  const activeSpanLabel =
    activeDayLabels.length === 1
      ? activeDayLabels[0]
      : activeDayLabels.length > 1
        ? `${activeDayLabels[0]}–${activeDayLabels[activeDayLabels.length - 1]}`
        : null;

  const interpretationText = hasTrackedMinutes
    ? `Hardware maintained ${(summary?.trackedAvailabilityPercent ?? 0).toFixed(1)}% availability across ${monitoredDays} monitored ${monitoredDays === 1 ? 'day' : 'days'} (${formatUptimeDuration(summary?.totalOnlineMinutes ?? 0)} online, ${formatUptimeDuration(summary?.totalOfflineMinutes ?? 0)} offline)${
        unmonitoredDays > 0
          ? `. ${unmonitoredDays} ${unmonitoredDays === 1 ? 'day had' : 'days had'} no monitoring session and ${unmonitoredDays === 1 ? 'is' : 'are'} excluded from downtime.`
          : '.'
      }`
    : activeDays > 0
      ? `Hardware recorded live telemetry on ${activeDays} of ${windowDays} ${windowDays === 1 ? 'day' : 'days'}${activeSpanLabel ? ` (${activeSpanLabel})` : ''}. Minute-level SLA logs were unavailable for this window; the ${unmonitoredDays} unmonitored ${unmonitoredDays === 1 ? 'day is' : 'days are'} shown as gaps rather than 0% outages.`
      : 'No monitoring or telemetry sessions were recorded in this timeframe. Availability metrics will populate automatically once the unit reports heartbeats.';

  return (
    <div
      className={`flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-6 ${className}`}
      data-testid="system-reliability-card"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
              System Uptime &amp; Availability
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hasTrackedMinutes
                ? 'Minute-level online availability against 99.5% SLA target'
                : 'Daily telemetry availability log (unmonitored days excluded from outage rate)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              isLiveOnline
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : 'bg-slate-400 dark:bg-slate-500'
            }`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Live:
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {isLiveOnline
              ? `Online (${(liveSnapshotUptime ?? 100).toFixed(0)}%)`
              : 'Offline'}
          </span>
        </div>
      </div>

      {/* 4-Metric Summary Strip */}
      <dl className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {hasTrackedMinutes ? 'Tracked Availability' : 'Active Days'}
          </dt>
          <dd className="mt-1 truncate font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {hasTrackedMinutes
              ? `${(summary?.trackedAvailabilityPercent ?? 0).toFixed(1)}%`
              : `${activeDays} / ${windowDays} days`}
          </dd>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {hasTrackedMinutes ? 'Target: 99.5% SLA' : 'Telemetry observed'}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Total Online Time
          </dt>
          <dd className="mt-1 truncate font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {hasTrackedMinutes
              ? formatUptimeDuration(summary?.totalOnlineMinutes ?? 0)
              : '--'}
          </dd>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {hasTrackedMinutes
              ? `of ${formatUptimeDuration(summary?.totalTrackedMinutes ?? 0)} tracked`
              : 'Awaiting minute logs'}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Recorded Downtime
          </dt>
          <dd className="mt-1 truncate font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {hasTrackedMinutes
              ? formatUptimeDuration(summary?.totalOfflineMinutes ?? 0)
              : '--'}
          </dd>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {hasTrackedMinutes ? 'During monitored windows' : 'No outages logged'}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Monitored Coverage
          </dt>
          <dd className="mt-1 truncate font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {hasTrackedMinutes
              ? `${monitoredDays} / ${windowDays} days`
              : `${activeDays} / ${windowDays} days`}
          </dd>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {unmonitoredDays} unmonitored
          </p>
        </div>
      </dl>

      {/* Line Graph */}
      {loading && logs.length === 0 ? (
        <div className="h-[260px] w-full animate-pulse rounded-xl bg-slate-100/70 dark:bg-slate-800/40" />
      ) : !hasAnyPlotPoints ? (
        <div className="flex h-[240px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No Reliability Sessions Recorded
          </p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Daily uptime line data will appear once the restroom controller logs heartbeats or telemetry in this timeframe.
          </p>
        </div>
      ) : (
        <div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={logs}
              margin={{ top: 14, right: 16, left: -8, bottom: 0 }}
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
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                width={38}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip content={<UptimeLineTooltip />} />
              <ReferenceLine
                y={99.5}
                stroke={CRIMSON}
                strokeDasharray="4 4"
                label={{
                  position: 'insideTopLeft',
                  value: 'SLA Target (99.5%)',
                  fill: CRIMSON,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <Line
                type="monotone"
                dataKey="uptimePercent"
                name="Availability"
                stroke={HYDRO_CYAN}
                strokeWidth={2.5}
                connectNulls={false}
                dot={<UptimeStatusDot />}
                activeDot={{
                  r: 5.5,
                  fill: HYDRO_CYAN,
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-5 border-t border-slate-100 pt-2.5 text-xs text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-600" />
              Tracked SLA Availability
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-2 border-sky-600 bg-white dark:bg-slate-900" />
              Activity Logged (No Minute Logs)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-rose-500" />
              SLA Target (99.5%)
            </span>
          </div>
        </div>
      )}

      {/* Reliability Interpretation Box */}
      <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          Reliability Summary:{' '}
        </span>
        {interpretationText}
      </div>

      {/* Collapsible Daily Uptime Log Table */}
      {logs.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => setShowLogTable((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 transition hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-slate-300 dark:hover:text-sky-400"
          >
            <ListChecks className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span>
              {showLogTable ? 'Hide' : 'Show'} Daily Uptime Log ({logs.length}{' '}
              {logs.length === 1 ? 'day' : 'days'})
            </span>
            {showLogTable ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {showLogTable && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="px-3.5 py-2.5">Date (PHT)</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Online</th>
                    <th className="px-3.5 py-2.5 text-right">Downtime</th>
                    <th className="px-3.5 py-2.5 text-right">Tracked</th>
                    <th className="px-3.5 py-2.5 text-right">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800/70 dark:bg-slate-900/40">
                  {[...logs].reverse().map((row) => {
                    const meta = getStatusMeta(row.status);
                    return (
                      <tr
                        key={row.date}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-3.5 py-2.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {row.date}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${meta.textClass}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                              aria-hidden="true"
                            />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.status === 'tracked'
                            ? formatUptimeDuration(row.onlineMinutes)
                            : '--'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.status === 'tracked'
                            ? formatUptimeDuration(row.offlineMinutes)
                            : '--'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {row.status === 'tracked'
                            ? formatUptimeDuration(row.totalMinutes)
                            : '--'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {row.status === 'tracked' && row.uptimePercent !== null
                            ? `${row.uptimePercent.toFixed(1)}%`
                            : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
