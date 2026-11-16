'use client';

import { useEffect, useState } from 'react';
import { useAnalytics, DateRange } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import type {
  ComponentRulPrediction,
  PredictiveHealthStatus,
  PredictiveMaintenanceSummary,
  SensorDriftIndicator,
} from '@/types';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Droplets,
  Calendar,
  Clock,
  ShieldCheck,
  BarChart3,
  Waves,
  Sparkles,
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
const EMERALD = '#10B981';
const CRIMSON = '#EF4444';
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

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfDay(new Date()), 7),
    to: endOfDay(new Date()),
  });
  const [activePreset, setActivePreset] = useState<0 | 7 | 30>(7);
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
    url.searchParams.set('from', dateRange.from.toISOString());
    url.searchParams.set('to', dateRange.to.toISOString());
    window.history.replaceState({}, '', url.toString());
  }, [dateRange]);

  const setPresetRange = (days: 0 | 7 | 30) => {
    setActivePreset(days);
    setDateRange({
      from: subDays(startOfDay(new Date()), days),
      to: endOfDay(new Date()),
    });
  };

  const totalFlushes = data?.summary.totalFlushes;
  const totalWater = data?.summary.totalWater;
  const uvCompletion = data?.summary.uvCompletion;
  const avgFlushesPerDay = data?.summary.avgFlushesPerDay;
  const systemUptime = data?.summary.systemUptime;

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
        <div className="inline-flex items-center rounded-xl border border-slate-200/80 bg-slate-100 p-1 shadow-inner dark:border-slate-800/80 dark:bg-slate-800/80">
          {[
            { label: 'Today', days: 0 as const },
            { label: '7 Days', days: 7 as const },
            { label: '30 Days', days: 30 as const },
          ].map((preset) => {
            const isActive = activePreset === preset.days;
            return (
              <button
                key={preset.days}
                type="button"
                onClick={() => setPresetRange(preset.days)}
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
          value={typeof totalWater === 'number' ? totalWater.toFixed(1) : '--'}
          unit="L"
          subtext="Total consumed"
          loading={loading}
        />
        <StatCard
          title="UV Cycle Completion"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          value={
            typeof uvCompletion === 'number'
              ? `${uvCompletion.toFixed(1)}%`
              : '--'
          }
          subtext={
            data?.summary.uvTotal
              ? `${data.summary.uvCompleted}/${data.summary.uvTotal} cycles`
              : 'Timer completion'
          }
          loading={loading}
        />
        <StatCard
          title="Avg Flushes/Day"
          icon={<Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-500/10 dark:bg-indigo-500/15"
          value={
            typeof avgFlushesPerDay === 'number'
              ? avgFlushesPerDay.toFixed(1)
              : '--'
          }
          subtext="Daily average"
          loading={loading}
        />
        <StatCard
          title="System Reliability"
          icon={<Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
          iconBg="bg-teal-500/10 dark:bg-teal-500/15"
          value={formatUptime(systemUptime)}
          subtext={
            typeof data?.summary.liveSnapshotUptime === 'number'
              ? `Online: ${data.summary.liveSnapshotUptime.toFixed(0)}% · Target: 99.5%`
              : 'Target: 99.5%'
          }
          loading={loading}
        />
      </div>

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

        {/* 4. UV Cycles Completed vs Failed (Clean Donut Chart with Center Metric) */}
        <ChartCard
          title="UV Cycle Completion"
          subtitle="Completed vs interrupted UV timer cycles"
          icon={Sparkles}
        >
          {loading ? (
            <DonutSkeleton />
          ) : !data?.charts.uvStats.length ? (
            <EmptyChartState
              title="No UV Cycle Records"
              description="No UV timer cycles recorded in this period."
              icon={Sparkles}
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative flex h-[240px] w-full items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.charts.uvStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={74}
                      outerRadius={104}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.charts.uvStats.map((entry, index) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={index === 0 ? EMERALD : CRIMSON}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ModernTooltip
                          unit="%"
                          valueFormatter={(v) => `${v.toFixed(1)}%`}
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Metric Percentage */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
                    {typeof uvCompletion === 'number'
                      ? `${uvCompletion.toFixed(1)}%`
                      : '--'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Success Rate
                  </span>
                </div>
              </div>

              {/* Status Legend */}
              <div className="mt-4 flex justify-center gap-6 border-t border-slate-100 pt-3 dark:border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Completed (
                    {typeof uvCompletion === 'number'
                      ? `${uvCompletion.toFixed(1)}%`
                      : '0%'}
                    {typeof data?.summary.uvCompleted === 'number'
                      ? ` · ${data.summary.uvCompleted}`
                      : ''}
                    )
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/40" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Failed (
                    {typeof uvCompletion === 'number'
                      ? `${Math.max(0, 100 - uvCompletion).toFixed(1)}%`
                      : '0%'}
                    {typeof data?.summary.uvFailed === 'number'
                      ? ` · ${data.summary.uvFailed}`
                      : ''}
                    )
                  </span>
                </div>
              </div>
            </div>
          )}
        </ChartCard>

        {/* 5. Daily Uptime % (Clean Bar Chart with 99.5% Target Reference Line) */}
        <ChartCard
          title="Daily System Reliability"
          subtitle="System online percentage against target"
          icon={BarChart3}
        >
          {loading ? (
            <ChartSkeleton />
          ) : !data?.charts.uptimeStats.length ? (
            <EmptyChartState
              title="No Reliability Data"
              description="Reliability records will appear for the selected timeframe."
              icon={BarChart3}
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data.charts.uptimeStats}
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
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(2, 132, 199, 0.08)' }}
                  content={
                    <ModernTooltip
                      unit="%"
                      valueFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                  }
                />
                <ReferenceLine
                  y={99.5}
                  stroke={CRIMSON}
                  strokeDasharray="3 3"
                  label={{
                    position: 'insideTopLeft',
                    value: 'Target (99.5%)',
                    fill: CRIMSON,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Bar
                  dataKey="uptime"
                  name="Uptime"
                  fill={HYDRO_CYAN}
                  radius={[6, 6, 0, 0]}
                  barSize={28}
                  minPointSize={3}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
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
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  loading: boolean;
}) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-5">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </span>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}
          >
            {icon}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 py-1">
            <div className="h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100 sm:text-3xl">
                {value}
              </span>
              {unit && (
                <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                  {unit}
                </span>
              )}
            </div>
            {subtext && (
              <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {subtext}
              </p>
            )}
          </div>
        )}
      </div>
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
      className={`rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700 sm:p-6 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
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
      <div>{children}</div>
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

function DonutSkeleton() {
  return (
    <div className="flex h-[280px] w-full items-center justify-center rounded-xl bg-slate-100/50 dark:bg-slate-800/30">
      <div className="h-44 w-44 animate-pulse rounded-full border-8 border-slate-200 dark:border-slate-700/60" />
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
    badge: string;
    bar: string;
    iconColor: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  healthy: {
    badge:
      'border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-200',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    label: 'Within Limit',
    Icon: CheckCircle2,
  },
  watch: {
    badge:
      'border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200',
    bar: 'bg-amber-600 dark:bg-amber-500',
    iconColor: 'text-amber-700 dark:text-amber-400',
    label: 'Monitor',
    Icon: Clock,
  },
  warning: {
    badge:
      'border-orange-300/80 bg-orange-50 text-orange-900 dark:border-orange-700/60 dark:bg-orange-950/50 dark:text-orange-200',
    bar: 'bg-orange-600 dark:bg-orange-500',
    iconColor: 'text-orange-700 dark:text-orange-400',
    label: 'Needs Check',
    Icon: AlertCircle,
  },
  critical: {
    badge:
      'border-rose-300/80 bg-rose-50 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/50 dark:text-rose-200',
    bar: 'bg-rose-600 dark:bg-rose-500',
    iconColor: 'text-rose-700 dark:text-rose-400',
    label: 'Action Needed',
    Icon: AlertTriangle,
  },
};

function HealthStatusBadge({
  status,
  suffix = '',
}: {
  status: PredictiveHealthStatus;
  suffix?: string;
}) {
  const { badge, iconColor, label, Icon } = HEALTH_STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />
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
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Equipment Health &amp; Maintenance Forecast
                </h2>
                <span className="rounded-full border border-sky-300/80 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-200">
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
              {predictive?.shortestRulComponent
                ? `${predictive.shortestRulComponent.estimatedDaysRemaining} days`
                : '--'}
            </dd>
            <dd className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
              {predictive?.shortestRulComponent
                ? `${predictive.shortestRulComponent.label} · ${predictive.shortestRulComponent.predictedServiceDate}`
                : 'Checking part wear'}
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
            <div className="space-y-4">
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
          subtitle="Expected daily flushes and water use for the coming week"
          icon={TrendingUp}
          rightSlot={
            predictive ? (
              <span className="rounded-full border border-sky-300/80 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-200">
                Daily Change:{' '}
                {predictive.forecasts.dailyFlushTrendSlope >= 0 ? '+' : ''}
                {predictive.forecasts.dailyFlushTrendSlope.toFixed(1)}/day
              </span>
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
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart
                  data={predictive.forecasts.series}
                  margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
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
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    yAxisId="right"
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
  const dispatchMsg = `Scheduled maintenance for ${component.label} on ${deviceId}: ${component.wearPercent}% used (${component.currentValue}/${component.ratedLimit} ${component.unit}), about ${component.estimatedDaysRemaining} days left (service by ${component.predictedServiceDate}). ${component.recommendation}`;

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

        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Daily Use
            </dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
              {component.dailyBurnRate} {component.unit}/day
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Time Left
            </dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
              {component.estimatedDaysRemaining} days
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Service By
            </dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
              {component.predictedServiceDate}
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

function DriftDiagnosticCard({
  indicator,
  dispatching,
  onDispatch,
}: {
  indicator: SensorDriftIndicator;
  dispatching: boolean;
  onDispatch: () => Promise<void>;
}) {
  const driftLabel = `${indicator.driftPercent >= 0 ? '+' : ''}${indicator.driftPercent}%`;

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      {/* Zone 1: Identity & Status Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200/70 pb-3 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {indicator.label}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {indicator.reactiveThresholdLabel}
          </p>
        </div>
        <HealthStatusBadge status={indicator.status} suffix={` (${driftLabel})`} />
      </div>

      {/* Zone 2: 3-Metric Triad */}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
        <div>
          <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            Normal
          </dt>
          <dd className="mt-0.5 font-mono font-bold text-slate-900 dark:text-slate-100">
            {indicator.baselineValue} {indicator.metricUnit}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            Current
          </dt>
          <dd className="mt-0.5 font-mono font-bold text-slate-900 dark:text-slate-100">
            {indicator.recentValue} {indicator.metricUnit}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            Change
          </dt>
          <dd className="mt-0.5 font-mono font-bold text-slate-900 dark:text-slate-100">
            {driftLabel}
          </dd>
        </div>
      </dl>

      {/* Zone 3: Guidance & Action */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {indicator.diagnosticSummary}
        </p>
        <button
          type="button"
          disabled={dispatching}
          aria-label={`Schedule checkup for ${indicator.label}`}
          onClick={() => onDispatch()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs transition hover:border-sky-500/50 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
        >
          <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{dispatching ? 'Scheduling...' : 'Schedule Checkup'}</span>
        </button>
      </div>
    </article>
  );
}
