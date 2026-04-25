'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
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

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
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
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const acknowledgeAlert = async (id: string | 'ALL') => {
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
    acknowledgeAlert,
    refresh: fetchAlerts,
  };
}
