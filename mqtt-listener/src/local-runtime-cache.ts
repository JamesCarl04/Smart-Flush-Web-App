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

export interface LocalRuntimeFlushEvent {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestampMs: number;
}

export interface LocalRuntimeUVCycle {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  reason?: string | null;
  timestampMs: number;
}

export interface LocalRuntimeLidEvent {
  id: string;
  deviceId: string;
  status: 'open' | 'closed';
  timestampMs: number;
}

export interface LocalRuntimeUptimeDaily {
  deviceId: string;
  date: string; // YYYY-MM-DD (PHT)
  onlineMinutes: number;
  totalMinutes: number;
  updatedAtMs: number;
}

interface LocalRuntimeCache {
  updatedAtMs: number;
  devices: Record<string, LocalRuntimeDeviceEntry>;
  readings: Record<string, LocalRuntimeSensorReading[]>;
  flushEvents?: LocalRuntimeFlushEvent[];
  uvCycles?: LocalRuntimeUVCycle[];
  lidEvents?: LocalRuntimeLidEvent[];
  uptimeDaily?: Record<string, LocalRuntimeUptimeDaily>;
}

const CACHE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.local-runtime',
  'device-cache.json',
);
const MAX_SENSOR_READINGS = 200;
const MAX_UV_CYCLE_ENTRIES = 2_000;

function emptyCache(): LocalRuntimeCache {
  return {
    updatedAtMs: 0,
    devices: {},
    readings: {},
    flushEvents: [],
    uvCycles: [],
    lidEvents: [],
    uptimeDaily: {},
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
      flushEvents: Array.isArray(parsed.flushEvents) ? parsed.flushEvents : [],
      uvCycles: Array.isArray(parsed.uvCycles) ? parsed.uvCycles : [],
      lidEvents: Array.isArray(parsed.lidEvents) ? parsed.lidEvents : [],
      uptimeDaily:
        parsed.uptimeDaily && typeof parsed.uptimeDaily === 'object'
          ? parsed.uptimeDaily
          : {},
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

const deviceHeartbeatsInMemory = new Map<string, number>();

export function getInMemoryDeviceHeartbeats(): Map<string, number> {
  return deviceHeartbeatsInMemory;
}

export function recordDeviceHeartbeat(
  deviceId: string,
  lastSeenMs = Date.now(),
): Promise<void> {
  const prev = deviceHeartbeatsInMemory.get(deviceId) ?? 0;
  if (lastSeenMs > prev) {
    deviceHeartbeatsInMemory.set(deviceId, lastSeenMs);
  }
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

export function recordLocalFlushEvent(params: {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestampMs?: number;
}): Promise<void> {
  const timestampMs = params.timestampMs ?? Date.now();
  return enqueueWrite((cache) => {
    const list = cache.flushEvents ?? [];
    list.push({
      id: params.id,
      deviceId: params.deviceId,
      waterVolume: params.waterVolume,
      duration: params.duration,
      timestampMs,
    });
    cache.flushEvents = list.slice(-MAX_SENSOR_READINGS);
  });
}

export function recordLocalUVCycle(params: {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  reason?: string | null;
  timestampMs?: number;
}): Promise<void> {
  const timestampMs = params.timestampMs ?? Date.now();
  return enqueueWrite((cache) => {
    const list = cache.uvCycles ?? [];
    list.push({
      id: params.id,
      deviceId: params.deviceId,
      duration: params.duration,
      completed: params.completed,
      reason: params.reason ?? null,
      timestampMs,
    });
    cache.uvCycles = list.slice(-MAX_UV_CYCLE_ENTRIES);
  });
}

export function recordLocalLidEvent(params: {
  id: string;
  deviceId: string;
  status: 'open' | 'closed';
  timestampMs?: number;
}): Promise<void> {
  const timestampMs = params.timestampMs ?? Date.now();
  return enqueueWrite((cache) => {
    const list = cache.lidEvents ?? [];
    list.push({
      id: params.id,
      deviceId: params.deviceId,
      status: params.status,
      timestampMs,
    });
    cache.lidEvents = list.slice(-MAX_SENSOR_READINGS);
  });
}

export function recordLocalUptimeTick(params: {
  deviceId: string;
  date: string;
  isOnline: boolean;
  nowMs?: number;
}): Promise<void> {
  const nowMs = params.nowMs ?? Date.now();
  const key = `${params.deviceId}_${params.date}`;
  return enqueueWrite((cache) => {
    const map = cache.uptimeDaily ?? {};
    const existing = map[key] ?? {
      deviceId: params.deviceId,
      date: params.date,
      onlineMinutes: 0,
      totalMinutes: 0,
      updatedAtMs: nowMs,
    };
    map[key] = {
      deviceId: params.deviceId,
      date: params.date,
      onlineMinutes: existing.onlineMinutes + (params.isOnline ? 1 : 0),
      totalMinutes: existing.totalMinutes + 1,
      updatedAtMs: nowMs,
    };
    // Retain at most 400 daily records to bound local cache size
    const keys = Object.keys(map);
    if (keys.length > 400) {
      keys
        .sort()
        .slice(0, keys.length - 400)
        .forEach((oldKey) => {
          delete map[oldKey];
        });
    }
    cache.uptimeDaily = map;
  });
}
