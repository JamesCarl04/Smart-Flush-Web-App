'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { getErrorMessage } from '@/lib/error-utils';

interface DeviceStatusResponse {
  success: boolean;
  data: {
    deviceId: string;
    exists: boolean;
    connected: boolean;
    status: 'online' | 'offline';
    lastSeenMs: number | null;
    staleMs: number | null;
    reason: string;
  };
}

interface DeviceStatusState {
  connected: boolean;
  status: 'online' | 'offline';
  lastSeen: number | null;
  staleMs: number | null;
  reason: string;
}

const DEFAULT_STATUS_STATE: DeviceStatusState = {
  connected: false,
  status: 'offline',
  lastSeen: null,
  staleMs: null,
  reason: 'ESP32 not connected',
};

export function useDeviceStatus(deviceId = DEFAULT_DEVICE_ID) {
  const { user } = useAuth();
  const [data, setData] = useState<DeviceStatusState>(DEFAULT_STATUS_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async (showLoading: boolean) => {
      if (!user) {
        if (!cancelled) {
          setData(DEFAULT_STATUS_STATE);
          setLoading(false);
        }
        return;
      }

      try {
        if (showLoading && !cancelled) {
          setLoading(true);
        }

        const response = await apiFetch<DeviceStatusResponse>(
          `/api/devices/${deviceId}/status`,
          user,
        );

        if (!cancelled) {
          setData({
            connected: response.data.connected,
            status: response.data.status,
            lastSeen: response.data.lastSeenMs,
            staleMs: response.data.staleMs,
            reason: response.data.reason,
          });
        }
      } catch (error) {
        console.warn('[useDeviceStatus] status request failed:', error);
        if (!cancelled) {
          setData({
            ...DEFAULT_STATUS_STATE,
            reason: getErrorMessage(error) ?? DEFAULT_STATUS_STATE.reason,
          });
        }
      } finally {
        if (showLoading && !cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchStatus(true);
    const intervalId = window.setInterval(() => {
      void fetchStatus(false);
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceId, user]);

  return { ...data, loading };
}
