'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';

type SystemState = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

interface SensorReading {
  sensorType: string;
  value: number;
  timestamp: { _seconds: number };
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
