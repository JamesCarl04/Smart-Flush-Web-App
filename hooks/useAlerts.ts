'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AlertEvent = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  timestamp: Date;
  acknowledged: boolean;
};

interface AlertDoc {
  id: string;
  type: string;
  message: string;
  severity: string;
  timestamp?: { _seconds?: number; seconds?: number } | null;
  acknowledged: boolean;
}

function createPresentationAlerts(): AlertEvent[] {
  const now = Date.now();
  return [
    {
      id: 'demo-alert-1',
      title: 'water_overuse',
      description:
        'SDCA Annex 4F Smart Unit (toilet-01) recorded 4.8 L/min sustained flow — exceeds 4.0 L/min threshold.',
      severity: 'high',
      timestamp: new Date(now - 9 * 60_000),
      acknowledged: false,
    },
    {
      id: 'demo-alert-2',
      title: 'maintenance_due',
      description:
        'Routine inspection interval reached (250 flush cycles since last deep sanitization check).',
      severity: 'medium',
      timestamp: new Date(now - 38 * 60_000),
      acknowledged: false,
    },
    {
      id: 'demo-alert-3',
      title: 'uv_cycle_failed',
      description:
        'UV-C sanitation cycle interrupted early by occupancy re-entry; automatic retry succeeded.',
      severity: 'low',
      timestamp: new Date(now - 2.5 * 3_600_000),
      acknowledged: true,
    },
    {
      id: 'demo-alert-4',
      title: 'ultrasonic_sensor_fault',
      description:
        'Brief HC-SR04 echo spike filtered out by median calibration buffer — nominal readings restored.',
      severity: 'low',
      timestamp: new Date(now - 6 * 3_600_000),
      acknowledged: true,
    },
  ];
}

export function useAlerts() {
  const { user } = useAuth();
  const presentationMode = usePresentationMode();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(
    async (isInitial = false) => {
      if (presentationMode) {
        setAlerts((prev) => (prev.length > 0 ? prev : createPresentationAlerts()));
        setLoading(false);
        return;
      }
      if (!user) return;
      try {
        if (isInitial) {
          setLoading(true);
        }
        const res = await apiFetch<{ success: boolean; data: AlertDoc[] }>(
          '/api/alerts',
          user,
        );
        if (res.success && res.data) {
          setAlerts(
            res.data.map((a) => ({
              id: a.id,
              title: a.type,
              description: a.message,
              severity: (a.severity as AlertSeverity) ?? 'low',
              timestamp: new Date(
                (a.timestamp?._seconds ?? a.timestamp?.seconds ?? 0) * 1000,
              ),
              acknowledged: a.acknowledged,
            })),
          );
        }
      } catch (err) {
        console.warn('[useAlerts] alerts request failed:', err);
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    },
    [presentationMode, user],
  );

  useEffect(() => {
    void fetchAlerts(true);
    if (presentationMode) return;
    const interval = window.setInterval(() => {
      void fetchAlerts(false);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [fetchAlerts, presentationMode]);

  const acknowledgeAlerts = async (ids: string[]) => {
    if (presentationMode && ids.length > 0) {
      setAlerts((prev) =>
        prev.map((a) => (ids.includes(a.id) ? { ...a, acknowledged: true } : a)),
      );
      return true;
    }
    if (!user || ids.length === 0) return false;

    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/alerts/${id}/acknowledge`, user, {
            method: 'POST',
          }),
        ),
      );
      await fetchAlerts();
      return true;
    } catch {
      return false;
    }
  };

  const acknowledgeAlert = async (id: string | 'ALL') => {
    if (presentationMode) {
      setAlerts((prev) =>
        prev.map((a) =>
          id === 'ALL' || a.id === id ? { ...a, acknowledged: true } : a,
        ),
      );
      return true;
    }
    if (!user) return false;
    try {
      if (id === 'ALL') {
        await apiFetch('/api/alerts/acknowledge-all', user, { method: 'POST' });
      } else {
        await apiFetch(`/api/alerts/${id}/acknowledge`, user, {
          method: 'POST',
        });
      }
      // Refresh from server
      await fetchAlerts();
      return true;
    } catch {
      return false;
    }
  };

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  return {
    alerts,
    unreadCount,
    loading,
    acknowledgeAlerts,
    acknowledgeAlert,
    refresh: fetchAlerts,
  };
}
