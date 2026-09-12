'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';

type SystemState = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

interface SensorReading {
  sensorType: string;
  value: number;
  timestamp?:
    | { _seconds?: number; seconds?: number }
    | string
    | number
    | null;
}

function getReadingTimestampMillis(timestamp: unknown): number {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') {
    return timestamp > 1e11 ? timestamp : timestamp * 1000;
  }
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof timestamp === 'object') {
    if (
      'toMillis' in timestamp &&
      typeof (timestamp as { toMillis: () => number }).toMillis === 'function'
    ) {
      return (timestamp as { toMillis: () => number }).toMillis();
    }
    const seconds =
      ('_seconds' in timestamp &&
        typeof (timestamp as { _seconds: unknown })._seconds === 'number' &&
        (timestamp as { _seconds: number })._seconds) ||
      ('seconds' in timestamp &&
        typeof (timestamp as { seconds: unknown }).seconds === 'number' &&
        (timestamp as { seconds: number }).seconds) ||
      0;
    return seconds * 1000;
  }
  return 0;
}

export function useSystemState(deviceId = 'toilet-01') {
  const { user, loading: authLoading } = useAuth();
  const presentationMode = usePresentationMode();
  const [systemState, setSystemState] = useState<SystemState>('standby');
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(
    async (showLoading = false) => {
      if (presentationMode) {
        setSystemState('standby');
        setLoading(false);
        return;
      }

      if (authLoading) {
        return;
      }

      if (!user) {
        setSystemState('standby');
        setLoading(false);
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        }

        const today = new Date().toISOString().slice(0, 10);
        const response = await apiFetch<{
          success: boolean;
          data: SensorReading[];
        }>(`/api/sensors/${deviceId}/readings?from=${today}`, user);

        if (response.success && response.data && response.data.length > 0) {
          const latest = response.data[response.data.length - 1];
          const timestampMillis = getReadingTimestampMillis(latest.timestamp);
          const age = Date.now() - timestampMillis;
          const isStale =
            timestampMillis === 0 || age > 15_000 || age < -15_000;

          if (!isStale && latest.sensorType === 'waterflow') {
            setSystemState('flushing');
          } else if (
            !isStale &&
            (latest.sensorType === 'uv' || latest.sensorType === 'uv_active')
          ) {
            setSystemState('uv_active');
          } else {
            setSystemState('standby');
          }
        } else {
          setSystemState('standby');
        }
      } catch {
        // Keep the last known state on transient fetch failures.
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [authLoading, deviceId, presentationMode, user],
  );

  useEffect(() => {
    void fetchState(true);
    const interval = window.setInterval(() => {
      void fetchState(false);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [fetchState]);

  return { systemState, loading };
}
