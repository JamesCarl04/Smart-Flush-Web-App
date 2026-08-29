// src/uptime-tracker.ts
// Minute-by-minute device uptime aggregator for calculating real historical daily SLA.
import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const TICK_INTERVAL_MS = 60_000; // 1 minute
const FIVE_MIN_MS = 5 * 60 * 1000;

let tickerTimer: NodeJS.Timeout | null = null;

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function recordUptimeTick(now = new Date()): Promise<void> {
  const dateStr = todayKey(now);
  const nowMs = now.getTime();
  const thresholdMs = nowMs - FIVE_MIN_MS;

  try {
    const devicesSnap = await adminDb.collection('devices').get();
    if (devicesSnap.empty) {
      return;
    }

    const batch = adminDb.batch();

    for (const doc of devicesSnap.docs) {
      const data = doc.data();
      const deviceId = doc.id;
      const ls = data.lastSeen as any;

      let lastSeenMillis = 0;
      if (ls) {
        if (typeof ls.toMillis === 'function') {
          lastSeenMillis = ls.toMillis();
        } else if (ls._seconds) {
          lastSeenMillis = ls._seconds * 1000;
        } else if (typeof ls === 'string' || typeof ls === 'number') {
          lastSeenMillis = new Date(ls).getTime();
        }
      }

      const isOnline = lastSeenMillis >= thresholdMs;
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
