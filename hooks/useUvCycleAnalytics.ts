'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';
import {
  buildUvCycleAnalytics,
  toPhtIsoDate,
  type RawUvCycleRecord,
  type UvCycleAnalyticsPayload,
  type UvDayGranularity,
  type UvPeriod,
} from '@/lib/uv-cycle-analytics';

const LIVE_TODAY_POLL_MS = 5_000;
const BACKGROUND_PERIOD_POLL_MS = 30_000;

interface UvCycleApiResponse {
  success: boolean;
  error?: string;
  degraded?: boolean;
  data?: UvCycleAnalyticsPayload;
}

function buildPresentationUvRecords(nowMs: number): RawUvCycleRecord[] {
  const records: RawUvCycleRecord[] = [];
  // Deterministic 5-second UV cycle samples spread across recent days so all views work in demo mode
  const dayOffsets = [
    { daysAgo: 0, hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
    { daysAgo: 1, hours: [8, 9, 10, 12, 13, 14, 15, 16, 18, 22] },
    { daysAgo: 2, hours: [9, 10, 11, 13, 14, 16, 17] },
    { daysAgo: 4, hours: [8, 11, 12, 15, 16] },
    { daysAgo: 10, hours: [9, 12, 14, 16] },
    { daysAgo: 35, hours: [10, 13, 15] },
  ];

  let seq = 1;
  for (const daySpec of dayOffsets) {
    const baseDate = toPhtIsoDate(nowMs - daySpec.daysAgo * 86_400_000);
    for (const hour of daySpec.hours) {
      const cyclesInHour = (hour % 3) + 1;
      for (let i = 0; i < cyclesInHour; i++) {
        const minute = (i * 17 + (hour * 3)) % 55;
        const second = (seq * 13) % 58;
        const hh = String(hour).padStart(2, '0');
        const mm = String(minute).padStart(2, '0');
        const ss = String(second).padStart(2, '0');
        const tsMs = Date.parse(`${baseDate}T${hh}:${mm}:${ss}.000+08:00`);
        if (tsMs <= nowMs) {
          const isInterrupted = seq % 29 === 0;
          records.push({
            id: `demo-uv-${String(seq).padStart(3, '0')}`,
            deviceId: 'toilet-01',
            duration: isInterrupted ? 3 : 5,
            completed: !isInterrupted,
            reason: isInterrupted ? 'lid_opened' : null,
            timestampMs: tsMs,
          });
          seq += 1;
        }
      }
    }
  }
  return records;
}

export interface UseUvCycleAnalyticsParams {
  period: UvPeriod;
  anchorDate: string;
  granularity: UvDayGranularity;
  hourFilter: number | null;
}

export function useUvCycleAnalytics({
  period,
  anchorDate,
  granularity,
  hourFilter,
}: UseUvCycleAnalyticsParams) {
  const { user } = useAuth();
  const presentationMode = usePresentationMode();

  const [data, setData] = useState<UvCycleAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestTimestampMsRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const todayPht = toPhtIsoDate();
  const isLiveToday = period === 'day' && anchorDate === todayPht;

  const fetchUvAnalytics = useCallback(
    async (options: {
      showInitialLoader?: boolean;
      useSince?: boolean;
      forceRefresh?: boolean;
    } = {}) => {
      if (presentationMode) {
        const nowMs = Date.now();
        const demoPayload = buildUvCycleAnalytics({
          records: buildPresentationUvRecords(nowMs),
          period,
          anchorDate,
          granularity,
          hourFilter,
          nowMs,
        });
        latestTimestampMsRef.current = demoPayload.latestTimestampMs;
        setData(demoPayload);
        setDegraded(false);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }

      if (inFlightRef.current && !options.forceRefresh) {
        return;
      }

      inFlightRef.current = true;
      if (options.showInitialLoader) {
        setLoading(true);
      } else if (options.forceRefresh) {
        setRefreshing(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          period,
          date: anchorDate,
          granularity,
        });
        if (period === 'day' && hourFilter !== null) {
          params.set('hour', String(hourFilter));
        }
        if (options.useSince && latestTimestampMsRef.current !== null) {
          params.set('since', String(latestTimestampMsRef.current));
        }
        if (options.forceRefresh) {
          params.set('refresh', '1');
        }

        const res = await apiFetch<UvCycleApiResponse>(
          `/api/analytics/uv-cycles?${params.toString()}`,
          user,
          { cache: 'no-store' },
        );

        if (!res?.success || !res.data) {
          throw new Error(res?.error || 'Failed to load UV cycle analytics');
        }

        latestTimestampMsRef.current = res.data.latestTimestampMs;
        setData(res.data);
        setDegraded(Boolean(res.degraded));
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load UV cycle analytics';
        setError(msg);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [anchorDate, granularity, hourFilter, period, presentationMode, user],
  );

  useEffect(() => {
    void fetchUvAnalytics({ showInitialLoader: true, useSince: false });

    if (presentationMode) {
      return;
    }

    const pollMs = isLiveToday ? LIVE_TODAY_POLL_MS : BACKGROUND_PERIOD_POLL_MS;
    const intervalId = window.setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void fetchUvAnalytics({ showInitialLoader: false, useSince: true });
    }, pollMs);

    return () => window.clearInterval(intervalId);
  }, [fetchUvAnalytics, isLiveToday, presentationMode]);

  const refreshNow = useCallback(() => {
    void fetchUvAnalytics({
      showInitialLoader: false,
      useSince: true,
      forceRefresh: true,
    });
  }, [fetchUvAnalytics]);

  return {
    data,
    loading,
    refreshing,
    degraded,
    error,
    isLiveToday,
    todayPht,
    refreshNow,
  };
}
