import { promises as fs } from 'fs';
import path from 'path';

export interface LocalRuntimeDeviceEntry {
  deviceId: string;
  lastSeenMs: number | null;
  status: 'online' | 'offline';
}

export interface LocalRuntimeSensorReading {
  id: string;
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: {
    _seconds: number;
    seconds: number;
    _nanoseconds: number;
    nanoseconds: number;
  };
}

interface LocalRuntimeCache {
  updatedAtMs: number;
  devices: Record<string, LocalRuntimeDeviceEntry>;
  readings: Record<string, LocalRuntimeSensorReading[]>;
}

const CACHE_PATH = path.join(
  process.cwd(),
  '.local-runtime',
  'device-cache.json',
);

function emptyCache(): LocalRuntimeCache {
  return {
    updatedAtMs: 0,
    devices: {},
    readings: {},
  };
}

export function shouldUseLocalRuntimeCache(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('RESOURCE_EXHAUSTED') ||
    error.message.includes('Quota exceeded')
  );
}

async function readCache(): Promise<LocalRuntimeCache> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalRuntimeCache>;

    return {
      updatedAtMs:
        typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0,
      devices: parsed.devices ?? {},
      readings: parsed.readings ?? {},
    };
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;

    if (code === 'ENOENT') {
      return emptyCache();
    }

    console.warn('[local-runtime-cache] Failed to read cache:', error);
    return emptyCache();
  }
}

export async function getCachedDeviceEntry(
  deviceId: string,
): Promise<LocalRuntimeDeviceEntry | null> {
  const cache = await readCache();
  return cache.devices[deviceId] ?? null;
}

export async function getCachedSensorReadings(
  deviceId: string,
  from?: string | null,
  to?: string | null,
): Promise<LocalRuntimeSensorReading[]> {
  const cache = await readCache();
  const readings = cache.readings[deviceId] ?? [];

  const fromMs = from ? new Date(`${from}T00:00:00.000Z`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : fromMs;

  return readings
    .filter((reading) => {
      const readingMs = reading.timestamp.seconds * 1000;

      if (fromMs !== null && readingMs < fromMs) {
        return false;
      }

      if (toMs !== null && readingMs > toMs) {
        return false;
      }

      return true;
    })
    .sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
}
