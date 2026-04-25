'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
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

function mapReadingToActivity(r: SensorReading): ActivityEvent {
  switch (r.sensorType) {
    case 'waterflow':
      return {
        id: r.id,
        type: 'flushEvent',
        timestamp: new Date(r.timestamp._seconds * 1000),
        details: `Flush: ${r.value} ${r.unit}`,
      };
    case 'ultrasonic':
      return {
        id: r.id,
        type: 'lidEvent',
        timestamp: new Date(r.timestamp._seconds * 1000),
        details: `Distance: ${r.value} ${r.unit}`,
      };
    default:
      return {
        id: r.id,
        type: 'uvCycle',
        timestamp: new Date(r.timestamp._seconds * 1000),
        details: `${r.sensorType}: ${r.value} ${r.unit}`,
      };
  }
}

export function useActivityFeed(deviceId = 'toilet-01') {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiFetch<{ success: boolean; data: SensorReading[] }>(
        `/api/sensors/${deviceId}/readings?from=${today}`,
        user,
      );

      if (res.success && res.data) {
        // Take the most recent 20 readings, newest first
        const recent = res.data.slice(-20).reverse();
        setEvents(recent.map(mapReadingToActivity));
      }
    } catch {
      // Silently handle — feed will be empty
    } finally {
      setLoading(false);
    }
  }, [user, deviceId]);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 15_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  return { events, loading };
}
