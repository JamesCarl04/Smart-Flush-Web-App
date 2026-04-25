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
  const { user } = useAuth();
  const [data, setData] = useState<{
    ultrasonicDistance: number;
    waterFlowRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSensors = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiFetch<{ success: boolean; data: SensorReading[] }>(
        `/api/sensors/${deviceId}/readings?from=${today}`,
        user,
      );

      if (res.success && res.data) {
        // Find the latest ultrasonic and waterflow readings
        const readings = res.data;
        const latestUltrasonic = [...readings]
          .reverse()
          .find((r) => r.sensorType === 'ultrasonic');
        const latestWaterflow = [...readings]
          .reverse()
          .find((r) => r.sensorType === 'waterflow');

        setData({
          ultrasonicDistance: latestUltrasonic?.value ?? 0,
          waterFlowRate: latestWaterflow?.value ?? 0,
        });
      }
    } catch (err: unknown) {
      console.warn('[useSensorData] sensor request failed:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load sensor data',
      );
      setData({ ultrasonicDistance: 0, waterFlowRate: 0 });
    } finally {
      setLoading(false);
    }
  }, [user, deviceId]);

  useEffect(() => {
    fetchSensors();
    // Poll every 10 seconds for near-real-time updates
    const interval = setInterval(fetchSensors, 10_000);
    return () => clearInterval(interval);
  }, [fetchSensors]);

  return { ...data, loading, error };
}
