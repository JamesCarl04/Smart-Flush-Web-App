// lib/alert-engine.ts
// Evaluates incoming MQTT payloads against automationRules and creates alerts/tasks.
// Called from mqtt-client.ts after every inbound message.
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getRepeatIntervalMinutes } from '@/lib/automation-rule-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  group: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
  repeatIntervalMinutes?: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Checks if a rule's action specifies dispatching a task to maintenance personnel */
export function isSendTaskAction(action?: string): boolean {
  if (!action) return false;
  const normalized = action.toLowerCase().trim();
  return (
    normalized === 'send task to available maintenance' ||
    normalized === 'create maintenance ticket' ||
    normalized.includes('send task') ||
    normalized.includes('maintenance ticket') ||
    normalized.includes('create task')
  );
}

/** Returns true if an alert of this type was already created within the debounce window */
async function isDebounced(alertType: string, deviceId: string, repeatIntervalMinutes: unknown): Promise<boolean> {
  const cutoff = Timestamp.fromMillis(Date.now() - getRepeatIntervalMinutes(repeatIntervalMinutes) * 60_000);
  const snap = await adminDb
    .collection('alerts')
    .where('deviceId', '==', deviceId)
    .where('type', '==', alertType)
    .where('timestamp', '>=', cutoff)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Creates an audit alert. Transactional automation task dispatch belongs to the listener. */
async function createAuditAlert(params: {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  deviceId: string;
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
 * Evaluates automationRules & hardware failure events against an incoming MQTT payload.
 * Creates debounced alerts and dispatches tasks to available maintenance personnel in Firestore when triggers are met.
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

        const debounced = await isDebounced(alertType, deviceId, undefined);
        if (!debounced) {
          await createAuditAlert({
            type: alertType,
            message,
            severity: 'high',
            deviceId,
          });
        }
        return;
      }
    }

    // 2. Load all enabled automation rules (both system_alert and maintenance groups)
    const rulesSnap = await adminDb
      .collection('automationRules')
      .where('enabled', '==', true)
      .get();

    const rules = rulesSnap.docs
      .map((d) => d.data() as AutomationRule)
      .filter((rule) => rule.group === 'system_alert' || rule.group === 'maintenance');

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

  switch (rule.trigger) {
    case 'uv_cycle_failed': {
      if (topic === 'toilet/events/uv') {
        const p = payload as UVPayload;
        if (p.completed === false) {
          triggered = true;
          message = `UV sterilisation cycle failed to complete on ${deviceId}. Inspect UV-C emitter.`;
          severity = 'high';
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
          message = `Flush count threshold exceeded on ${deviceId}: ${count} flushes today (threshold: ${rule.threshold}).`;
          severity = 'low';
          alertType = 'flush_count_exceeded';
        }
      }
      break;
    }

    case 'maintenance_due': {
      if (
        topic === 'toilet/sensors/waterflow' ||
        topic === 'toilet/events/pump' ||
        topic === 'toilet/events/uv'
      ) {
        const count = await todayFlushCount(deviceId);
        if (count >= rule.threshold) {
          triggered = true;
          message = `Routine maintenance due on ${deviceId}: ${count} cycles reached (threshold: ${rule.threshold}).`;
          severity = 'medium';
          alertType = 'maintenance_due';
        }
      }
      break;
    }

    default:
      // Unknown trigger — skip
      break;
  }

  if (triggered) {
    const debounced = await isDebounced(alertType, deviceId, rule.repeatIntervalMinutes);
    if (!debounced) {
      await createAuditAlert({
        type: alertType,
        message,
        severity,
        deviceId,
      });
    } else {
      console.log(`[AlertEngine] Debounced alert: ${alertType} for ${deviceId}`);
    }
  }
}
