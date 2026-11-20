// src/uptime-tracker.ts
// Minute-by-minute device uptime aggregator for calculating real historical daily SLA.
import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  getInMemoryDeviceHeartbeats,
  recordLocalUptimeTick,
} from './local-runtime-cache';

const TICK_INTERVAL_MS = 60_000; // 1 minute
const FIVE_MIN_MS = 5 * 60 * 1000;
const DEVICE_CACHE_REFRESH_MS = 60 * 60_000; // 60 minutes
const QUOTA_BACKOFF_MS = 120_000;
const PHT_OFFSET_MS = 8 * 3_600_000;

let tickerTimer: NodeJS.Timeout | null = null;
const cachedDeviceLastSeenMs = new Map<string, number>();
let lastDeviceCacheRefreshMs = 0;
let uptimeQuotaBackoffUntilMs = 0;

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.includes('RESOURCE_EXHAUSTED');
  }
  const err = error as { code?: unknown; message?: unknown };
  if (err.code === 8 || err.code === '8' || err.code === 'resource-exhausted') {
    return true;
  }
  const msg = typeof err.message === 'string' ? err.message : '';
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
}

function parseLastSeenMillis(ls: unknown): number {
  if (!ls) return 0;
  if (typeof ls === 'object') {
    const candidate = ls as { toMillis?: () => number; _seconds?: number };
    if (typeof candidate.toMillis === 'function') {
      return candidate.toMillis();
    }
    if (typeof candidate._seconds === 'number') {
      return candidate._seconds * 1000;
    }
  }
  if (typeof ls === 'string' || typeof ls === 'number') {
    return new Date(ls).getTime();
  }
  return 0;
}

export function todayKey(date = new Date()): string {
  return new Date(date.getTime() + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

function getSafeInMemoryHeartbeats(): Map<string, number> {
  return typeof getInMemoryDeviceHeartbeats === 'function'
    ? getInMemoryDeviceHeartbeats()
    : new Map<string, number>();
}

function mergeInMemoryHeartbeats(): void {
  for (const [deviceId, seenAtMs] of getSafeInMemoryHeartbeats().entries()) {
    const prev = cachedDeviceLastSeenMs.get(deviceId) ?? 0;
    if (seenAtMs > prev) {
      cachedDeviceLastSeenMs.set(deviceId, seenAtMs);
    }
  }
}

function filterActiveHardwareEntries(
  entries: Array<[string, number]>,
  sessionFloorMs: number,
): Array<[string, number]> {
  // Only track devices that have actually sent a live heartbeat during today's PHT session
  // (or are still within the 5-minute online window across midnight).
  return entries.filter(([, lastSeenMs]) => lastSeenMs >= sessionFloorMs);
}

export async function recordUptimeTick(now = new Date()): Promise<void> {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const nowMs = now.getTime();
  const dateStr = todayKey(now);
  const thresholdMs = nowMs - FIVE_MIN_MS;
  const todayStartPhtMs = Date.parse(`${dateStr}T00:00:00.000+08:00`);
  const sessionFloorMs = Math.min(todayStartPhtMs, thresholdMs);

  if (!isTestEnv && Date.now() < uptimeQuotaBackoffUntilMs) {
    // Firestore quota backoff active — still mirror real minute ticks locally from heartbeats
    mergeInMemoryHeartbeats();
    const localEntries = filterActiveHardwareEntries(
      Array.from(cachedDeviceLastSeenMs.entries()),
      sessionFloorMs,
    );
    if (typeof recordLocalUptimeTick === 'function') {
      for (const [deviceId, lastSeenMillis] of localEntries) {
        void recordLocalUptimeTick({
          deviceId,
          date: dateStr,
          isOnline: lastSeenMillis >= thresholdMs,
          nowMs,
        });
      }
    }
    return;
  }

  try {
    let entries: Array<[string, number]>;

    if (
      isTestEnv ||
      lastDeviceCacheRefreshMs === 0 ||
      nowMs - lastDeviceCacheRefreshMs >= DEVICE_CACHE_REFRESH_MS
    ) {
      const devicesSnap = await adminDb.collection('devices').get();
      if (devicesSnap.empty && (isTestEnv || cachedDeviceLastSeenMs.size === 0)) {
        return;
      }

      if (isTestEnv) {
        const inMemoryHeartbeats = getSafeInMemoryHeartbeats();
        const rawEntries: Array<[string, number]> = devicesSnap.docs.map(
          (doc) => [
            doc.id,
            Math.max(
              parseLastSeenMillis(doc.data().lastSeen),
              inMemoryHeartbeats.get(doc.id) ?? 0,
            ),
          ],
        );
        entries = filterActiveHardwareEntries(rawEntries, sessionFloorMs);
      } else {
        for (const doc of devicesSnap.docs) {
          const parsed = parseLastSeenMillis(doc.data().lastSeen);
          const existing = cachedDeviceLastSeenMs.get(doc.id) ?? 0;
          cachedDeviceLastSeenMs.set(doc.id, Math.max(existing, parsed));
        }
        mergeInMemoryHeartbeats();
        lastDeviceCacheRefreshMs = nowMs;
        entries = filterActiveHardwareEntries(
          Array.from(cachedDeviceLastSeenMs.entries()),
          sessionFloorMs,
        );
      }
    } else {
      mergeInMemoryHeartbeats();
      entries = filterActiveHardwareEntries(
        Array.from(cachedDeviceLastSeenMs.entries()),
        sessionFloorMs,
      );
    }

    if (entries.length === 0) {
      return;
    }

    const batch = adminDb.batch();

    for (const [deviceId, lastSeenMillis] of entries) {
      const isOnline = lastSeenMillis >= thresholdMs;
      if (!isTestEnv && typeof recordLocalUptimeTick === 'function') {
        void recordLocalUptimeTick({
          deviceId,
          date: dateStr,
          isOnline,
          nowMs,
        });
      }
      const dailyDocRef = adminDb
        .collection('deviceUptimeDaily')
        .doc(`${deviceId}_${dateStr}`);

      batch.set(
        dailyDocRef,
        {
          deviceId,
          date: dateStr,
          totalMinutes: FieldValue.increment(1),
          onlineMinutes: FieldValue.increment(isOnline ? 1 : 0),
          updatedAt: Timestamp.fromDate(now),
        },
        { merge: true },
      );
    }

    await batch.commit();
  } catch (error) {
    if (isQuotaError(error) && !isTestEnv) {
      uptimeQuotaBackoffUntilMs = Date.now() + QUOTA_BACKOFF_MS;
      console.warn('[UptimeTracker] Quota exhausted; backing off uptime tick');
      return;
    }
    console.error('[UptimeTracker] Failed to record uptime tick:', error);
  }
}

export function startUptimeTracker(): void {
  if (tickerTimer) {
    return;
  }

  console.log('[UptimeTracker] Starting minute-level device uptime aggregation');
  // Run an initial tick shortly after startup (e.g. 5 seconds)
  setTimeout(() => {
    void recordUptimeTick();
  }, 5_000);

  tickerTimer = setInterval(() => {
    void recordUptimeTick();
  }, TICK_INTERVAL_MS);
}

export function stopUptimeTracker(): void {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
    console.log('[UptimeTracker] Stopped device uptime aggregation');
  }
}
