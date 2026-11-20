'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAnalytics, DateRange } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { isValidIsoDate } from '@/lib/date-utils';
import { phtDateRangeToUtcMs, toPhtIsoDate } from '@/lib/uv-cycle-analytics';
import { UvCycleAnalyticsCard } from '@/components/analytics/UvCycleAnalyticsCard';
import {
  SystemReliabilityCard,
  formatUptimeDuration,
} from '@/components/analytics/SystemReliabilityCard';
import type {
  ComponentRulPrediction,
  PredictiveHealthStatus,
  PredictiveMaintenanceSummary,
  SensorDriftIndicator,
  UsageForecastInterpretation,
} from '@/types';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  Droplets,
  Calendar,
  Clock,
  ShieldCheck,
  BarChart3,
  Waves,
  AlertCircle,
  Wrench,
  TrendingUp,
  AlertTriangle,
  Cpu,
  CheckCircle2,
  Send,
  Gauge,
} from 'lucide-react';

const HYDRO_CYAN = '#0284C7';
const TEAL_CYAN = '#06B6D4';
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    name?: string;
    dataKey?: string;
    color?: string;
  }>;
  label?: string | number;
  unit?: string;
  valueFormatter?: (val: number) => string;
}

function ModernTooltip({
  active,
  payload,
  label,
  unit = '',
  valueFormatter,
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const rawVal = payload[0]?.value;
  const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
  const formattedVal = valueFormatter
    ? valueFormatter(Number.isFinite(numVal) ? numVal : 0)
    : `${(Number.isFinite(numVal) ? numVal : 0).toLocaleString()}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="min-w-[130px] rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
      {label !== undefined && (
        <p className="mb-1 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {String(label)}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: payload[0]?.color ?? HYDRO_CYAN }}
          />
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {payload[0]?.name || 'Value'}
          </span>
        </div>
        <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {formattedVal}
        </span>
      </div>
    </div>
  );
}

type AnalyticsPresetKey = 'today' | '7d' | '30d' | '90d' | 'ytd';

function buildPhtPresetRange(preset: AnalyticsPresetKey): DateRange {
  const todayIso = toPhtIsoDate();
  const todayStartMs = Date.parse(`${todayIso}T00:00:00.000+08:00`);
  let fromIso: string;
  if (preset === 'ytd') {
    fromIso = `${todayIso.slice(0, 4)}-01-01`;
  } else {
    const daysBack =
      preset === 'today' ? 0 : preset === '7d' ? 6 : preset === '30d' ? 29 : 89;
    fromIso = toPhtIsoDate(todayStartMs - daysBack * 86_400_000);
  }
  const { startMs, endMs } = phtDateRangeToUtcMs(fromIso, todayIso);
  return {
    from: new Date(startMs),
    to: new Date(endMs),
  };
}

function resolveInitialDateSelection(
  searchParams: ReturnType<typeof useSearchParams>,
): { range: DateRange; preset: AnalyticsPresetKey | null } {
  const fromParam = searchParams.get('from')?.slice(0, 10) ?? '';
  const toParam = (searchParams.get('to') ?? fromParam).slice(0, 10);

  if (
    isValidIsoDate(fromParam) &&
    isValidIsoDate(toParam) &&
    fromParam <= toParam
  ) {
    const { startMs, endMs } = phtDateRangeToUtcMs(fromParam, toParam);
    const todayIso = toPhtIsoDate();
    let preset: AnalyticsPresetKey | null = null;
    if (toParam === todayIso) {
      const spanDays = Math.round(
        (Date.parse(`${toParam}T00:00:00.000Z`) -
          Date.parse(`${fromParam}T00:00:00.000Z`)) /
          86_400_000,
      );
      if (spanDays === 0) {
        preset = 'today';
      } else if (spanDays === 6) {
        preset = '7d';
      } else if (spanDays === 29) {
        preset = '30d';
      } else if (spanDays === 89) {
        preset = '90d';
      } else if (fromParam === `${todayIso.slice(0, 4)}-01-01`) {
        preset = 'ytd';
      }
    }
    return {
      range: { from: new Date(startMs), to: new Date(endMs) },
      preset,
    };
  }

  return {
    range: buildPhtPresetRange('7d'),
    preset: '7d',
  };
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl p-4 md:p-8">
          <div className="h-9 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      }
    >
      <AnalyticsPageContent />
    </Suspense>
  );
}

function AnalyticsPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [initialSelection] = useState(() =>
    resolveInitialDateSelection(searchParams),
  );
  const [dateRange, setDateRange] = useState<DateRange>(initialSelection.range);
  const [activePreset, setActivePreset] = useState<AnalyticsPresetKey | null>(
    initialSelection.preset,
  );
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchFeedback, setDispatchFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const { data, loading, error } = useAnalytics(dateRange);

  const handleDispatchProactiveTask = async (
    targetDeviceId: string,
    message: string,
    keyId: string,
    triggerType: 'maintenance' | 'sensor_fault' = 'maintenance',
  ) => {
    if (!user) return;
    setDispatchingId(keyId);
    setDispatchFeedback(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: {
          taskId?: string;
          status?: string;
          assignedTo?: string | null;
          assignedToName?: string | null;
        };
      }>('/api/tasks', user, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: targetDeviceId,
          triggerType,
          message,
          isBroadcast: false,
          autoAssign: true,
        }),
      });
      const assignedName = res?.data?.assignedToName;
      setDispatchFeedback({
        type: 'success',
        text: assignedName
          ? `Maintenance task assigned to ${assignedName} (${targetDeviceId}).`
          : `All maintenance staff are currently busy; task queued as unassigned (${targetDeviceId}).`,
      });
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Failed to schedule maintenance task';
      setDispatchFeedback({ type: 'error', text: errMsg });
    } finally {
      setDispatchingId(null);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('from', toPhtIsoDate(dateRange.from.getTime()));
    url.searchParams.set('to', toPhtIsoDate(dateRange.to.getTime()));
    window.history.replaceState({}, '', url.toString());
  }, [dateRange]);

  const setPresetRange = (preset: AnalyticsPresetKey) => {
    setActivePreset(preset);
    setDateRange(buildPhtPresetRange(preset));
  };

  const totalFlushes = data?.summary.totalFlushes;
  const totalWater = data?.summary.totalWater;
  const uvTotal = data?.summary.uvTotal;
  const avgFlushesPerWindowDay =
    data?.summary.avgFlushesPerWindowDay ?? data?.summary.avgFlushesPerDay;
  const avgFlushesPerActiveDay = data?.summary.avgFlushesPerDay;
  const windowDays = data?.summary.windowDays;
  const activeDays = data?.summary.activeDays;
  const systemUptime = data?.summary.systemUptime;
  const uptimeSummary = data?.summary.uptimeSummary;
  const hasTrackedUptime = (uptimeSummary?.totalTrackedMinutes ?? 0) > 0;

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl p-4 md:p-8">
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-5 text-rose-800 backdrop-blur-md dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <h3 className="text-sm font-semibold">Failed to load analytics data</h3>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl animate-fade-in p-4 md:p-8">
      {/* Header & Segmented Pill Control */}
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Restroom Analytics
          </h1>
          <span className="sr-only">
            Flush counts, water usage trends, and cleaning performance
          </span>
        </div>

        {/* Timeframe Segmented Pill Control */}
        <div className="inline-flex flex-wrap items-center rounded-xl border border-slate-200/80 bg-slate-100 p-1 shadow-inner dark:border-slate-800/80 dark:bg-slate-800/80">
          {[
            { label: 'Today', key: 'today' as const },
            { label: '7 Days', key: '7d' as const },
            { label: '30 Days', key: '30d' as const },
            { label: '90 Days', key: '90d' as const },
            { label: 'This Year', key: 'ytd' as const },
          ].map((preset) => {
            const isActive = activePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPresetRange(preset.key)}
                className={`tactile-btn relative min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 ${
                  isActive
                    ? 'border border-slate-200/80 bg-white font-bold text-slate-900 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary KPI Ribbon (5 Clean Metric Cards) */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          title="Total Flushes"
          icon={<Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          iconBg="bg-sky-500/10 dark:bg-sky-500/15"
          value={
            typeof totalFlushes === 'number'
              ? totalFlushes.toLocaleString()
              : '--'
          }
          subtext="Completed flushes"
          loading={loading}
        />
        <StatCard
          title="Water Used"
          icon={<Droplets className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
          iconBg="bg-cyan-500/10 dark:bg-cyan-500/15"
          value={
            typeof totalWater === 'number'
              ? totalWater.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              : '--'
          }
          unit="L"
          subtext="Total consumed"
          loading={loading}
        />
        <StatCard
          title="UV Cycles Logged"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          value={typeof uvTotal === 'number' ? uvTotal.toLocaleString() : '--'}
          subtext={
            typeof data?.summary.uvCompleted === 'number'
              ? `${data.summary.uvCompleted.toLocaleString()} completed`
              : 'Logged sanitization cycles'
          }
          secondarySubtext={
            typeof data?.summary.uvCompleted === 'number'
              ? `${(data.summary.uvFailed ?? 0).toLocaleString()} interrupted`
              : undefined
          }
          loading={loading}
        />
        <StatCard
          title="Avg Flushes/Day"
          icon={<Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-500/10 dark:bg-indigo-500/15"
          value={
            typeof avgFlushesPerWindowDay === 'number'
              ? avgFlushesPerWindowDay.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              : '--'
          }
          subtext={
            typeof windowDays === 'number'
              ? `${windowDays}-day average`
              : 'Daily average'
          }
          secondarySubtext={
            typeof windowDays === 'number' &&
            typeof activeDays === 'number' &&
            activeDays > 0 &&
            activeDays < windowDays &&
            typeof avgFlushesPerActiveDay === 'number'
              ? `${avgFlushesPerActiveDay.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}/active day (${activeDays}d)`
              : undefined
          }
          loading={loading}
        />
        <StatCard
          title="System Reliability"
          icon={<Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
          iconBg="bg-teal-500/10 dark:bg-teal-500/15"
          value={
            hasTrackedUptime
              ? formatUptime(uptimeSummary?.trackedAvailabilityPercent)
              : uptimeSummary && uptimeSummary.activeTelemetryDays > 0
                ? `${uptimeSummary.activeTelemetryDays} / ${uptimeSummary.windowDays}`
                : formatUptime(systemUptime)
          }
          unit={
            !hasTrackedUptime &&
            uptimeSummary &&
            uptimeSummary.activeTelemetryDays > 0
              ? 'days'
              : undefined
          }
          subtext={
            hasTrackedUptime
              ? `${formatUptimeDuration(uptimeSummary?.totalOnlineMinutes ?? 0)} online`
              : uptimeSummary && uptimeSummary.activeTelemetryDays > 0
                ? 'Active telemetry days'
                : 'Target: 99.5% SLA'
          }
          secondarySubtext={
            typeof data?.summary.liveSnapshotUptime === 'number'
              ? `Live online: ${data.summary.liveSnapshotUptime.toFixed(0)}%`
              : undefined
          }
          loading={loading}
        />
      </div>

      {/* System Uptime & Availability (Log-Backed Line Graph + Summary + Collapsible Log Table) */}
      <SystemReliabilityCard
        logs={data?.charts.uptimeLogs ?? []}
        summary={uptimeSummary}
        liveSnapshotUptime={data?.summary.liveSnapshotUptime}
        loading={loading}
        className="mb-8"
      />

      {/* Predictive Maintenance & Statistical Forecasting Section */}
      <PredictiveMaintenanceSection
        predictive={data?.predictive ?? null}
        loading={loading}
        dispatchingId={dispatchingId}
        dispatchFeedback={dispatchFeedback}
        onDismissFeedback={() => setDispatchFeedback(null)}
        onDispatchTask={handleDispatchProactiveTask}
      />

      {/* Chart Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Flush Count per Day (Hydro-Cyan Smooth Gradient Area Chart) */}
        <ChartCard
          title="Flush Count per Day"
          subtitle="Daily flush volume across restrooms"
          icon={Waves}
        >
          {loading ? (
            <ChartSkeleton />
          ) : !data?.charts.flushCounts.length ? (
            <EmptyChartState
              title="No Flush Records"
              description="No flushes recorded for the selected timeframe."
              icon={Waves}
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={data.charts.flushCounts}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="flushAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={HYDRO_CYAN} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={HYDRO_CYAN} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  content={
                    <ModernTooltip
                      unit="flushes"
                      valueFormatter={(v) => `${v.toLocaleString()} flushes`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Flush Count"
                  stroke={HYDRO_CYAN}
                  strokeWidth={2.5}
                  fill="url(#flushAreaGradient)"
                  dot={
                    data.charts.flushCounts.length <= 2
                      ? { r: 4, fill: HYDRO_CYAN, stroke: '#ffffff', strokeWidth: 2 }
                      : false
                  }
                  activeDot={{ r: 5, fill: HYDRO_CYAN, stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 2. Water Usage per Day (Clean Cyan/Teal Bar Chart with Rounded Corners) */}
        <ChartCard
          title="Water Usage per Day"
          subtitle="Total water consumed in liters"
          icon={Droplets}
        >
          {loading ? (
            <ChartSkeleton />
          ) : !data?.charts.waterVolume.length ? (
            <EmptyChartState
              title="No Water Usage Data"
              description="Water usage data is not yet available for this timeframe."
              icon={Droplets}
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data.charts.waterVolume}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(6, 182, 212, 0.08)' }}
                  content={
                    <ModernTooltip
                      unit="L"
                      valueFormatter={(v) => `${v.toFixed(1)} Liters`}
                    />
                  }
                />
                <Bar
                  dataKey="liters"
                  name="Water Volume"
                  fill={TEAL_CYAN}
                  radius={[6, 6, 0, 0]}
                  barSize={28}
                  minPointSize={3}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 3. Usage by Hour of Day (Smooth Hydro-Cyan Gradient Area Chart) */}
        <ChartCard
          title="Hourly Activity Distribution"
          subtitle="24-hour patterns to identify peak restroom traffic"
          icon={Clock}
          className="lg:col-span-2"
        >
          {loading ? (
            <ChartSkeleton />
          ) : !data?.charts.hourlyUsage.length ? (
            <EmptyChartState
              title="No Hourly Distribution"
              description="Hourly activity patterns will appear as flushes occur."
              icon={Clock}
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={data.charts.hourlyUsage}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hourlyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={HYDRO_CYAN} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={HYDRO_CYAN} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  content={
                    <ModernTooltip
                      unit="events"
                      valueFormatter={(v) => `${v.toLocaleString()} flushes`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Flush Traffic"
                  stroke={HYDRO_CYAN}
                  strokeWidth={2.5}
                  fill="url(#hourlyAreaGradient)"
                  activeDot={{ r: 5, fill: HYDRO_CYAN, stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 4. UV Sanitization Cycle Activity (Log-Backed Line Graph + Day/Week/Month/Year + Raw Log Table) */}
        <UvCycleAnalyticsCard className="lg:col-span-2" />
      </div>
    </div>
  );
}

function StatCard({
  title,
  icon,
  iconBg,
  value,
  unit,
  subtext,
  secondarySubtext,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  secondarySubtext?: string;
  loading: boolean;
}) {
  return (
    <div className="group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-5">
      {/* Zone 1: Fixed-height header so all 5 hero baselines align */}
      <div className="flex min-h-[2.25rem] items-start justify-between gap-2">
        <span className="pt-0.5 text-[11px] font-semibold uppercase leading-snug tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
        >
          {icon}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2.5">
          <div className="h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="space-y-1.5 pt-1">
            <div className="h-3.5 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        </div>
      ) : (
        <>
          {/* Zone 2: Scalable hero value (fits 6+ digits cleanly without overflow) */}
          <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="truncate font-mono text-2xl font-bold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100 xl:text-[26px]">
              {value}
            </span>
            {unit && (
              <span className="shrink-0 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                {unit}
              </span>
            )}
          </div>

          {/* Zone 3: Fixed-rhythm 2-line footer slot (no orphan wraps) */}
          <div className="mt-3 min-h-[2.25rem] space-y-0.5 border-t border-slate-100/90 pt-2.5 text-[11px] leading-snug tabular-nums dark:border-slate-800/70">
            {subtext && (
              <p className="truncate font-medium text-slate-500 dark:text-slate-400">
                {subtext}
              </p>
            )}
            {secondarySubtext && (
              <p className="truncate font-medium text-slate-400 dark:text-slate-500">
                {secondarySubtext}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  rightSlot,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-6 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {rightSlot && <div>{rightSlot}</div>}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function ChartSkeleton() {
  const heights = [40, 75, 50, 90, 65, 80, 45];
  return (
    <div className="flex h-[280px] w-full flex-col justify-end gap-3 rounded-xl bg-slate-100/50 p-6 dark:bg-slate-800/30">
      <div className="flex h-full w-full items-end justify-between gap-3 opacity-40">
        {heights.map((height, i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded-t-md bg-slate-300 dark:bg-slate-700"
            style={{ height: `${height}%`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyChartState({
  title = 'No telemetry data',
  description = 'No activity recorded for the selected timeframe.',
  icon: Icon = BarChart3,
}: {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex h-[280px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {title}
      </p>
      <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

function formatUptime(value: number | undefined | null) {
  if (typeof value !== 'number' || isNaN(value) || value < 0) {
    return '--';
  }
  return `${value.toFixed(1)}%`;
}

const HEALTH_STATUS_META: Record<
  PredictiveHealthStatus,
  {
    dot: string;
    text: string;
    bar: string;
    label: string;
  }
> = {
  healthy: {
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
    label: 'Within Limit',
  },
  watch: {
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-600 dark:bg-amber-500',
    label: 'Monitor',
  },
  warning: {
    dot: 'bg-orange-500 dark:bg-orange-400',
    text: 'text-orange-700 dark:text-orange-400',
    bar: 'bg-orange-600 dark:bg-orange-500',
    label: 'Needs Check',
  },
  critical: {
    dot: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-600 dark:bg-rose-500',
    label: 'Action Needed',
  },
};

function HealthStatusBadge({
  status,
  suffix = '',
}: {
  status: PredictiveHealthStatus;
  suffix?: string;
}) {
  const { dot, text, label } = HEALTH_STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold tabular-nums ${text}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
        aria-hidden="true"
      />
      <span>
        {label}
        {suffix}
      </span>
    </span>
  );
}

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    dataKey?: string;
    color?: string;
  }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
      <p className="mb-1.5 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:text-slate-400">
        {label} (Expected)
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div
            key={entry.dataKey ?? entry.name}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color ?? HYDRO_CYAN }}
              />
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {entry.name}
              </span>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {entry.dataKey === 'predictedWaterLiters'
                ? `${Number(entry.value ?? 0).toFixed(1)} L`
                : `${Number(entry.value ?? 0).toLocaleString()} flushes`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictiveMaintenanceSection({
  predictive,
  loading,
  dispatchingId,
  dispatchFeedback,
  onDismissFeedback,
  onDispatchTask,
}: {
  predictive: PredictiveMaintenanceSummary | null;
  loading: boolean;
  dispatchingId: string | null;
  dispatchFeedback: { type: 'success' | 'error'; text: string } | null;
  onDismissFeedback: () => void;
  onDispatchTask: (
    targetDeviceId: string,
    message: string,
    keyId: string,
    triggerType?: 'maintenance' | 'sensor_fault',
  ) => Promise<void>;
}) {
  const unitId = predictive?.deviceId ?? 'toilet-01';

  return (
    <section
      aria-label="Equipment Health and Maintenance Forecast"
      className="mb-8 space-y-6"
    >
      {/* Section Header & 3-Metric Summary Triad */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-900/80 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Equipment Health &amp; Maintenance Forecast
                </h2>
                <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                  Unit: {unitId}
                </span>
              </div>
              <span className="sr-only">
                Estimated equipment lifespan, sensor and pump performance checks, and 7-day usage forecast for {unitId}.
              </span>
            </div>
          </div>
        </div>

        {/* 3 Balanced Summary Metric Cards (Design 3's Triad) */}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Overall Equipment Health
            </dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {predictive ? `${predictive.overallHealthIndex}%` : '--'}
            </dd>
            <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Sensor-backed parts only
            </dd>
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Next Part Due for Service
            </dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {predictive?.shortestRulComponent?.estimatedDaysRemaining !==
                null &&
              predictive?.shortestRulComponent?.estimatedDaysRemaining !==
                undefined
                ? `${predictive.shortestRulComponent.estimatedDaysRemaining} days`
                : '--'}
            </dd>
            <dd className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
              {predictive?.shortestRulComponent?.predictedServiceDate
                ? `${predictive.shortestRulComponent.label} · ${predictive.shortestRulComponent.predictedServiceDate}`
                : 'Awaiting usage data'}
            </dd>
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Next 7 Days Forecast
            </dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {predictive
                ? `${predictive.forecasts.next7DaysFlushes.toLocaleString()} flushes`
                : '--'}
            </dd>
            <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {predictive
                ? `~${predictive.forecasts.next7DaysWaterLiters.toFixed(1)} L expected water use`
                : 'Estimating upcoming week'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Dispatch Feedback Toast/Banner */}
      {dispatchFeedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs font-medium ${
            dispatchFeedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/50 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {dispatchFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" aria-hidden="true" />
            )}
            <span>{dispatchFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={onDismissFeedback}
            className="min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-panel A: Equipment Lifespan & Wear Grid */}
      <ChartCard
        title="Equipment Lifespan & Wear"
        subtitle="Sensor-backed parts only — estimated time left before routine service"
        icon={Cpu}
      >
        {loading && !predictive ? (
          <ChartSkeleton />
        ) : !predictive?.componentRul.length ? (
          <EmptyChartState
            title="No Usage Records Yet"
            description="Equipment lifespan estimates will appear once device counters start recording."
            icon={Cpu}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {predictive.componentRul.map((component) => (
              <ComponentRulCard
                key={component.key}
                component={component}
                deviceId={predictive.deviceId}
                dispatching={dispatchingId === `rul-${component.key}`}
                onDispatch={(msg) =>
                  onDispatchTask(
                    predictive.deviceId,
                    msg,
                    `rul-${component.key}`,
                    'maintenance',
                  )
                }
              />
            ))}
          </div>
        )}
      </ChartCard>

      {/* Sub-panel B: Pump & Sensor Performance Check & Next 7 Days Usage Forecast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Pump & Sensor Performance Check"
          subtitle="Early warning if water flow slows down or the user sensor misses readings"
          icon={Gauge}
        >
          {loading && !predictive ? (
            <ChartSkeleton />
          ) : !predictive?.driftIndicators.length ? (
            <EmptyChartState
              title="No Performance Data Yet"
              description="Flow speed and user detection reliability will appear from recent flushes and sensor checks."
              icon={Gauge}
            />
          ) : (
            <div className="flex flex-1 flex-col gap-4">
              {predictive.driftIndicators.map((indicator) => (
                <DriftDiagnosticCard
                  key={indicator.sensorKey}
                  indicator={indicator}
                  dispatching={dispatchingId === `drift-${indicator.sensorKey}`}
                  onDispatch={() => {
                    const triggerType =
                      indicator.sensorKey === 'ultrasonic_echo_stability'
                        ? 'sensor_fault'
                        : 'maintenance';
                    const message = `Performance check requested for ${indicator.label} on ${predictive.deviceId}: current ${indicator.recentValue} ${indicator.metricUnit} (${indicator.driftPercent >= 0 ? '+' : ''}${indicator.driftPercent}% vs normal). ${indicator.diagnosticSummary}`;
                    return onDispatchTask(
                      predictive.deviceId,
                      message,
                      `drift-${indicator.sensorKey}`,
                      triggerType,
                    );
                  }}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Next 7 Days Usage Forecast"
          subtitle="7-day restroom traffic and water estimate using linear regression"
          icon={TrendingUp}
          rightSlot={
            predictive ? (
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    predictive.forecasts.dailyFlushTrendSlope >= 0.5
                      ? 'bg-sky-600 dark:bg-sky-400'
                      : predictive.forecasts.dailyFlushTrendSlope <= -0.5
                        ? 'bg-amber-500 dark:bg-amber-400'
                        : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Daily trend:
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {predictive.forecasts.dailyFlushTrendSlope >= 0 ? '+' : ''}
                  {predictive.forecasts.dailyFlushTrendSlope.toFixed(1)} flushes/day
                </span>
              </div>
            ) : null
          }
        >
          {loading && !predictive ? (
            <ChartSkeleton />
          ) : !predictive?.forecasts.series.length ? (
            <EmptyChartState
              title="No Forecast Available"
              description="Next week's usage estimate will appear from recent flush records."
              icon={TrendingUp}
            />
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={224}>
                <ComposedChart
                  data={predictive.forecasts.series}
                  margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
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
                    yAxisId="left"
                    width={36}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    yAxisId="right"
                    width={36}
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#06B6D4' }}
                  />
                  <Tooltip content={<ForecastTooltip />} />
                  <Bar
                    yAxisId="left"
                    dataKey="predictedFlushes"
                    name="Expected Flushes"
                    fill={HYDRO_CYAN}
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="predictedWaterLiters"
                    name="Expected Water (L)"
                    stroke={TEAL_CYAN}
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    dot={{ r: 3.5, fill: TEAL_CYAN }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap justify-center gap-6 border-t border-slate-100 pt-2.5 text-xs text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-sky-600" />
                  <span>
                    Expected Flushes (
                    {predictive.forecasts.next7DaysFlushes.toLocaleString()} total)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-4 border-t-2 border-dashed border-cyan-500" />
                  <span>
                    Expected Water (
                    {predictive.forecasts.next7DaysWaterLiters.toFixed(1)} L total)
                  </span>
                </div>
              </div>
              <UsageForecastInterpretationPanel
                interpretation={resolveForecastInterpretation(predictive.forecasts)}
              />
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function ComponentRulCard({
  component,
  deviceId,
  dispatching,
  onDispatch,
}: {
  component: ComponentRulPrediction;
  deviceId: string;
  dispatching: boolean;
  onDispatch: (message: string) => Promise<void>;
}) {
  const style = HEALTH_STATUS_META[component.status];
  const rulScheduleClause =
    component.estimatedDaysRemaining !== null && component.predictedServiceDate
      ? `, about ${component.estimatedDaysRemaining} days left (service by ${component.predictedServiceDate})`
      : ' (awaiting recent usage data for service date estimate)';
  const dispatchMsg = `Scheduled maintenance for ${component.label} on ${deviceId}: ${component.wearPercent}% used (${component.currentValue}/${component.ratedLimit} ${component.unit})${rulScheduleClause}. ${component.recommendation}`;

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      {/* Zone 1: Identity & Status Pill */}
      <div>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-3 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {component.label}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {component.partNumber} · Sensor Backed
            </p>
          </div>
          <HealthStatusBadge status={component.status} />
        </div>

        {/* Zone 2: Usage Progress + 3-Metric Triad */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {component.currentValue.toLocaleString()} /{' '}
              {component.ratedLimit.toLocaleString()} {component.unit} used
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              {component.wearPercent}% used
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
              style={{ width: `${Math.min(100, Math.max(2, component.wearPercent))}%` }}
            />
          </div>
        </div>

        <dl className="mt-3.5 grid grid-cols-3 gap-2 text-xs">
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Daily Use
            </dt>
            <dd className="mt-1 truncate font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {component.dailyBurnRate} {component.unit}/day
            </dd>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Time Left
            </dt>
            <dd className="mt-1 truncate font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {component.estimatedDaysRemaining !== null
                ? `${component.estimatedDaysRemaining} days`
                : '—'}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Service By
            </dt>
            <dd className="mt-1 truncate font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {component.predictedServiceDate ?? '—'}
            </dd>
          </div>
        </dl>

        {/* Zone 3: Guidance & Action */}
        <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {component.recommendation}
        </p>
      </div>

      <button
        type="button"
        disabled={dispatching}
        aria-label={`Schedule maintenance for ${component.label}`}
        onClick={() => onDispatch(dispatchMsg)}
        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs transition hover:border-sky-500/50 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
      >
        <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{dispatching ? 'Scheduling...' : 'Schedule Maintenance'}</span>
      </button>
    </article>
  );
}

function formatDriftMetric(value: number, unit: string): string {
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

function DriftDiagnosticCard({
  indicator,
  dispatching,
  onDispatch,
}: {
  indicator: SensorDriftIndicator;
  dispatching: boolean;
  onDispatch: () => Promise<void>;
}) {
  const hasData = indicator.hasData !== false;
  const driftLabel = `${indicator.driftPercent >= 0 ? '+' : ''}${indicator.driftPercent}%`;
  const sampleCount = indicator.sampleCount;
  const sampleBasis = !hasData
    ? 'No samples in window'
    : typeof sampleCount === 'number' && sampleCount > 0
      ? indicator.sensorKey === 'pump_flow_efficiency'
        ? `Based on ${sampleCount.toLocaleString()} ${sampleCount === 1 ? 'flush' : 'flushes'}`
        : `Based on ${sampleCount.toLocaleString()} ${sampleCount === 1 ? 'reading' : 'readings'}`
      : 'Telemetry active';

  return (
    <article className="flex flex-1 flex-col justify-between rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:p-5">
      <div>
        {/* Zone 1: Identity & Clean Status Dot (no pastel pill) */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 border-b border-slate-200/70 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
              {indicator.label}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {indicator.reactiveThresholdLabel}
            </p>
          </div>
          {hasData ? (
            <HealthStatusBadge status={indicator.status} suffix={` (${driftLabel})`} />
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                aria-hidden="true"
              />
              Awaiting Telemetry
            </span>
          )}
        </div>

        {/* Zone 2: Balanced 3-Cell Metric Triad */}
        <dl className="mt-3.5 grid grid-cols-3 gap-2 text-xs">
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Normal
            </dt>
            <dd className="mt-1 truncate font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {hasData
                ? formatDriftMetric(indicator.baselineValue, indicator.metricUnit)
                : '--'}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Current
            </dt>
            <dd className="mt-1 truncate font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {hasData
                ? formatDriftMetric(indicator.recentValue, indicator.metricUnit)
                : '--'}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Change
            </dt>
            <dd className="mt-1 truncate font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {hasData ? driftLabel : '--'}
            </dd>
          </div>
        </dl>

        {/* Zone 3: Diagnostic Summary */}
        <p className="mt-3.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {indicator.diagnosticSummary}
        </p>
      </div>

      {/* Zone 4: Sample Basis & Aligned Action Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-800">
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {sampleBasis}
        </span>
        <button
          type="button"
          disabled={dispatching}
          aria-label={`Schedule checkup for ${indicator.label}`}
          onClick={() => onDispatch()}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs transition hover:border-sky-500/50 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
        >
          <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{dispatching ? 'Scheduling...' : 'Schedule Checkup'}</span>
        </button>
      </div>
    </article>
  );
}

function resolveForecastInterpretation(
  forecasts: PredictiveMaintenanceSummary['forecasts'],
): UsageForecastInterpretation {
  if (forecasts.interpretation) {
    return forecasts.interpretation;
  }

  const series = forecasts.series;
  const horizon = Math.max(1, series.length);
  const slope = forecasts.dailyFlushTrendSlope;
  const totalFlushes = forecasts.next7DaysFlushes;
  const totalWater = forecasts.next7DaysWaterLiters;

  let peakDay = series[0] ?? null;
  let lowDay = series[0] ?? null;
  for (const pt of series) {
    if (peakDay && pt.predictedFlushes > peakDay.predictedFlushes) peakDay = pt;
    if (lowDay && pt.predictedFlushes < lowDay.predictedFlushes) lowDay = pt;
  }

  const avgDailyFlushes = Number((totalFlushes / horizon).toFixed(1));
  const avgDailyWaterLiters = Number((totalWater / horizon).toFixed(1));
  const avgLitersPerFlush =
    totalFlushes > 0 ? Number((totalWater / totalFlushes).toFixed(2)) : 0;
  const baselineLiters = totalFlushes * 6.0;
  const estimatedWaterSavedLiters = Number((baselineLiters - totalWater).toFixed(1));
  const estimatedSavingsPercent =
    baselineLiters > 0
      ? Number(((estimatedWaterSavedLiters / baselineLiters) * 100).toFixed(1))
      : 0;

  const trendDirection: UsageForecastInterpretation['trendDirection'] =
    slope >= 0.5 ? 'increasing' : slope <= -0.5 ? 'decreasing' : 'stable';
  const trendLabel =
    trendDirection === 'increasing'
      ? 'Usage Rising'
      : trendDirection === 'decreasing'
        ? 'Usage Slowing'
        : 'Usage Steady';

  const firstDay = series[0] ?? null;
  const trendNarrative =
    trendDirection === 'increasing' && firstDay && peakDay
      ? `Restroom use is expected to grow by about +${slope.toFixed(1)} flushes each day — rising from ${firstDay.predictedFlushes} flushes on ${firstDay.label} to a busiest day of ${peakDay.predictedFlushes} flushes on ${peakDay.label}.`
      : trendDirection === 'decreasing' && firstDay && lowDay
        ? `Restroom use is expected to ease by ${slope.toFixed(1)} flushes each day — dropping from ${firstDay.predictedFlushes} flushes on ${firstDay.label} down to ${lowDay.predictedFlushes} flushes on ${lowDay.label}.`
        : lowDay && peakDay
          ? `Restroom use is expected to stay steady around ${avgDailyFlushes.toFixed(1)} flushes/day (ranging between ${lowDay.predictedFlushes} and ${peakDay.predictedFlushes} flushes a day).`
          : `Restroom use is expected to average about ${avgDailyFlushes.toFixed(1)} flushes/day over the next ${horizon} days.`;

  const waterNarrative =
    totalFlushes === 0
      ? 'Expected water use is 0.0 L since no flushes were logged in this period.'
      : avgLitersPerFlush > 6.0
        ? `Expected water use is ${totalWater.toFixed(1)} L (~${avgLitersPerFlush.toFixed(2)} L per flush), which is ${Math.abs(estimatedWaterSavedLiters).toFixed(1)} L above standard 6.0 L toilets — check flush timer and water flow settings.`
        : `Expected water use is ${totalWater.toFixed(1)} L (~${avgLitersPerFlush.toFixed(2)} L per flush), saving about ${estimatedWaterSavedLiters.toFixed(1)} L (${estimatedSavingsPercent.toFixed(1)}%) compared to standard 6.0 L toilets.`;

  const actionRecommendation =
    avgLitersPerFlush > 6.0 && peakDay
      ? `Check pump flush duration and flow sensor calibration before ${peakDay.label} to avoid extra water use.`
      : trendDirection === 'increasing' && peakDay
        ? `Restock supplies and do a quick check before ${peakDay.label}, which is expected to be the busiest day (${peakDay.predictedFlushes} flushes).`
        : trendDirection === 'decreasing'
          ? 'Lighter restroom traffic is expected — a good window for routine cleaning, wiping sensors, and checking valves.'
          : 'Steady usage is expected — keep up regular daily cleaning and routine checks.';

  return {
    trendDirection,
    trendLabel,
    avgDailyFlushes,
    avgDailyWaterLiters,
    avgLitersPerFlush,
    estimatedWaterSavedLiters,
    estimatedSavingsPercent,
    peakDay,
    lowDay,
    activeDaysObserved: 0,
    totalDaysObserved: 0,
    usedBaselineFallback: false,
    confidenceLevel: 'moderate',
    confidenceLabel: 'Good Estimate',
    modelSummary: 'Linear Regression',
    trendNarrative,
    waterNarrative,
    actionRecommendation,
  };
}

function UsageForecastInterpretationPanel({
  interpretation,
}: {
  interpretation: UsageForecastInterpretation;
}) {
  const regression = interpretation.regression;
  const trendDotClass =
    interpretation.trendDirection === 'increasing'
      ? 'bg-sky-600 dark:bg-sky-400'
      : interpretation.trendDirection === 'decreasing'
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-slate-400 dark:bg-slate-500';

  const confidenceDotClass =
    interpretation.confidenceLevel === 'high'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : interpretation.confidenceLevel === 'moderate'
        ? 'bg-sky-500 dark:bg-sky-400'
        : interpretation.confidenceLevel === 'low'
          ? 'bg-amber-500 dark:bg-amber-400'
          : 'bg-slate-400 dark:bg-slate-500';

  return (
    <div className="mt-4 space-y-3" data-testid="usage-forecast-interpretation">
      {/* 3-Metric Key Takeaways Triad */}
      <dl className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Daily Average
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {interpretation.avgDailyFlushes.toFixed(1)} flushes
          </dd>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {interpretation.avgDailyWaterLiters.toFixed(1)} L/day
          </p>
        </div>

        <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Projected Peak
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {interpretation.peakDay ? interpretation.peakDay.label : '—'}
          </dd>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {interpretation.peakDay
              ? `${interpretation.peakDay.predictedFlushes} flushes · ${interpretation.peakDay.predictedWaterLiters.toFixed(1)} L`
              : 'No peak data'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Est. Water / Flush
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {interpretation.avgLitersPerFlush.toFixed(2)} L
          </dd>
          <p
            className={`mt-0.5 text-[11px] font-medium tabular-nums ${
              interpretation.avgLitersPerFlush === 0
                ? 'text-slate-500 dark:text-slate-400'
                : interpretation.estimatedWaterSavedLiters >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {interpretation.avgLitersPerFlush === 0
              ? 'No water projected'
              : interpretation.estimatedWaterSavedLiters >= 0
                ? `Saves ${interpretation.estimatedSavingsPercent.toFixed(1)}% vs 6.0 L`
                : `+${Math.abs(interpretation.estimatedSavingsPercent).toFixed(1)}% vs 6.0 L`}
          </p>
        </div>
      </dl>

      {/* Plain-English Interpretation Box */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2 dark:border-slate-800">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            What This Forecast Means
          </h3>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <span
              className={`h-1.5 w-1.5 rounded-full ${trendDotClass}`}
              aria-hidden="true"
            />
            {interpretation.trendLabel}
          </span>
        </div>

        {/* Plain-Language Linear Regression Summary Strip */}
        {regression && !interpretation.usedBaselineFallback && (
          <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-slate-200/70 pb-2.5 text-[11px] sm:grid-cols-3 dark:border-slate-800">
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Trend Formula
              </dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {regression.equation}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Trend Accuracy (R²)
              </dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {regression.rSquared !== null
                  ? `${(regression.rSquared * 100).toFixed(0)}% (${regression.fitLabel})`
                  : regression.fitLabel}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Typical Margin
              </dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                ±{regression.rmse.toFixed(1)} flushes/day
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Expected Traffic:{' '}
            </span>
            {interpretation.trendNarrative}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Water Usage:{' '}
            </span>
            {interpretation.waterNarrative}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              What To Do:{' '}
            </span>
            {interpretation.actionRecommendation}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="font-mono">{interpretation.modelSummary}</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
            <span
              className={`h-1.5 w-1.5 rounded-full ${confidenceDotClass}`}
              aria-hidden="true"
            />
            {interpretation.confidenceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
