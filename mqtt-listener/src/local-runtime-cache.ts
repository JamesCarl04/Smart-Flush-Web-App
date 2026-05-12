import { promises as fs } from 'fs';
import path from 'path';

interface LocalRuntimeDeviceEntry {
  deviceId: string;
  lastSeenMs: number | null;
  status: 'online' | 'offline';
}

interface LocalRuntimeSensorReading {
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

const CACHE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.local-runtime',
  'device-cache.json',
);
const MAX_SENSOR_READINGS = 200;

function emptyCache(): LocalRuntimeCache {
  return {
    updatedAtMs: 0,
    devices: {},
    readings: {},
  };
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

let writeQueue = Promise.resolve();

function enqueueWrite(
  mutator: (cache: LocalRuntimeCache) => void,
): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      const cache = await readCache();
      mutator(cache);
      cache.updatedAtMs = Date.now();

      await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
      await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    })
    .catch((error) => {
      console.error('[local-runtime-cache] Failed to update cache:', error);
    });

  return writeQueue;
}

export function recordDeviceHeartbeat(
  deviceId: string,
  lastSeenMs = Date.now(),
): Promise<void> {
  return enqueueWrite((cache) => {
    cache.devices[deviceId] = {
      deviceId,
      lastSeenMs,
      status: 'online',
    };
  });
}

export function recordSensorReading(params: {
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestampMs?: number;
}): Promise<void> {
  const timestampMs = params.timestampMs ?? Date.now();
  const seconds = Math.floor(timestampMs / 1000);
  const reading: LocalRuntimeSensorReading = {
    id: `${params.deviceId}:${params.sensorType}:${timestampMs}`,
    deviceId: params.deviceId,
    sensorType: params.sensorType,
    value: params.value,
    unit: params.unit,
    timestamp: {
      _seconds: seconds,
      seconds,
      _nanoseconds: 0,
      nanoseconds: 0,
    },
  };

  return enqueueWrite((cache) => {
    const readings = cache.readings[params.deviceId] ?? [];
    readings.push(reading);
    cache.readings[params.deviceId] = readings.slice(-MAX_SENSOR_READINGS);
  });
}
