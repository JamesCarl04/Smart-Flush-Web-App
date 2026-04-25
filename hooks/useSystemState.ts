'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

type SystemState = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

interface SensorReading {
  sensorType: string;
  value: number;
  timestamp: { _seconds: number };
}

/**
 * Derives the current system state from the most recent sensor/event reading.
 */
export function useSystemState(deviceId = 'toilet-01') {
  const { user } = useAuth();
  const [systemState, setSystemState] = useState<SystemState>('standby');
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiFetch<{ success: boolean; data: SensorReading[] }>(
        `/api/sensors/${deviceId}/readings?from=${today}`,
        user,
      );

      if (res.success && res.data && res.data.length > 0) {
        const latest = res.data[res.data.length - 1];
        switch (latest.sensorType) {
          case 'waterflow':
            setSystemState('flushing');
            break;
          default:
            setSystemState('standby');
        }
      } else {
        setSystemState('standby');
      }
    } catch {
      // Silently fall back to standby (device may not exist yet)
      setSystemState('standby');
    } finally {
      setLoading(false);
    }
  }, [user, deviceId]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10_000);
    return () => clearInterval(interval);
  }, [fetchState]);

  return { systemState, loading };
}
