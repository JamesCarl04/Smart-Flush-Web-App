'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';
import { ACTIVE_WATERFLOW_THRESHOLD } from '@/lib/device-constants';
import {
  getReadingTimestampMillis,
  isFreshSensorReadingTimestamp,
  type SensorTimestampLike,
} from '@/lib/sensor-freshness';

type SystemState = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

interface SensorReading {
  sensorType: string;
  value: number;
  timestamp?: SensorTimestampLike;
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

        const today = new Date(Date.now() + 8 * 3_600_000)
          .toISOString()
          .slice(0, 10);
        const response = await apiFetch<{
          success: boolean;
          data: SensorReading[];
        }>(`/api/sensors/${deviceId}/readings?from=${today}`, user);

        if (response.success && response.data && response.data.length > 0) {
          const latest = response.data[response.data.length - 1];
          const timestampMillis = getReadingTimestampMillis(latest.timestamp);
          const isFresh = isFreshSensorReadingTimestamp(timestampMillis);

          if (
            isFresh &&
            latest.sensorType === 'waterflow' &&
            typeof latest.value === 'number' &&
            Number.isFinite(latest.value) &&
            latest.value > ACTIVE_WATERFLOW_THRESHOLD
          ) {
            setSystemState('flushing');
          } else if (
            isFresh &&
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
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void fetchState(false);
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [fetchState]);

  return { systemState, loading };
}
