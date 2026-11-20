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

interface SensorReading {
  sensorType: string;
  value: number;
  unit: string;
  timestamp?: SensorTimestampLike;
}

export function useSensorData(deviceId = 'toilet-01') {
  const { user, loading: authLoading } = useAuth();
  const presentationMode = usePresentationMode();
  const [data, setData] = useState<{
    ultrasonicDistance: number;
    waterFlowRate: number;
    waterFlowUpdatedAt?: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSensors = useCallback(
    async (showLoading = false) => {
      if (presentationMode) {
        const now = new Date();
        const distanceOffset = now.getSeconds() % 4;
        const waterOffset = (now.getSeconds() % 3) * 0.1;

        setData({
          ultrasonicDistance: 22 + distanceOffset,
          waterFlowRate: 2.4 + waterOffset,
          waterFlowUpdatedAt: undefined,
        });
        setError(null);
        setLoading(false);
        return;
      }

      if (authLoading) {
        return;
      }

      if (!user) {
        setData({
          ultrasonicDistance: 0,
          waterFlowRate: 0,
          waterFlowUpdatedAt: null,
        });
        setError(null);
        setLoading(false);
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        }

        setError(null);
        const today = new Date(Date.now() + 8 * 3_600_000)
          .toISOString()
          .slice(0, 10);
        const response = await apiFetch<{
          success: boolean;
          data: SensorReading[];
        }>(`/api/sensors/${deviceId}/readings?from=${today}`, user);

        if (response.success && response.data) {
          const readings = response.data;
          const reversed = [...readings].reverse();
          const latestUltrasonic =
            reversed.find(
              (reading) =>
                reading.sensorType === 'ultrasonic' && reading.value > 0,
            ) ??
            reversed.find((reading) => reading.sensorType === 'ultrasonic');
          const latestWaterflow = reversed.find(
            (reading) => reading.sensorType === 'waterflow',
          );
          const latestWaterflowMs = getReadingTimestampMillis(
            latestWaterflow?.timestamp,
          );
          const hasFreshActiveFlow =
            latestWaterflow != null &&
            typeof latestWaterflow.value === 'number' &&
            Number.isFinite(latestWaterflow.value) &&
            latestWaterflow.value > ACTIVE_WATERFLOW_THRESHOLD &&
            isFreshSensorReadingTimestamp(latestWaterflowMs);

          setData({
            ultrasonicDistance: latestUltrasonic?.value ?? 0,
            waterFlowRate: hasFreshActiveFlow ? latestWaterflow.value : 0,
            waterFlowUpdatedAt: hasFreshActiveFlow ? latestWaterflowMs : null,
          });
        } else {
          setData({
            ultrasonicDistance: 0,
            waterFlowRate: 0,
            waterFlowUpdatedAt: null,
          });
        }
      } catch (err: unknown) {
        console.warn('[useSensorData] sensor request failed:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load sensor data',
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [authLoading, deviceId, presentationMode, user],
  );

  useEffect(() => {
    void fetchSensors(true);
    const interval = window.setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void fetchSensors(false);
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [fetchSensors]);

  return { ...data, loading, error };
}
