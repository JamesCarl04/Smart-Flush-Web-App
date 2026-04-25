import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import {
  DEFAULT_DEVICE_ID,
  DEVICE_HEARTBEAT_TIMEOUT_MS,
} from '@/lib/device-constants';

export type DeviceStatus = 'online' | 'offline';

export interface DeviceConnectionState {
  deviceId: string;
  exists: boolean;
  connected: boolean;
  status: DeviceStatus;
  lastSeenMs: number | null;
  staleMs: number | null;
  reason: string;
}

function extractNumericValue(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

export function timestampToMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown> & {
      toMillis?: () => number;
    };
    if (typeof candidate.toMillis === 'function') {
      return candidate.toMillis();
    }

    const seconds = extractNumericValue(candidate, ['seconds', '_seconds']);
    if (seconds !== undefined) {
      const nanoseconds =
        extractNumericValue(candidate, ['nanoseconds', '_nanoseconds']) ?? 0;
      return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
    }
  }

  return null;
}

export function getConnectionStateFromDeviceData(
  deviceId: string,
  data: DocumentData | undefined,
  now = Date.now(),
): DeviceConnectionState {
  const lastSeenMs = timestampToMillis(data?.lastSeen);
  const staleMs = lastSeenMs === null ? null : Math.max(0, now - lastSeenMs);
  const connected = staleMs !== null && staleMs <= DEVICE_HEARTBEAT_TIMEOUT_MS;
  const status: DeviceStatus = connected ? 'online' : 'offline';
  const staleSeconds = staleMs === null ? null : Math.round(staleMs / 1000);

  let reason = 'ESP32 connected';
  if (lastSeenMs === null) {
    reason = 'No heartbeat received from ESP32 yet';
  } else if (!connected) {
    reason = `Last heartbeat was ${staleSeconds ?? 0}s ago`;
  }

  return {
    deviceId,
    exists: Boolean(data),
    connected,
    status,
    lastSeenMs,
    staleMs,
    reason,
  };
}

export async function getDeviceConnectionState(
  deviceId = DEFAULT_DEVICE_ID,
): Promise<DeviceConnectionState> {
  const snapshot = await adminDb.collection('devices').doc(deviceId).get();

  if (!snapshot.exists) {
    return {
      deviceId,
      exists: false,
      connected: false,
      status: 'offline',
      lastSeenMs: null,
      staleMs: null,
      reason: 'Device record not found',
    };
  }

  return getConnectionStateFromDeviceData(deviceId, snapshot.data());
}

export async function ensureDeviceConnected(
  deviceId = DEFAULT_DEVICE_ID,
): Promise<DeviceConnectionState> {
  const state = await getDeviceConnectionState(deviceId);

  if (!state.connected) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'ESP32 not connected',
        data: state,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return state;
}
