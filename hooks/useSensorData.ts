'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

interface SensorReading {
  sensorType: string;
  value: number;
  unit: string;
  timestamp?: { _seconds?: number; seconds?: number } | null;
}

export function useSensorData(deviceId = 'toilet-01') {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{
    ultrasonicDistance: number;
    waterFlowRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSensors = useCallback(
    async (showLoading = false) => {
      if (authLoading) {
        return;
      }

      if (!user) {
        setData({ ultrasonicDistance: 0, waterFlowRate: 0 });
        setError(null);
        setLoading(false);
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        }

        setError(null);
        const today = new Date().toISOString().slice(0, 10);
        const response = await apiFetch<{
          success: boolean;
          data: SensorReading[];
        }>(`/api/sensors/${deviceId}/readings?from=${today}`, user);

        if (response.success && response.data) {
          const readings = response.data;
          const latestUltrasonic = [...readings]
            .reverse()
            .find((reading) => reading.sensorType === 'ultrasonic');
          const latestWaterflow = [...readings]
            .reverse()
            .find((reading) => reading.sensorType === 'waterflow');

          setData({
            ultrasonicDistance: latestUltrasonic?.value ?? 0,
            waterFlowRate: latestWaterflow?.value ?? 0,
          });
        } else {
          setData({ ultrasonicDistance: 0, waterFlowRate: 0 });
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
    [authLoading, deviceId, user],
  );

  useEffect(() => {
    void fetchSensors(true);
    const interval = window.setInterval(() => {
      void fetchSensors(false);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [fetchSensors]);

  return { ...data, loading, error };
}
