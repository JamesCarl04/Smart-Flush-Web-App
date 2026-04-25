// src/hardware-counters.ts
// Tracks hardware wear metrics in devices/{deviceId}/maintenanceCounters/current
// Called from firestore-writers.ts after every relevant Firestore write.
import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventType =
  | 'uv_cycle'
  | 'lid_open'
  | 'flush'
  | 'ultrasonic_fail'
  | 'ultrasonic_ok';

interface FlushPayload {
  volume: number;
  duration: number;
  unit: string;
}

interface UVPayload {
  duration: number;
  completed: boolean;
  timestamp: number;
}

interface MaintenanceCounters {
  uvOnTimeSeconds: number;
  lidCycleCount: number;
  flowSensorTotalLiters: number;
  pumpTotalLiters: number;
  relayTotalTriggers: number;
  ultrasonicConsecutiveFailures: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS: Record<
  keyof MaintenanceCounters,
  { limit: number; message: string }
> = {
  uvOnTimeSeconds: {
    limit: 1_080_000, // 300 hours
    message: 'UV-C strip 300+ hrs. Inspect or replace.',
  },
  lidCycleCount: {
    limit: 10_000,
    message: 'Servos 10,000+ cycles. Inspect plastic gears.',
  },
  flowSensorTotalLiters: {
    limit: 500,
    message: 'YF-S201 500+ liters. Recalibrate sensor.',
  },
  pumpTotalLiters: {
    limit: 500,
    message: 'Pump 500+ liters. Inspect seals and impeller.',
  },
  ultrasonicConsecutiveFailures: {
    limit: 10,
    message: '10 consecutive fails. Clean HC-SR04 transducer.',
  },
  relayTotalTriggers: {
    limit: 10_000,
    message: 'Relay 10,000+ triggers. Inspect contacts.',
  },
};

// ─── Counter path helper ──────────────────────────────────────────────────────

function countersRef(deviceId: string) {
  return adminDb
    .collection('devices')
    .doc(deviceId)
    .collection('maintenanceCounters')
    .doc('current');
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Increments the appropriate maintenance counters after a hardware event.
 * Uses FieldValue.increment() so concurrent writes are safe.
 */
export async function incrementCounters(
  deviceId: string,
  eventType: EventType,
  payload: FlushPayload | UVPayload | Record<string, unknown>,
): Promise<void> {
  try {
    const ref = countersRef(deviceId);

    switch (eventType) {
      case 'uv_cycle': {
        const p = payload as UVPayload;
        await ref.set(
          { uvOnTimeSeconds: FieldValue.increment(p.duration) },
          { merge: true },
        );
        break;
      }

      case 'lid_open': {
        await ref.set(
          {
            lidCycleCount: FieldValue.increment(1),
            relayTotalTriggers: FieldValue.increment(1),
          },
          { merge: true },
        );
        break;
      }

      case 'flush': {
        const p = payload as FlushPayload;
        await ref.set(
          {
            flowSensorTotalLiters: FieldValue.increment(p.volume),
            pumpTotalLiters: FieldValue.increment(p.volume),
            relayTotalTriggers: FieldValue.increment(1),
          },
          { merge: true },
        );
        break;
      }

      case 'ultrasonic_fail': {
        await ref.set(
          { ultrasonicConsecutiveFailures: FieldValue.increment(1) },
          { merge: true },
        );
        break;
      }

      case 'ultrasonic_ok': {
        // Reset consecutive failures on a successful reading
        await ref.set({ ultrasonicConsecutiveFailures: 0 }, { merge: true });
        break;
      }
    }

    console.log(
      `[HardwareCounters] Incremented ${eventType} for device ${deviceId}`,
    );
    await evaluateMaintenanceAlerts(deviceId);
  } catch (error) {
    console.error('[HardwareCounters] incrementCounters error:', error);
  }
}

/**
 * Reads current counters and creates a maintenance alert if any threshold is exceeded.
 * Debounce: skips if an unacknowledged alert of the same type already exists.
 */
export async function evaluateMaintenanceAlerts(
  deviceId: string,
): Promise<void> {
  try {
    const snap = await countersRef(deviceId).get();
    if (!snap.exists) return;

    const counters = snap.data() as Partial<MaintenanceCounters>;

    for (const [key, config] of Object.entries(THRESHOLDS)) {
      const counterKey = key as keyof MaintenanceCounters;
      const value = counters[counterKey] ?? 0;

      if (value >= config.limit) {
        const alertType = `maintenance_${counterKey}`;

        // Debounce: skip if unacknowledged alert already exists for this counter
        const existingSnap = await adminDb
          .collection('alerts')
          .where('type', '==', alertType)
          .where('acknowledged', '==', false)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          console.log(
            `[HardwareCounters] Suppressed duplicate alert: ${alertType}`,
          );
          continue;
        }

        const docRef = adminDb.collection('alerts').doc();
        await docRef.set({
          id: docRef.id,
          type: alertType,
          message: config.message,
          severity: 'medium',
          acknowledged: false,
          deviceId,
          timestamp: Timestamp.now(),
        });
        console.log(
          `[HardwareCounters] Maintenance alert created: ${alertType}`,
        );
      }
    }
  } catch (error) {
    console.error('[HardwareCounters] evaluateMaintenanceAlerts error:', error);
  }
}
