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

const DEFAULT_QUOTA_COOLDOWN_MS = 60_000;
const MAX_RUNTIME_CACHE_ENTRIES = 250;

let firestoreQuotaCircuitOpenUntilMs = 0;

interface RuntimeCacheEntry {
  value: unknown;
  expiresAtMs: number;
}

const runtimeResponseCache = new Map<string, RuntimeCacheEntry>();

export interface KnownMaintenanceAccountInfo {
  email: string;
  displayName: string;
  role: 'maintenance';
}

const KNOWN_MAINTENANCE_ACCOUNTS: Record<string, KnownMaintenanceAccountInfo> = {
  'juan.delacruz@sdca.edu.ph': {
    email: 'juan.delacruz@sdca.edu.ph',
    displayName: 'Juan Dela Cruz',
    role: 'maintenance',
  },
  'maria.santos@sdca.edu.ph': {
    email: 'maria.santos@sdca.edu.ph',
    displayName: 'Maria Santos',
    role: 'maintenance',
  },
  'antonio.luna@sdca.edu.ph': {
    email: 'antonio.luna@sdca.edu.ph',
    displayName: 'Antonio Luna',
    role: 'maintenance',
  },
  'ramon.bautista@sdca.edu.ph': {
    email: 'ramon.bautista@sdca.edu.ph',
    displayName: 'Ramon Bautista',
    role: 'maintenance',
  },
  'carlos.garcia@sdca.edu.ph': {
    email: 'carlos.garcia@sdca.edu.ph',
    displayName: 'Carlos Garcia',
    role: 'maintenance',
  },
  'evaluator1@sdca.edu.ph': {
    email: 'evaluator1@sdca.edu.ph',
    displayName: 'Evaluator 1',
    role: 'maintenance',
  },
};

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return (
      typeof error === 'string' &&
      (error.includes('RESOURCE_EXHAUSTED') || error.includes('Quota exceeded'))
    );
  }

  const err = error as { code?: unknown; message?: unknown };
  if (
    err.code === 8 ||
    err.code === '8' ||
    err.code === 'resource-exhausted' ||
    err.code === 'RESOURCE_EXHAUSTED'
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof err.message === 'string'
        ? err.message
        : '';

  return (
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('Quota exceeded') ||
    message.includes('resource-exhausted')
  );
}

/** Trips the global Firestore quota circuit breaker so hot routes fail fast. */
export function markFirestoreQuotaExhausted(
  cooldownMs: number = DEFAULT_QUOTA_COOLDOWN_MS,
): void {
  if (isTestEnvironment()) {
    return;
  }

  const safeCooldownMs =
    Number.isFinite(cooldownMs) && cooldownMs > 0
      ? cooldownMs
      : DEFAULT_QUOTA_COOLDOWN_MS;
  firestoreQuotaCircuitOpenUntilMs = Math.max(
    firestoreQuotaCircuitOpenUntilMs,
    Date.now() + safeCooldownMs,
  );
}

export function isFirestoreQuotaCircuitOpen(): boolean {
  if (isTestEnvironment()) {
    return false;
  }

  return Date.now() < firestoreQuotaCircuitOpenUntilMs;
}

export function getRuntimeCachedValue<T>(key: string): T | null {
  if (isTestEnvironment()) {
    return null;
  }

  const entry = runtimeResponseCache.get(key);
  if (!entry || Date.now() > entry.expiresAtMs) {
    return null;
  }

  return entry.value as T;
}

export function getStaleRuntimeCachedValue<T>(key: string): T | null {
  if (isTestEnvironment()) {
    return null;
  }

  const entry = runtimeResponseCache.get(key);
  return entry ? (entry.value as T) : null;
}

export function setRuntimeCachedValue<T>(
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (isTestEnvironment()) {
    return;
  }

  const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 15_000;
  if (runtimeResponseCache.has(key)) {
    runtimeResponseCache.delete(key);
  }
  runtimeResponseCache.set(key, {
    value,
    expiresAtMs: Date.now() + safeTtlMs,
  });

  if (runtimeResponseCache.size > MAX_RUNTIME_CACHE_ENTRIES) {
    const oldestKey = runtimeResponseCache.keys().next().value;
    if (typeof oldestKey === 'string') {
      runtimeResponseCache.delete(oldestKey);
    }
  }
}

export function invalidateRuntimeCache(prefix?: string): void {
  if (isTestEnvironment()) {
    return;
  }

  if (!prefix) {
    runtimeResponseCache.clear();
    return;
  }

  for (const key of Array.from(runtimeResponseCache.keys())) {
    if (key.startsWith(prefix)) {
      runtimeResponseCache.delete(key);
    }
  }
}

export function getKnownMaintenanceAccountInfo(
  email: string | null | undefined,
): KnownMaintenanceAccountInfo | null {
  if (isTestEnvironment() || !email) {
    return null;
  }

  return KNOWN_MAINTENANCE_ACCOUNTS[email.trim().toLowerCase()] ?? null;
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
