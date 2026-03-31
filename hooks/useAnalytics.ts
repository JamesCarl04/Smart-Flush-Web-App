"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api-client";
import { format } from "date-fns";

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
    uvCompletion: number;
    avgFlushesPerDay: number;
    systemUptime: number;
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
    uvCompletionRate: number;
    avgFlushesPerDay: number;
    uptimePercent: number;
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
    onlineCount: number;
    totalCount: number;
  };
}

export function useAnalytics(range: DateRange) {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const fromStr = format(new Date(fromTime), 'yyyy-MM-dd');
      const toStr = format(new Date(toTime), 'yyyy-MM-dd');

      const [dashboardRes, waterRes, patternsRes, perfRes] = await Promise.all([
        apiFetch<DashboardResponse>('/api/analytics/dashboard', user),
        apiFetch<WaterUsageResponse>(`/api/analytics/water-usage?from=${fromStr}&to=${toStr}`, user),
        apiFetch<FlushPatternsResponse>('/api/analytics/flush-patterns', user),
        apiFetch<SystemPerformanceResponse>('/api/analytics/system-performance', user),
      ]);

      // Map water-usage response to chart data
      const flushCounts: FlushCountData[] = (waterRes.data ?? []).map(d => ({
        date: format(new Date(d.date), 'MMM dd'),
        count: d.flushCount,
      }));

      const waterVolume: VolumeData[] = (waterRes.data ?? []).map(d => ({
        date: format(new Date(d.date), 'MMM dd'),
        liters: d.totalVolume,
      }));

      // Map flush-patterns → hourly usage
      const hourlyUsage: HourlyData[] = (patternsRes.data?.byHour ?? []).map(b => ({
        hour: b.label,
        count: b.count,
      }));

      // UV stats from dashboard
      const completedUV = dashboardRes.data.uvCompletionRate;
      const uvStats: UvData[] = [
        { name: 'Completed', value: completedUV },
        { name: 'Failed', value: Math.max(0, 100 - completedUV) },
      ];

      // Uptime stats: single-entry from system-performance
      const uptimeStats: UptimeData[] = flushCounts.map(f => ({
        date: f.date,
        uptime: perfRes.data.uptimePercent,
      }));

      setData({
        summary: {
          totalFlushes: dashboardRes.data.totalFlushes,
          totalWater: dashboardRes.data.totalWaterLiters,
          uvCompletion: dashboardRes.data.uvCompletionRate,
          avgFlushesPerDay: dashboardRes.data.avgFlushesPerDay,
          systemUptime: perfRes.data.uptimePercent,
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
      const message = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, fromTime, toTime]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { data, loading, error };
}
