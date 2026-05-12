'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';

export type ActivityEvent = {
  id: string;
  type: 'lidEvent' | 'flushEvent' | 'uvCycle';
  timestamp: Date;
  details: string;
};

interface SensorReading {
  id: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: { _seconds: number };
}

function mapReadingToActivity(reading: SensorReading): ActivityEvent {
  switch (reading.sensorType) {
    case 'waterflow':
      return {
        id: reading.id,
        type: 'flushEvent',
        timestamp: new Date(reading.timestamp._seconds * 1000),
        details: `Flush: ${reading.value} ${reading.unit}`,
      };
    case 'ultrasonic':
      return {
        id: reading.id,
        type: 'lidEvent',
        timestamp: new Date(reading.timestamp._seconds * 1000),
        details: `Distance: ${reading.value} ${reading.unit}`,
      };
    default:
      return {
        id: reading.id,
        type: 'uvCycle',
        timestamp: new Date(reading.timestamp._seconds * 1000),
        details: `${reading.sensorType}: ${reading.value} ${reading.unit}`,
      };
  }
}

export function useActivityFeed(deviceId = 'toilet-01') {
  const { user, loading: authLoading } = useAuth();
  const presentationMode = usePresentationMode();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(
    async (showLoading = false) => {
      if (presentationMode) {
        const now = Date.now();
        setEvents([
          {
            id: 'demo-1',
            type: 'flushEvent',
            timestamp: new Date(now - 2 * 60 * 1000),
            details: 'Flush: 2.5 L',
          },
          {
            id: 'demo-2',
            type: 'lidEvent',
            timestamp: new Date(now - 6 * 60 * 1000),
            details: 'Distance: 24 cm',
          },
          {
            id: 'demo-3',
            type: 'uvCycle',
            timestamp: new Date(now - 12 * 60 * 1000),
            details: 'uv: 30 s',
          },
        ]);
        setLoading(false);
        return;
      }

      if (authLoading) {
        return;
      }

      if (!user) {
        setEvents([]);
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

        if (response.success && response.data) {
          const recent = response.data.slice(-20).reverse();
          setEvents(recent.map(mapReadingToActivity));
        } else {
          setEvents([]);
        }
      } catch (error) {
        console.warn('[useActivityFeed] feed request failed:', error);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [authLoading, deviceId, presentationMode, user],
  );

  useEffect(() => {
    void fetchFeed(true);
    const interval = window.setInterval(() => {
      void fetchFeed(false);
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [fetchFeed]);

  return { events, loading };
}
