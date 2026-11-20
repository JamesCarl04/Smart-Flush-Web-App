'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { buildPredictiveMaintenanceSummary } from '@/lib/predictive-maintenance';
import { formatMonthDayLabel, toPhtIsoDate } from '@/lib/uv-cycle-analytics';
import type { PredictiveMaintenanceSummary } from '@/types';
import { subDays } from 'date-fns';

export type DateRange = {
  from: Date;
  to: Date;
};

export type FlushCountData = { date: string; count: number };
export type VolumeData = { date: string; liters: number };
export type HourlyData = { hour: string; count: number };
export type WeekdayData = { day: string; count: number };
export type UptimeData = { date: string; uptime: number };
export type UptimeSource = 'tracked' | 'telemetry_fallback' | 'live_snapshot';
export type UptimeDayStatus = 'tracked' | 'active_only' | 'unmonitored';

export type UptimeLogDay = {
  date: string; // YYYY-MM-DD (PHT)
  label: string; // e.g. Nov 19
  uptimePercent: number | null;
  onlineMinutes: number;
  totalMinutes: number;
  offlineMinutes: number;
  status: UptimeDayStatus;
};

export type UptimeSummary = {
  source: UptimeSource;
  trackedAvailabilityPercent: number | null;
  totalOnlineMinutes: number;
  totalTrackedMinutes: number;
  totalOfflineMinutes: number;
  monitoredDays: number;
  activeTelemetryDays: number;
  unmonitoredDays: number;
  windowDays: number;
};

export type AnalyticsData = {
  summary: {
    totalFlushes: number;
    totalWater: number;
    uvCompletion: number | null;
    uvTotal?: number;
    uvCompleted?: number;
    uvFailed?: number;
    avgFlushesPerDay: number;
    avgFlushesPerWindowDay?: number;
    avgLitersPerFlush?: number;
    windowDays?: number;
    activeDays?: number;
    systemUptime: number | null;
    uptimeSource?: UptimeSource;
    uptimeSummary?: UptimeSummary;
    liveSnapshotUptime?: number;
  };
  charts: {
    flushCounts: FlushCountData[];
    waterVolume: VolumeData[];
    hourlyUsage: HourlyData[];
    weekdayUsage: WeekdayData[];
    uptimeStats: UptimeData[];
    uptimeLogs: UptimeLogDay[];
  };
  predictive: PredictiveMaintenanceSummary | null;
  degraded?: boolean;
};

// API response interfaces
interface DashboardResponse {
  success: boolean;
  degraded?: boolean;
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
    avgFlushesPerWindowDay?: number;
    avgLitersPerFlush?: number;
    windowDays?: number;
    activeDays?: number;
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
  degraded?: boolean;
  error?: string;
  data?: WaterUsageDay[];
}

interface PatternBucket {
  label: string;
  count: number;
}

interface FlushPatternsResponse {
  success: boolean;
  degraded?: boolean;
  error?: string;
  data?: { byDay: PatternBucket[]; byHour: PatternBucket[] };
}

interface SystemPerformanceResponse {
  success: boolean;
  degraded?: boolean;
  error?: string;
  data?: {
    uptimePercent: number;
    uptimeSource?: UptimeSource;
    liveSnapshotPercent?: number;
    onlineCount: number;
    totalCount: number;
    daily?: Array<{ date: string; uptimePercent: number }>;
    uptimeLogs?: Array<{
      date: string;
      uptimePercent: number | null;
      onlineMinutes: number;
      totalMinutes: number;
      offlineMinutes: number;
      status: UptimeDayStatus;
    }>;
    uptimeSummary?: UptimeSummary;
    predictiveMaintenance?: PredictiveMaintenanceSummary;
  };
}

const ANALYTICS_REFRESH_MS = 60_000;

