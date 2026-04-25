// lib/alert-engine.ts
// Evaluates incoming MQTT payloads against automationRules and creates alerts.
// Called from mqtt-client.ts after every inbound message.
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
async function isDebounced(alertType: string): Promise<boolean> {
  const cutoff = Timestamp.fromMillis(Date.now() - DEBOUNCE_MS);
  const snap = await adminDb
    .collection('alerts')
    .where('type', '==', alertType)
    .where('timestamp', '>=', cutoff)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Creates an alert document in Firestore */
async function createAlert(params: {
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
 * Evaluates system_alert automationRules against an incoming MQTT payload.
 * Creates debounced alerts in Firestore when triggers are met.
 */
export async function evaluateAlerts(
  topic: string,
  payload: MqttPayload,
  deviceId: string,
): Promise<void> {
  try {
    // Load enabled system_alert rules
    const rulesSnap = await adminDb
      .collection('automationRules')
      .where('group', '==', 'system_alert')
      .where('enabled', '==', true)
      .get();

    const rules = rulesSnap.docs.map((d) => d.data() as AutomationRule);

    for (const rule of rules) {
      await evaluateRule(rule, topic, payload, deviceId);
    }

    // TODO: device_offline detection requires a scheduled job (cron) since MQTT
    // is push-only — the server cannot know a device is silent without polling.
    // Implement via a separate /api/alerts/check-offline route called by the frontend.
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
          message = 'UV sterilisation cycle failed to complete.';
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
          message = `Water overuse detected: ${p.volume}L exceeds threshold of ${rule.threshold}L.`;
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
          message = `Flush count exceeded: ${count} flushes today (threshold: ${rule.threshold}).`;
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
    const debounced = await isDebounced(alertType);
    if (!debounced) {
      await createAlert({ type: alertType, message, severity, deviceId });
    } else {
      console.log(`[AlertEngine] Debounced alert: ${alertType}`);
    }
  }
}
