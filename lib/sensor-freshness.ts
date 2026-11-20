import { SENSOR_EVENT_FRESHNESS_MS } from '@/lib/device-constants';

export type SensorTimestampLike =
  | {
      _seconds?: number;
      seconds?: number;
      _nanoseconds?: number;
      nanoseconds?: number;
      toMillis?: () => number;
    }
  | Date
  | string
  | number
  | null
  | undefined;

/**
 * Normalizes Firestore Timestamp objects, serialized {_seconds/_nanoseconds} payloads,
 * Date instances, ISO strings, and numeric epoch timestamps into epoch milliseconds.
 * Returns 0 when missing or invalid.
 */
export function getReadingTimestampMillis(timestamp: unknown): number {
  if (!timestamp) return 0;

  if (timestamp instanceof Date) {
    const ms = timestamp.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof timestamp === 'number') {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    return timestamp > 1e11 ? timestamp : timestamp * 1000;
  }

  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof timestamp === 'object') {
    const candidate = timestamp as {
      toMillis?: () => number;
      _seconds?: unknown;
      seconds?: unknown;
      _nanoseconds?: unknown;
      nanoseconds?: unknown;
    };

    if (typeof candidate.toMillis === 'function') {
      const ms = candidate.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }

    const seconds =
      typeof candidate._seconds === 'number' && Number.isFinite(candidate._seconds)
        ? candidate._seconds
        : typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)
          ? candidate.seconds
          : 0;

    if (seconds <= 0) return 0;

    const nanoseconds =
      typeof candidate._nanoseconds === 'number' &&
      Number.isFinite(candidate._nanoseconds)
        ? candidate._nanoseconds
        : typeof candidate.nanoseconds === 'number' &&
            Number.isFinite(candidate.nanoseconds)
          ? candidate.nanoseconds
          : 0;

    return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  return 0;
}

/**
 * Returns true only when a timestamp is valid and within +/- maxAgeMs of nowMs
 * (guards against both stale readings from earlier flushes and future clock skew).
 */
export function isFreshSensorReadingTimestamp(
  timestampMs: number | null | undefined,
  nowMs = Date.now(),
  maxAgeMs = SENSOR_EVENT_FRESHNESS_MS,
): boolean {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return false;
  }

  const age = nowMs - timestampMs;
  return age <= maxAgeMs && age >= -maxAgeMs;
}
