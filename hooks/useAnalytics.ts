'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { buildPredictiveMaintenanceSummary } from '@/lib/predictive-maintenance';
import type { PredictiveMaintenanceSummary } from '@/types';
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
    systemUptime: number | null;
    liveSnapshotUptime?: number;
  };
  charts: {
    flushCounts: FlushCountData[];
    waterVolume: VolumeData[];
    uvStats: UvData[];
    hourlyUsage: HourlyData[];
    uptimeStats: UptimeData[];
  };
  predictive: PredictiveMaintenanceSummary | null;
};

// API response interfaces
interface DashboardResponse {
  success: boolean;
  error?: string;
  data?: {
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
  error?: string;
  data?: WaterUsageDay[];
}

interface PatternBucket {
  label: string;
  count: number;
}

interface FlushPatternsResponse {
  success: boolean;
  error?: string;
  data?: { byDay: PatternBucket[]; byHour: PatternBucket[] };
}

interface SystemPerformanceResponse {
  success: boolean;
  error?: string;
  data?: {
    uptimePercent: number;
    liveSnapshotPercent?: number;
    onlineCount: number;
    totalCount: number;
    daily?: Array<{ date: string; uptimePercent: number }>;
    predictiveMaintenance?: PredictiveMaintenanceSummary;
  };
}

const ANALYTICS_REFRESH_MS = 30_000;

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

      const dashData = dashboardRes?.data;
      const waterDays = waterRes?.data ?? [];
      const patternsData = patternsRes?.data;
      const perfData = perfRes?.data;

      if (!dashData && !perfData && !waterRes?.data && !patternsData) {
        throw new Error(
          dashboardRes?.error ||
            perfRes?.error ||
            waterRes?.error ||
            patternsRes?.error ||
            'Failed to load analytics data',
        );
      }

      // Map water-usage response to chart data
      const flushCounts: FlushCountData[] = waterDays.map((d) => ({
        date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
        count: d.flushCount,
      }));

      const waterVolume: VolumeData[] = waterDays.map((d) => ({
        date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
        liters: d.totalVolume,
      }));

      // Map flush-patterns → hourly usage
      const hourlyUsage: HourlyData[] = (patternsData?.byHour ?? []).map(
        (b) => ({
          hour: b.label,
          count: b.count,
        }),
      );

      // UV stats from dashboard (null-safe if dashboard query degraded)
      const completedUV = dashData?.uvCompletionRate ?? null;
      const rawUvStats = dashData?.uvStats;
      const uvStats: UvData[] =
        typeof completedUV === 'number' && rawUvStats && rawUvStats.total > 0
          ? [
              { name: 'Completed', value: completedUV },
              { name: 'Failed', value: Math.max(0, 100 - completedUV) },
            ]
          : [];

      // Uptime stats from system-performance daily breakdown
      const dailyPerf = perfData?.daily ?? [];
      const fallbackUptime =
        typeof perfData?.uptimePercent === 'number'
          ? perfData.uptimePercent
          : typeof dashData?.uptimePercent === 'number'
            ? dashData.uptimePercent
            : null;
      const uptimeStats: UptimeData[] =
        dailyPerf.length > 0
          ? dailyPerf.map((d) => ({
              date: format(new Date(`${d.date}T00:00:00`), 'MMM dd'),
              uptime: d.uptimePercent,
            }))
          : typeof fallbackUptime === 'number'
            ? flushCounts.map((f) => ({
                date: f.date,
                uptime: fallbackUptime,
              }))
            : [];

      const waterTotalFlushes = waterDays.reduce(
        (sum, d) => sum + d.flushCount,
        0,
      );
      const waterTotalLiters = waterDays.reduce(
        (sum, d) => sum + d.totalVolume,
        0,
      );

      const predictiveFallback = buildPredictiveMaintenanceSummary({
        deviceId: DEFAULT_DEVICE_ID,
        rawCounters: null,
        windowDays: Math.max(1, waterDays.length || 7),
        observedWindowTotals: {
          flushes: waterTotalFlushes,
          waterLiters: waterTotalLiters,
        },
        flushSamples: [],
        ultrasonicSamples: [],
        historicalDaily: waterDays.map((d) => ({
          date: d.date,
          flushCount: d.flushCount,
          waterLiters: d.totalVolume,
        })),
        incidents: [],
      });

      setData({
        summary: {
          totalFlushes: dashData?.totalFlushes ?? waterTotalFlushes,
          totalWater: dashData?.totalWaterLiters ?? waterTotalLiters,
          uvCompletion: completedUV,
          uvTotal: rawUvStats?.total ?? 0,
          uvCompleted: rawUvStats?.completed ?? 0,
          uvFailed: rawUvStats?.failed ?? 0,
          avgFlushesPerDay: dashData?.avgFlushesPerDay ?? 0,
          systemUptime: fallbackUptime,
          liveSnapshotUptime:
            perfData?.liveSnapshotPercent ?? dashData?.liveSnapshotPercent ?? 0,
        },
        charts: {
          flushCounts,
          waterVolume,
          uvStats,
          hourlyUsage,
          uptimeStats,
        },
        predictive: perfData?.predictiveMaintenance ?? predictiveFallback,
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
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void fetchAnalytics(false);
    }, ANALYTICS_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchAnalytics]);

  const refetch = useCallback(() => fetchAnalytics(false), [fetchAnalytics]);

  return { data, loading, error, refetch };
}
