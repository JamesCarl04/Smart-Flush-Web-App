// lib/alert-engine.ts
// Evaluates incoming MQTT payloads against automationRules and creates alerts/tasks.
// Called from mqtt-client.ts after every inbound message.
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createTaskAndNotify } from '@/lib/task-service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  group: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
}

interface WaterflowPayload {
  volume: number;
  duration: number;
  unit: string;
}

interface UVPayload {
  duration: number;
  completed: boolean;
  timestamp: number;
}

type MqttPayload = WaterflowPayload | UVPayload | Record<string, unknown>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if an alert of this type was already created within the debounce window */
async function isDebounced(alertType: string, deviceId: string): Promise<boolean> {
  const cutoff = Timestamp.fromMillis(Date.now() - DEBOUNCE_MS);
  const snap = await adminDb
    .collection('alerts')
    .where('deviceId', '==', deviceId)
    .where('type', '==', alertType)
    .where('timestamp', '>=', cutoff)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Checks if an active uncompleted task already exists for this device to prevent duplicate task spam */
async function hasActiveHardwareTask(deviceId: string): Promise<boolean> {
  try {
    const snap = await adminDb
      .collection('tasks')
      .where('deviceId', '==', deviceId)
      .where('triggerType', '==', 'hardware_failure')
      .where('status', 'in', ['pending', 'unassigned', 'assigned', 'acknowledged', 'reassignment_needed'])
      .limit(1)
      .get();
    return !snap.empty;
  } catch (err) {
    console.warn('[AlertEngine] hasActiveHardwareTask check warning:', err);
    return false;
  }
}

/** Creates an alert document in Firestore and optionally dispatches an urgent maintenance task */
async function createAlertAndMaybeTask(params: {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  deviceId: string;
  isHardwareFailure?: boolean;
}): Promise<void> {
  const docRef = adminDb.collection('alerts').doc();
  await docRef.set({
    id: docRef.id,
    type: params.type,
    message: params.message,
    severity: params.severity,
    acknowledged: false,
    deviceId: params.deviceId,
    timestamp: FieldValue.serverTimestamp(),
  });
  console.log(
    `[AlertEngine] Created alert: ${params.type} — ${params.message}`,
  );

  // Automatically dispatch a debounced urgent maintenance task for critical hardware faults
  if (params.isHardwareFailure && params.severity === 'high') {
    const hasActiveTask = await hasActiveHardwareTask(params.deviceId);
    if (!hasActiveTask) {
      try {
        await createTaskAndNotify({
          deviceId: params.deviceId,
          triggerType: 'hardware_failure',
          message: params.message,
          assignedTo: null,
          assignedToIds: [],
          createdBy: 'system:iot_sensor',
        });
        console.log(`[AlertEngine] Dispatched urgent hardware task for ${params.deviceId}`);
      } catch (err) {
        console.error('[AlertEngine] Failed to create hardware failure task:', err);
      }
    } else {
      console.log(`[AlertEngine] Suppressed duplicate task: Active task already pending for ${params.deviceId}`);
    }
  }
}

/** Count today's flushEvents for a given deviceId */
async function todayFlushCount(deviceId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const snap = await adminDb
    .collection('flushEvents')
    .where('deviceId', '==', deviceId)
    .where('timestamp', '>=', Timestamp.fromDate(startOfDay))
    .get();
  return snap.size;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluates system_alert automationRules & hardware failure events against an incoming MQTT payload.
 * Creates debounced alerts and dispatches urgent tasks in Firestore when triggers are met.
 */
export async function evaluateAlerts(
  topic: string,
  payload: MqttPayload,
  deviceId: string,
): Promise<void> {
  try {
    // 1. Direct hardware error topic or pump failure event
    if (topic === 'toilet/events/error' || topic === 'toilet/events/pump') {
      const raw = payload as Record<string, unknown>;
      const isError =
        Boolean(raw.error) ||
        raw.status === 'error' ||
        raw.status === 'failed' ||
        raw.action === 'FAIL' ||
        raw.flowDetected === false;

      if (isError) {
        const errorType = typeof raw.error === 'string' ? raw.error : 'PUMP_FAILURE';
        const alertType = `hardware_${errorType.toLowerCase()}`;
        const message =
          typeof raw.reason === 'string' && raw.reason.trim()
            ? `Hardware Alert on ${deviceId}: ${raw.reason}`
            : `Water pump / sensor failure detected on ${deviceId}. No water flow during flush cycle.`;

        const debounced = await isDebounced(alertType, deviceId);
        if (!debounced) {
          await createAlertAndMaybeTask({
            type: alertType,
            message,
            severity: 'high',
            deviceId,
            isHardwareFailure: true,
          });
        }
        return;
      }
    }

    // 2. Load enabled system_alert automation rules
    const rulesSnap = await adminDb
      .collection('automationRules')
      .where('group', '==', 'system_alert')
      .where('enabled', '==', true)
      .get();

    const rules = rulesSnap.docs.map((d) => d.data() as AutomationRule);

    for (const rule of rules) {
      await evaluateRule(rule, topic, payload, deviceId);
    }
  } catch (error) {
    console.error('[AlertEngine] evaluateAlerts error:', error);
  }
}

async function evaluateRule(
  rule: AutomationRule,
  topic: string,
  payload: MqttPayload,
  deviceId: string,
): Promise<void> {
  let triggered = false;
  let alertType = rule.trigger;
  let message = rule.action;
  let severity: 'low' | 'medium' | 'high' = 'medium';
  let isHardwareFailure = false;

  switch (rule.trigger) {
    case 'uv_cycle_failed': {
      if (topic === 'toilet/events/uv') {
        const p = payload as UVPayload;
        if (p.completed === false) {
          triggered = true;
          message = `UV sterilisation cycle failed to complete on ${deviceId}. Inspect UV-C emitter.`;
          severity = 'high';
          isHardwareFailure = true;
        }
      }
      break;
    }

    case 'water_overuse': {
      if (topic === 'toilet/sensors/waterflow') {
        const p = payload as WaterflowPayload;
        if (p.volume > rule.threshold) {
          triggered = true;
          message = `Water overuse detected on ${deviceId}: ${p.volume}L exceeds threshold of ${rule.threshold}L.`;
          severity = 'medium';
          alertType = 'water_overuse';
        }
      }
      break;
    }

    case 'flush_count_exceeded': {
      if (topic === 'toilet/sensors/waterflow') {
        const count = await todayFlushCount(deviceId);
        if (count > rule.threshold) {
          triggered = true;
          message = `Flush count exceeded on ${deviceId}: ${count} flushes today (threshold: ${rule.threshold}).`;
          severity = 'low';
        }
      }
      break;
    }

    default:
      // Unknown trigger — skip
      break;
  }

  if (triggered) {
    const debounced = await isDebounced(alertType, deviceId);
    if (!debounced) {
      await createAlertAndMaybeTask({
        type: alertType,
        message,
        severity,
        deviceId,
        isHardwareFailure,
      });
    } else {
      console.log(`[AlertEngine] Debounced alert: ${alertType}`);
    }
  }
}
