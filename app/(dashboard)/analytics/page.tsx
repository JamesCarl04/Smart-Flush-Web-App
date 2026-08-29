'use client';

import { useEffect, useState } from 'react';
import { useAnalytics, DateRange } from '@/hooks/useAnalytics';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
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
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfDay(new Date()), 7),
    to: endOfDay(new Date()),
  });
  const [activePreset, setActivePreset] = useState<0 | 7 | 30>(7);
  const { data, loading, error } = useAnalytics(dateRange);

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
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Flush counts, water usage trends, and cleaning performance
          </p>
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
                className={`tactile-btn relative rounded-lg px-4 py-1.5 text-xs font-semibold select-none ${
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
          title="UV Cleaning Rate"
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
              : 'Cleaning completion'
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
          title="UV Cleaning Performance"
          subtitle="Completed cleaning cycles vs interrupted cycles"
          icon={Sparkles}
        >
          {loading ? (
            <DonutSkeleton />
          ) : !data?.charts.uvStats.length ? (
            <EmptyChartState
              title="No UV Cleaning Records"
              description="No UV cleaning cycles recorded in this period."
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
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
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
