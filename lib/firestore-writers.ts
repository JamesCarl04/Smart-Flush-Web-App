// lib/firestore-writers.ts
// All server-side Firestore write operations triggered by MQTT messages
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { incrementCounters } from '@/lib/hardware-counters';

// ─── Payload interfaces (match MQTT topic contract) ───────────────────────────

interface UltrasonicPayload {
  distance: number;
  unit: string;
  timestamp: number;
}

interface WaterflowPayload {
  volume: number;
  duration: number;
  unit: string;
}

type SensorPayload = UltrasonicPayload | WaterflowPayload;

interface LidPayload {
  status: 'open' | 'closed';
  timestamp: number;
}

interface UVPayload {
  duration: number;
  completed: boolean;
  timestamp: number;
  reason?: string;
}

interface FlushPayload {
  volume: number;
  duration: number;
  unit: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 3_600_000;

/** Returns today's date as YYYY-MM-DD in Philippine Time (UTC+8) */
function todayKey(nowMs = Date.now()): string {
  return new Date(nowMs + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Derives a human-readable sensorType from the MQTT topic last segment */
function sensorTypeFromTopic(topic: string): string {
  const parts = topic.split('/');
  return parts[parts.length - 1] ?? 'unknown';
}

// ─── Writers ─────────────────────────────────────────────────────────────────

/**
 * Writes a sensor reading to sensorReadings/{YYYY-MM-DD}/readings/{autoId}
 * Covers both ultrasonic (distance) and waterflow (volume) topics.
 */
export async function writeSensorReading(
  topic: string,
  payload: SensorPayload,
  deviceId: string,
): Promise<void> {
  try {
    const dateKey = todayKey();
    const sensorType = sensorTypeFromTopic(topic);
    const collectionRef = adminDb
      .collection('sensorReadings')
      .doc(dateKey)
      .collection('readings');

    let value: number;
    let unit: string;

    if ('distance' in payload) {
      value = payload.distance;
      unit = payload.unit;
    } else {
      value = payload.volume;
      unit = payload.unit;
    }

    const docRef = collectionRef.doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      sensorType,
      value,
      unit,
      timestamp: Timestamp.now(),
    });

    console.log(
      `[Firestore] sensorReading written: ${sensorType} = ${value} ${unit}`,
    );

    // Track ultrasonic consecutive failures
    if (sensorType === 'ultrasonic') {
      const isFailure = value <= 0 || value > 400; // HC-SR04 out-of-range
      void incrementCounters(
        deviceId,
        isFailure ? 'ultrasonic_fail' : 'ultrasonic_ok',
        payload as unknown as Record<string, unknown>,
      );
    }
  } catch (error) {
    console.error('[Firestore] writeSensorReading error:', error);
  }
}

/**
 * Writes a flush event when waterflow payload arrives.
 * Maps waterflow payload → flushEvents schema.
 */
export async function writeFlushEvent(
  payload: FlushPayload,
  deviceId: string,
): Promise<void> {
  try {
    const docRef = adminDb.collection('flushEvents').doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      waterVolume: payload.volume,
      duration: payload.duration,
      timestamp: Timestamp.now(),
    });
    console.log(
      `[Firestore] flushEvent written: ${payload.volume}${payload.unit}`,
    );
    void incrementCounters(deviceId, 'flush', payload);
  } catch (error) {
    console.error('[Firestore] writeFlushEvent error:', error);
  }
}

/**
 * Writes a lid event (open or close) to lidEvents.
 */
export async function writeLidEvent(
  payload: LidPayload,
  deviceId: string,
): Promise<void> {
  try {
    const docRef = adminDb.collection('lidEvents').doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      status: payload.status,
      timestamp: Timestamp.now(),
    });
    console.log(`[Firestore] lidEvent written: ${payload.status}`);
    // Only count lid OPENs (each open = one full open/close cycle)
    if (payload.status === 'open') {
      void incrementCounters(
        deviceId,
        'lid_open',
        payload as unknown as Record<string, unknown>,
      );
    }
  } catch (error) {
    console.error('[Firestore] writeLidEvent error:', error);
  }
}

/**
 * Writes a UV sterilisation cycle to uvCycles and atomically increments uvCyclesDaily/{YYYY-MM-DD}.
 */
export async function writeUVCycle(
  payload: UVPayload,
  deviceId: string,
): Promise<void> {
  try {
    const nowMs = Date.now();
    const nowTs = Timestamp.now();
    const safeDuration =
      typeof payload.duration === 'number' &&
      Number.isFinite(payload.duration) &&
      payload.duration >= 0
        ? payload.duration
        : 0;
    const isCompleted = Boolean(payload.completed);

    const docRef = adminDb.collection('uvCycles').doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      duration: safeDuration,
      completed: isCompleted,
      reason: payload.reason ?? null,
      timestamp: nowTs,
    });
    console.log(
      `[Firestore] uvCycle written: ${safeDuration}s completed=${isCompleted}`,
    );

    if (typeof FieldValue?.increment === 'function') {
      try {
        const dateKey = todayKey(nowMs);
        const hourKey = String(
          new Date(nowMs + PHT_OFFSET_MS).getUTCHours(),
        ).padStart(2, '0');
        await adminDb
          .collection('uvCyclesDaily')
          .doc(dateKey)
          .set(
            {
              date: dateKey,
              totalCount: FieldValue.increment(1),
              completedCount: FieldValue.increment(isCompleted ? 1 : 0),
              interruptedCount: FieldValue.increment(isCompleted ? 0 : 1),
              totalDurationSeconds: FieldValue.increment(safeDuration),
              hourlyCounts: {
                [hourKey]: FieldValue.increment(1),
              },
              hourlyCompleted: {
                [hourKey]: FieldValue.increment(isCompleted ? 1 : 0),
              },
              hourlyInterrupted: {
                [hourKey]: FieldValue.increment(isCompleted ? 0 : 1),
              },
              lastCycleAt: nowTs,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
      } catch (rollupError) {
        console.warn('[Firestore] uvCyclesDaily rollup error:', rollupError);
      }
    }

    void incrementCounters(deviceId, 'uv_cycle', payload);
  } catch (error) {
    console.error('[Firestore] writeUVCycle error:', error);
  }
}

/**
 * Sets the device status to 'online' and bumps lastSeen to now.
 */
export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  try {
    await adminDb.collection('devices').doc(deviceId).update({
      status: 'online',
      lastSeen: FieldValue.serverTimestamp(),
    });
    console.log(`[Firestore] device ${deviceId} lastSeen updated`);
  } catch (error) {
    // Device doc may not exist yet — log but don't crash the MQTT handler
    console.error(
      `[Firestore] updateDeviceLastSeen (${deviceId}) error:`,
      error,
    );
  }
}