function buildPresentationAnalytics(): AnalyticsData {
  const now = new Date();
  const dailySeed = [
    { offset: 6, flushes: 18, liters: 21.4, uptime: 99.1 },
    { offset: 5, flushes: 22, liters: 25.8, uptime: 99.6 },
    { offset: 4, flushes: 19, liters: 22.6, uptime: 98.9 },
    { offset: 3, flushes: 26, liters: 30.2, uptime: 99.8 },
    { offset: 2, flushes: 24, liters: 27.9, uptime: 99.4 },
    { offset: 1, flushes: 28, liters: 32.4, uptime: 99.7 },
    { offset: 0, flushes: 17, liters: 19.8, uptime: 99.9 },
  ];

  const historicalDaily = dailySeed.map((row) => {
    const day = subDays(now, row.offset);
    const isoDate = toPhtIsoDate(day.getTime());
    return {
      date: isoDate,
      label: formatMonthDayLabel(isoDate),
      flushCount: row.flushes,
      waterLiters: row.liters,
      uptime: row.uptime,
    };
  });

  const totalFlushes = historicalDaily.reduce((sum, d) => sum + d.flushCount, 0);
  const totalWater = Math.round(
    historicalDaily.reduce((sum, d) => sum + d.waterLiters, 0) * 10,
  ) / 10;

  const hourlyUsage: HourlyData[] = [
    { hour: '06:00', count: 6 },
    { hour: '08:00', count: 18 },
    { hour: '10:00', count: 24 },
    { hour: '12:00', count: 34 },
    { hour: '14:00', count: 28 },
    { hour: '16:00', count: 26 },
    { hour: '18:00', count: 12 },
    { hour: '20:00', count: 6 },
  ];

  const flushSamples = Array.from({ length: 18 }, (_, i) => ({
    waterVolume: 1.18 + ((i % 3) - 1) * 0.04,
    duration: 7.8 + (i % 4) * 0.1,
    timestampMs: now.getTime() - (18 - i) * 3_600_000,
  }));

  const ultrasonicSamples = Array.from({ length: 24 }, (_, i) => ({
    value: 24 + ((i * 7) % 5) - 2,
    timestampMs: now.getTime() - (24 - i) * 1_800_000,
  }));

  const predictive = buildPredictiveMaintenanceSummary({
    deviceId: DEFAULT_DEVICE_ID,
    rawCounters: {
      uvOnTimeSeconds: 24_600,
      lidCycleCount: 412,
      flowSensorTotalLiters: 184.5,
      pumpTotalLiters: 318.0,
      relayTotalTriggers: 428,
      ultrasonicConsecutiveFailures: 0,
      flushCycleCount: 412,
    },
    windowDays: 7,
    observedWindowTotals: {
      flushes: totalFlushes,
      waterLiters: totalWater,
    },
    flushSamples,
    ultrasonicSamples,
    historicalDaily: historicalDaily.map((d) => ({
      date: d.date,
      flushCount: d.flushCount,
      waterLiters: d.waterLiters,
    })),
    incidents: [
      {
        deviceId: 'toilet-01',
        timestampMs: now.getTime() - 2 * 86_400_000,
        source: 'task',
        category: 'water_overuse',
      },
      {
        deviceId: 'SDCA-FL4-M1',
        timestampMs: now.getTime() - 86_400_000,
        source: 'issue_report',
        category: 'continuous_leak',
      },
    ],
  });

  const presentationUptimeLogs: UptimeLogDay[] = historicalDaily.map((d) => {
    const totalMinutes = 1440;
    const onlineMinutes = Math.round((d.uptime / 100) * totalMinutes);
    return {
      date: d.date,
      label: d.label,
      uptimePercent: d.uptime,
      onlineMinutes,
      totalMinutes,
      offlineMinutes: totalMinutes - onlineMinutes,
      status: 'tracked',
    };
  });
  const presOnlineMin = presentationUptimeLogs.reduce(
    (s, r) => s + r.onlineMinutes,
    0,
  );
  const presTrackedMin = presentationUptimeLogs.reduce(
    (s, r) => s + r.totalMinutes,
    0,
  );

  return {
    summary: {
      totalFlushes,
      totalWater,
      uvCompletion: 98.4,
      uvTotal: 154,
      uvCompleted: 151,
      uvFailed: 3,
      avgFlushesPerDay: Math.round((totalFlushes / 7) * 10) / 10,
      avgFlushesPerWindowDay: Math.round((totalFlushes / 7) * 10) / 10,
      avgLitersPerFlush: Math.round((totalWater / totalFlushes) * 100) / 100,
      windowDays: 7,
      activeDays: 7,
      systemUptime: 99.5,
      uptimeSource: 'tracked',
      uptimeSummary: {
        source: 'tracked',
        trackedAvailabilityPercent: 99.5,
        totalOnlineMinutes: presOnlineMin,
        totalTrackedMinutes: presTrackedMin,
        totalOfflineMinutes: presTrackedMin - presOnlineMin,
        monitoredDays: 7,
        activeTelemetryDays: 7,
        unmonitoredDays: 0,
        windowDays: 7,
      },
      liveSnapshotUptime: 100,
    },
    charts: {
      flushCounts: historicalDaily.map((d) => ({
        date: d.label,
        count: d.flushCount,
      })),
      waterVolume: historicalDaily.map((d) => ({
        date: d.label,
        liters: d.waterLiters,
      })),
      hourlyUsage,
      weekdayUsage: [
        { day: 'Sunday', count: 14 },
        { day: 'Monday', count: 24 },
        { day: 'Tuesday', count: 26 },
        { day: 'Wednesday', count: 22 },
        { day: 'Thursday', count: 28 },
        { day: 'Friday', count: 24 },
        { day: 'Saturday', count: 16 },
      ],
      uptimeStats: historicalDaily.map((d) => ({
        date: d.label,
        uptime: d.uptime,
      })),
      uptimeLogs: presentationUptimeLogs,
    },
    predictive,
    degraded: false,
  };
}

