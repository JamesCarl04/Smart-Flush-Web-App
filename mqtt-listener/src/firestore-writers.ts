// src/firestore-writers.ts
// All Firestore write operations triggered by inbound MQTT messages.
// Ported from the Next.js project's /lib/firestore-writers.ts — this version
// uses local imports instead of @/ path aliases.
import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { incrementCounters } from './hardware-counters';

// ─── Payload interfaces (match MQTT topic contract) ───────────────────────────

export interface UltrasonicPayload {
  distance: number;
  unit: string;
  timestamp: number;
}

export interface WaterflowPayload {
  volume: number;
  duration: number;
  unit: string;
}

export type SensorPayload = UltrasonicPayload | WaterflowPayload;

export interface LidPayload {
  status: 'open' | 'closed';
  timestamp: number;
}

export interface UVPayload {
  duration: number;
  completed: boolean;
  timestamp: number;
}

export interface FlushPayload {
  volume: number;
  duration: number;
  unit: string;
}

export interface PumpPayload {
  status: string;
  timestamp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in UTC */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
  deviceId: string
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

    console.log(`[Firestore] sensorReading written: ${sensorType} = ${value} ${unit}`);

    // Track ultrasonic consecutive failures
    if (sensorType === 'ultrasonic') {
      const isFailure = value <= 0 || value > 400; // HC-SR04 out-of-range
      void incrementCounters(
        deviceId,
        isFailure ? 'ultrasonic_fail' : 'ultrasonic_ok',
        payload as unknown as Record<string, unknown>
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
  deviceId: string
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
    console.log(`[Firestore] flushEvent written: ${payload.volume}${payload.unit}`);
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
  deviceId: string
): Promise<void> {
  try {
    const docRef = adminDb.collection('lidEvents').doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      status: payload.status,
      timestamp: Timestamp.fromMillis(payload.timestamp * 1000),
    });
    console.log(`[Firestore] lidEvent written: ${payload.status}`);
    // Only count lid OPENs (each open = one full open/close cycle)
    if (payload.status === 'open') {
      void incrementCounters(deviceId, 'lid_open', payload as unknown as Record<string, unknown>);
    }
  } catch (error) {
    console.error('[Firestore] writeLidEvent error:', error);
  }
}

/**
 * Writes a UV sterilisation cycle to uvCycles.
 */
export async function writeUVCycle(
  payload: UVPayload,
  deviceId: string
): Promise<void> {
  try {
    const docRef = adminDb.collection('uvCycles').doc();
    await docRef.set({
      id: docRef.id,
      deviceId,
      duration: payload.duration,
      completed: payload.completed,
      timestamp: Timestamp.fromMillis(payload.timestamp * 1000),
    });
    console.log(`[Firestore] uvCycle written: ${payload.duration}s completed=${payload.completed}`);
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
    await adminDb.collection('devices').doc(deviceId).set(
      {
        status: 'online',
        lastSeen: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`[Firestore] device ${deviceId} lastSeen updated`);
  } catch (error) {
    console.error(`[Firestore] updateDeviceLastSeen (${deviceId}) error:`, error);
  }
}
