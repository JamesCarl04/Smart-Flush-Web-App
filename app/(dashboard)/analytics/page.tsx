"use client";

import { useState, useEffect } from "react";
import { useAnalytics, DateRange } from "@/hooks/useAnalytics";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { 
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from "recharts";
import { Calendar, Droplets, Activity, Percent, Clock } from "lucide-react";

const SKELETON_BAR_HEIGHTS = [
  "h-[28%]",
  "h-[61%]",
  "h-[43%]",
  "h-[77%]",
  "h-[52%]",
  "h-[68%]",
  "h-[35%]",
];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfDay(new Date()), 7),
    to: endOfDay(new Date())
  });

  const { data, loading, error } = useAnalytics(dateRange);

  // Sync date range to URL search params
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('from', dateRange.from.toISOString());
    url.searchParams.set('to', dateRange.to.toISOString());
    window.history.replaceState({}, '', url.toString());
  }, [dateRange]);

  const setPresetRange = (days: number) => {
    setDateRange({
      from: subDays(startOfDay(new Date()), days),
      to: endOfDay(new Date())
    });
  };

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

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
    <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-fade-in">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Analytics</h1>
          <p className="text-base-content/60 mt-1">System performance and usage metrics</p>
        </div>
        
        <div className="join bg-base-200 p-1 rounded-lg">
          <button className="btn btn-sm join-item" onClick={() => setPresetRange(0)}>Today</button>
          <button className="btn btn-sm join-item" onClick={() => setPresetRange(7)}>7 Days</button>
          <button className="btn btn-sm join-item" onClick={() => setPresetRange(30)}>30 Days</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Total Flushes" icon={<Activity className="w-5 h-5 text-primary" />} value={data?.summary.totalFlushes} loading={loading} />
        <StatCard title="Water Used (L)" icon={<Droplets className="w-5 h-5 text-info" />} value={data?.summary.totalWater} loading={loading} />
        <StatCard title="UV Completion" icon={<Percent className="w-5 h-5 text-accent" />} value={`${data?.summary.uvCompletion}%`} loading={loading} />
        <StatCard title="Avg Flushes/Day" icon={<Calendar className="w-5 h-5 text-secondary" />} value={data?.summary.avgFlushesPerDay} loading={loading} />
        <StatCard title="System Uptime" icon={<Clock className="w-5 h-5 text-success" />} value={`${data?.summary.systemUptime}%`} loading={loading} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Chart 1: Flush Count (Bar) */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title text-base font-semibold">Flush Count per Day</h2>
            <div className="h-72 w-full mt-4">
              {loading ? <SkeletonChart /> : data?.charts.flushCounts.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.charts.flushCounts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'currentColor', opacity: 0.1 }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="var(--fallback-p,oklch(var(--p)/1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Chart 2: Water Volume over Time (Area) */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title text-base font-semibold">Water Usage per Day (Liters)</h2>
            <div className="h-72 w-full mt-4">
              {loading ? <SkeletonChart /> : data?.charts.waterVolume.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.charts.waterVolume} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--fallback-in,oklch(var(--in)/1))" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--fallback-in,oklch(var(--in)/1))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="liters" stroke="var(--fallback-in,oklch(var(--in)/1))" fillOpacity={1} fill="url(#colorLiters)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Chart 3: Hourly Usage (Line) */}
        <div className="card bg-base-100 shadow-xl border border-base-200 lg:col-span-2">
          <div className="card-body">
            <h2 className="card-title text-base font-semibold">Usage by Hour of Day</h2>
            <div className="h-72 w-full mt-4">
              {loading ? <SkeletonChart /> : data?.charts.hourlyUsage.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.charts.hourlyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="count" stroke="var(--fallback-s,oklch(var(--s)/1))" strokeWidth={3} dot={{ r: 4, fill: "var(--fallback-s,oklch(var(--s)/1))" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Chart 4: UV Completion (Pie) */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title text-base font-semibold">UV Cycles Completed vs Failed</h2>
            <div className="h-72 w-full flex items-center justify-center">
              {loading ? <div className="skeleton w-48 h-48 rounded-full"></div> : data?.charts.uvStats.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.charts.uvStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {data?.charts.uvStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Legend */}
            {!loading && (
              <div className="flex justify-center gap-4 mt-2">
                {data?.charts.uvStats.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-sm">{entry.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chart 5: Daily Uptime % (Bar with Reference Line) */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title text-base font-semibold">Daily Uptime %</h2>
            <div className="h-72 w-full mt-4 text-xs">
              {loading ? <SkeletonChart /> : data?.charts.uptimeStats.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.charts.uptimeStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis domain={['auto', 100]} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'currentColor', opacity: 0.1 }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <ReferenceLine y={99.5} stroke="var(--fallback-er,oklch(var(--er)/1))" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'SLA (99.5%)', fill: 'var(--fallback-er,oklch(var(--er)/1))', fontSize: 12 }} />
                    <Bar dataKey="uptime" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Helpers
function StatCard({ title, icon, value, loading }: { title: string, icon: React.ReactNode, value: number | string | undefined, loading: boolean }) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">{title}</h3>
          {icon}
        </div>
        {loading ? (
          <div className="skeleton h-8 w-1/2"></div>
        ) : (
          <div className="text-2xl font-bold truncate">{value}</div>
        )}
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="w-full h-full flex flex-col justify-end gap-2 p-4">
      <div className="w-full flex items-end justify-between h-full gap-2 opacity-20">
        {SKELETON_BAR_HEIGHTS.map((heightClass, index) => (
          <div key={index} className={`w-full bg-base-content rounded-t-sm ${heightClass}`}></div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-base-200/50 rounded-lg border border-dashed border-base-300">
      <p className="text-base-content/50 font-medium">No data for selected range</p>
    </div>
  );
}