export function useAnalytics(range: DateRange) {
  const { user } = useAuth();
  const presentationMode = usePresentationMode();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();

  const fetchAnalytics = useCallback(async (showLoading = false) => {
    if (presentationMode) {
      setData(buildPresentationAnalytics());
      setError(null);
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const fromStr = toPhtIsoDate(fromTime);
      const toStr = toPhtIsoDate(toTime);

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
          `/api/analytics/system-performance?from=${fromStr}&to=${toStr}&includeCampusRisk=false`,
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

      // Map water-usage response to chart data using deterministic PHT/UTC date formatting
      const flushCounts: FlushCountData[] = waterDays.map((d) => ({
        date: formatMonthDayLabel(d.date),
        count: d.flushCount,
      }));

      const waterVolume: VolumeData[] = waterDays.map((d) => ({
        date: formatMonthDayLabel(d.date),
        liters: d.totalVolume,
      }));

      // Map flush-patterns -> hourly & weekday usage
      const hourlyUsage: HourlyData[] = (patternsData?.byHour ?? []).map(
        (b) => ({
          hour: b.label,
          count: b.count,
        }),
      );
      const weekdayUsage: WeekdayData[] = (patternsData?.byDay ?? []).map(
        (b) => ({
          day: b.label,
          count: b.count,
        }),
      );

      // UV stats from dashboard (null-safe if dashboard query degraded)
      const completedUV = dashData?.uvCompletionRate ?? null;
      const rawUvStats = dashData?.uvStats;

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
              date: formatMonthDayLabel(d.date),
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
      const resolvedTotalFlushes = dashData?.totalFlushes ?? waterTotalFlushes;
      const resolvedTotalWater = dashData?.totalWaterLiters ?? waterTotalLiters;
      const resolvedWindowDays =
        dashData?.windowDays ?? Math.max(1, dailyPerf.length || waterDays.length || 1);
      const resolvedActiveDays =
        dashData?.activeDays ??
        waterDays.filter((d) => d.flushCount > 0 || d.totalVolume > 0).length;
      const resolvedAvgPerWindowDay =
        dashData?.avgFlushesPerWindowDay ??
        Math.round((resolvedTotalFlushes / resolvedWindowDays) * 100) / 100;
      const resolvedAvgLitersPerFlush =
        dashData?.avgLitersPerFlush ??
        (resolvedTotalFlushes > 0
          ? Math.round((resolvedTotalWater / resolvedTotalFlushes) * 100) / 100
          : 0);

      const predictiveFallback = buildPredictiveMaintenanceSummary({
        deviceId: DEFAULT_DEVICE_ID,
        rawCounters: null,
        windowDays: resolvedWindowDays,
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

      const isDegraded = Boolean(
        dashboardRes?.degraded ||
          waterRes?.degraded ||
          patternsRes?.degraded ||
          perfRes?.degraded,
      );

      const uptimeLogs: UptimeLogDay[] =
        perfData?.uptimeLogs && perfData.uptimeLogs.length > 0
          ? perfData.uptimeLogs.map((row) => ({
              ...row,
              label: formatMonthDayLabel(row.date),
            }))
          : dailyPerf.map((d) => ({
              date: d.date,
              label: formatMonthDayLabel(d.date),
              uptimePercent: d.uptimePercent > 0 ? d.uptimePercent : null,
              onlineMinutes: 0,
              totalMinutes: 0,
              offlineMinutes: 0,
              status: d.uptimePercent > 0 ? 'active_only' : 'unmonitored',
            }));

      const resolvedUptimeSummary: UptimeSummary | undefined =
        perfData?.uptimeSummary ??
        (uptimeLogs.length > 0
          ? {
              source: perfData?.uptimeSource ?? 'telemetry_fallback',
              trackedAvailabilityPercent: null,
              totalOnlineMinutes: 0,
              totalTrackedMinutes: 0,
              totalOfflineMinutes: 0,
              monitoredDays: 0,
              activeTelemetryDays: uptimeLogs.filter(
                (r) => r.status !== 'unmonitored',
              ).length,
              unmonitoredDays: uptimeLogs.filter(
                (r) => r.status === 'unmonitored',
              ).length,
              windowDays: uptimeLogs.length,
            }
          : undefined);

      setData({
        summary: {
          totalFlushes: resolvedTotalFlushes,
          totalWater: resolvedTotalWater,
          uvCompletion: completedUV,
          uvTotal: rawUvStats?.total ?? 0,
          uvCompleted: rawUvStats?.completed ?? 0,
          uvFailed: rawUvStats?.failed ?? 0,
          avgFlushesPerDay: dashData?.avgFlushesPerDay ?? 0,
          avgFlushesPerWindowDay: resolvedAvgPerWindowDay,
          avgLitersPerFlush: resolvedAvgLitersPerFlush,
          windowDays: resolvedWindowDays,
          activeDays: resolvedActiveDays,
          systemUptime: fallbackUptime,
          uptimeSource: perfData?.uptimeSource,
          uptimeSummary: resolvedUptimeSummary,
          liveSnapshotUptime:
            perfData?.liveSnapshotPercent ?? dashData?.liveSnapshotPercent ?? 0,
        },
        charts: {
          flushCounts,
          waterVolume,
          hourlyUsage,
          weekdayUsage,
          uptimeStats,
          uptimeLogs,
        },
        predictive: perfData?.predictiveMaintenance ?? predictiveFallback,
        degraded: isDegraded,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [presentationMode, user, fromTime, toTime]);

  useEffect(() => {
    void fetchAnalytics(true);
    if (presentationMode) {
      return;
    }

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
  }, [fetchAnalytics, presentationMode]);

  const refetch = useCallback(() => fetchAnalytics(false), [fetchAnalytics]);

  return { data, loading, error, refetch };
}
