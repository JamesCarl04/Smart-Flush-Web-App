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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Calendar, Droplets, Activity, Percent, Clock } from 'lucide-react';

const BRAND_PURPLE = '#7C3AED';
const CYAN = '#06B6D4';
const PINK = '#EC4899';
const GREEN = '#10B981';
const RED = '#EF4444';
const GRID_COLOR = 'rgba(148, 163, 184, 0.22)';
const TOOLTIP_STYLE = {
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  boxShadow: '0 16px 40px -24px rgb(15 23 42 / 0.4)',
  backgroundColor: 'rgba(255,255,255,0.96)',
};
const SKELETON_BAR_HEIGHTS = [
  'h-[28%]',
  'h-[61%]',
  'h-[43%]',
  'h-[77%]',
  'h-[52%]',
  'h-[68%]',
  'h-[35%]',
];

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
      <div className="container mx-auto p-8">
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl animate-fade-in p-4 md:p-8">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
            Analytics
          </h1>
          <p className="mt-1 text-base-content/60">
            System performance and usage metrics
          </p>
        </div>

        <div className="join rounded-lg bg-base-200 p-1">
          {[0, 7, 30].map((days) => (
            <button
              key={days}
              className={`btn btn-sm join-item ${activePreset === days ? 'btn-primary text-primary-content' : 'btn-ghost'}`}
              onClick={() => setPresetRange(days as 0 | 7 | 30)}
            >
              {days === 0 ? 'Today' : `${days} Days`}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          title="Total Flushes"
          icon={<Activity className="h-5 w-5 text-primary" />}
          value={
            typeof totalFlushes === 'number'
              ? totalFlushes.toLocaleString()
              : '--'
          }
          loading={loading}
        />
        <StatCard
          title="Water Used (L)"
          icon={<Droplets className="h-5 w-5 text-info" />}
          value={typeof totalWater === 'number' ? totalWater.toFixed(1) : '--'}
          loading={loading}
        />
        <StatCard
          title="UV Completion"
          icon={<Percent className="h-5 w-5 text-accent" />}
          value={
            typeof uvCompletion === 'number'
              ? `${uvCompletion.toFixed(1)}%`
              : '--'
          }
          loading={loading}
        />
        <StatCard
          title="Avg Flushes/Day"
          icon={<Calendar className="h-5 w-5 text-secondary" />}
          value={
            typeof avgFlushesPerDay === 'number'
              ? avgFlushesPerDay.toFixed(1)
              : '--'
          }
          loading={loading}
        />
        <StatCard
          title="System Uptime"
          icon={<Clock className="h-5 w-5 text-success" />}
          value={formatUptime(systemUptime)}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ChartCard title="Flush Count per Day">
          {loading ? (
            <SkeletonChart />
          ) : !data?.charts.flushCounts.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.charts.flushCounts}
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
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: BRAND_PURPLE, opacity: 0.08 }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value) => [
                    `${getNumericTooltipValue(value)} flushes`,
                    'Flush Count',
                  ]}
                />
                <Bar
                  dataKey="count"
                  fill={BRAND_PURPLE}
                  radius={[8, 8, 0, 0]}
                  barSize={32}
                  minPointSize={3}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Water Usage per Day (Liters)">
          {loading ? (
            <SkeletonChart />
          ) : !data?.charts.waterVolume.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={data.charts.waterVolume}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="waterGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={CYAN} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={CYAN} stopOpacity={0.02} />
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
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value) => [
                    `${getNumericTooltipValue(value).toFixed(1)} L`,
                    'Water Usage',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="liters"
                  stroke={CYAN}
                  strokeWidth={3}
                  fill="url(#waterGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Usage by Hour of Day" className="lg:col-span-2">
          {loading ? (
            <SkeletonChart />
          ) : !data?.charts.hourlyUsage.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={data.charts.hourlyUsage}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => `Hour: ${label}`}
                  formatter={(value) => [
                    `${getNumericTooltipValue(value)} events`,
                    'Usage',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={PINK}
                  strokeWidth={3}
                  dot={{ r: 4, fill: PINK }}
                  activeDot={{ r: 6, fill: PINK }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="UV Cycles Completed vs Failed">
          {loading ? (
            <PieSkeleton />
          ) : !data?.charts.uvStats.length ? (
            <EmptyChart />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.charts.uvStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={106}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.charts.uvStats.map((entry, index) => (
                      <Cell key={entry.name} fill={[GREEN, RED][index % 2]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [
                      `${getNumericTooltipValue(value).toFixed(1)}%`,
                      'Cycle Share',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex justify-center gap-4">
                {data.charts.uvStats.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: [GREEN, RED][index % 2] }}
                    ></div>
                    <span className="text-sm">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title="Daily Uptime %">
          {loading ? (
            <SkeletonChart />
          ) : !data?.charts.uptimeStats.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
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
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: BRAND_PURPLE, opacity: 0.08 }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value) => [
                    `${getNumericTooltipValue(value).toFixed(1)}%`,
                    'Uptime',
                  ]}
                />
                <ReferenceLine
                  y={99.5}
                  stroke={RED}
                  strokeDasharray="3 3"
                  label={{
                    position: 'insideTopLeft',
                    value: 'SLA (99.5%)',
                    fill: RED,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="uptime"
                  fill={BRAND_PURPLE}
                  radius={[8, 8, 0, 0]}
                  barSize={32}
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
  value,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="card border border-base-200 bg-base-100 shadow-sm">
      <div className="card-body p-4">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
            {title}
          </h3>
          {icon}
        </div>
        {loading ? (
          <div className="skeleton h-8 w-1/2"></div>
        ) : (
          <div className="truncate text-2xl font-bold">{value}</div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card border border-base-200 bg-base-100 shadow-xl ${className}`}
    >
      <div className="card-body">
        <h2 className="card-title text-base font-bold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="flex h-[300px] w-full flex-col justify-end gap-2 rounded-xl bg-base-200/40 p-4">
      <div className="flex h-full w-full items-end justify-between gap-2 opacity-30">
        {SKELETON_BAR_HEIGHTS.map((heightClass, index) => (
          <div
            key={index}
            className={`w-full rounded-t-md bg-base-content ${heightClass}`}
          ></div>
        ))}
      </div>
    </div>
  );
}

function PieSkeleton() {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-xl bg-base-200/40">
      <div className="skeleton h-48 w-48 rounded-full"></div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/40">
      <p className="font-medium text-base-content/50">
        No data available for this period
      </p>
    </div>
  );
}

function formatUptime(value: number | undefined) {
  if (typeof value !== 'number' || value <= 0) {
    return '--';
  }

  return `${value.toFixed(1)}%`;
}

function getNumericTooltipValue(
  value: number | string | ReadonlyArray<number | string> | undefined,
) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const numericValue =
    typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
}
