'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { format } from 'date-fns';

export type DateRange = {
  from: Date;
  to: Date;
};

export type FlushCountData = { date: string; count: number };
export type VolumeData = { date: string; liters: number };
export type UvData = { name: string; value: number };
export type HourlyData = { hour: string; count: number };
export type UptimeData = { date: string; uptime: number };

export type AnalyticsData = {
  summary: {
    totalFlushes: number;
    totalWater: number;
    uvCompletion: number | null;
    uvTotal?: number;
    uvCompleted?: number;
    uvFailed?: number;
    avgFlushesPerDay: number;
    systemUptime: number;
    liveSnapshotUptime?: number;
  };
  charts: {
    flushCounts: FlushCountData[];
    waterVolume: VolumeData[];
    uvStats: UvData[];
    hourlyUsage: HourlyData[];
    uptimeStats: UptimeData[];
  };
};

// API response interfaces
interface DashboardResponse {
  success: boolean;
  data: {
    totalFlushes: number;
    totalWaterLiters: number;
    uvCompletionRate: number | null;
    uvStats?: {
      total: number;
      completed: number;
      failed: number;
    };
    avgFlushesPerDay: number;
    uptimePercent: number;
    liveSnapshotPercent?: number;
  };
}

interface WaterUsageDay {
  date: string;
  totalVolume: number;
  avgVolume: number;
  flushCount: number;
}

interface WaterUsageResponse {
  success: boolean;
  data: WaterUsageDay[];
}

interface PatternBucket {
  label: string;
  count: number;
}

interface FlushPatternsResponse {
  success: boolean;
  data: { byDay: PatternBucket[]; byHour: PatternBucket[] };
}

interface SystemPerformanceResponse {
  success: boolean;
  data: {
    uptimePercent: number;
    liveSnapshotPercent?: number;
    onlineCount: number;
    totalCount: number;
    daily?: Array<{ date: string; uptimePercent: number }>;
  };
}

const ANALYTICS_REFRESH_MS = 10_000;

export function useAnalytics(range: DateRange) {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();

  const fetchAnalytics = useCallback(async (showLoading = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const fromStr = format(new Date(fromTime), 'yyyy-MM-dd');
      const toStr = format(new Date(toTime), 'yyyy-MM-dd');

      const [dashboardRes, waterRes, patternsRes, perfRes] = await Promise.all([
        apiFetch<DashboardResponse>(
          `/api/analytics/dashboard?from=${fromStr}&to=${toStr}`,
          user,
          { cache: 'no-store' },
        ),
        apiFetch<WaterUsageResponse>(
          `/api/analytics/water-usage?from=${fromStr}&to=${toStr}`,
          user,
          { cache: 'no-store' },
        ),
        apiFetch<FlushPatternsResponse>(
          `/api/analytics/flush-patterns?from=${fromStr}&to=${toStr}`,
          user,
          { cache: 'no-store' },
        ),
        apiFetch<SystemPerformanceResponse>(
          `/api/analytics/system-performance?from=${fromStr}&to=${toStr}`,
          user,
          { cache: 'no-store' },
        ),
      ]);

      // Map water-usage response to chart data
      const flushCounts: FlushCountData[] = (waterRes.data ?? []).map((d) => ({
        date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
        count: d.flushCount,
      }));

      const waterVolume: VolumeData[] = (waterRes.data ?? []).map((d) => ({
        date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
        liters: d.totalVolume,
      }));

      // Map flush-patterns → hourly usage
      const hourlyUsage: HourlyData[] = (patternsRes.data?.byHour ?? []).map(
        (b) => ({
          hour: b.label,
          count: b.count,
        }),
      );

      // UV stats from dashboard
      const completedUV = dashboardRes.data.uvCompletionRate;
      const rawUvStats = dashboardRes.data.uvStats;
      const uvStats: UvData[] =
        typeof completedUV === 'number' && rawUvStats && rawUvStats.total > 0
          ? [
              { name: 'Completed', value: completedUV },
              { name: 'Failed', value: Math.max(0, 100 - completedUV) },
            ]
          : [];

      // Uptime stats from system-performance daily breakdown
      const dailyPerf = perfRes.data.daily ?? [];
      const uptimeStats: UptimeData[] =
        dailyPerf.length > 0
          ? dailyPerf.map((d) => ({
              date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
              uptime: d.uptimePercent,
            }))
          : flushCounts.map((f) => ({
              date: f.date,
              uptime: perfRes.data.uptimePercent,
            }));

      setData({
        summary: {
          totalFlushes: dashboardRes.data.totalFlushes,
          totalWater: dashboardRes.data.totalWaterLiters,
          uvCompletion: dashboardRes.data.uvCompletionRate,
          uvTotal: rawUvStats?.total ?? 0,
          uvCompleted: rawUvStats?.completed ?? 0,
          uvFailed: rawUvStats?.failed ?? 0,
          avgFlushesPerDay: dashboardRes.data.avgFlushesPerDay,
          systemUptime: perfRes.data.uptimePercent,
          liveSnapshotUptime: perfRes.data.liveSnapshotPercent,
        },
        charts: {
          flushCounts,
          waterVolume,
          uvStats,
          hourlyUsage,
          uptimeStats,
        },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, fromTime, toTime]);

  useEffect(() => {
    void fetchAnalytics(true);

    const intervalId = window.setInterval(() => {
      void fetchAnalytics(false);
    }, ANALYTICS_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchAnalytics]);

  return { data, loading, error };
}
