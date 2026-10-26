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
  timestamp:
    | { _seconds?: number; seconds?: number }
    | number
    | string
    | null
    | undefined;
}

function toActivityDate(timestamp: SensorReading['timestamp']): Date {
  if (typeof timestamp === 'number') {
    return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  }
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (timestamp && typeof timestamp === 'object') {
    const sec = timestamp._seconds ?? timestamp.seconds;
    if (typeof sec === 'number') return new Date(sec * 1000);
  }
  return new Date();
}

function mapReadingToActivity(reading: SensorReading): ActivityEvent {
  const eventTime = toActivityDate(reading.timestamp);
  switch (reading.sensorType) {
    case 'waterflow':
      return {
        id: reading.id,
        type: 'flushEvent',
        timestamp: eventTime,
        details: `Flush: ${reading.value} ${reading.unit}`,
      };
    case 'ultrasonic':
      return {
        id: reading.id,
        type: 'lidEvent',
        timestamp: eventTime,
        details: `Distance: ${reading.value} ${reading.unit}`,
      };
    default:
      return {
        id: reading.id,
        type: 'uvCycle',
        timestamp: eventTime,
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
