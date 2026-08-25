// lib/alert-engine.ts
// Evaluates incoming MQTT payloads against automationRules and creates alerts/tasks.
// Called from mqtt-client.ts after every inbound message.
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createTaskAndNotify } from '@/lib/task-service';
import { findAvailableMaintenancePersonnel } from '@/lib/task-assignment';
import type { TaskTriggerType } from '@/lib/task-types';

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

/** Maps rule trigger/alert types to supported TaskTriggerType */
function mapToTaskTriggerType(triggerOrType: string): TaskTriggerType {
  const norm = triggerOrType.toLowerCase();
  if (norm.includes('sensor')) {
    return 'sensor_fault';
  }
  if (norm.includes('uv_cycle') || norm.includes('uv_complete')) {
    return 'uv_complete';
  }
  if (norm.includes('hardware') || norm.includes('pump')) {
    return 'hardware_failure';
  }
  if (norm.includes('flush_count')) {
    return 'flush_count';
  }
  if (norm.includes('water_overuse')) {
    return 'water_overuse';
  }
  return 'maintenance';
}

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
async function hasActiveTaskForDevice(
  deviceId: string,
  triggerType?: TaskTriggerType,
): Promise<boolean> {
  try {
    let query = adminDb
      .collection('tasks')
      .where('deviceId', '==', deviceId)
      .where('status', 'in', [
        'pending',
        'unassigned',
        'assigned',
        'acknowledged',
        'reassignment_needed',
        'rechecking',
      ]);

    if (triggerType) {
      query = query.where('triggerType', '==', triggerType);
    }

    const snap = await query.limit(1).get();
    return !snap.empty;
  } catch (err) {
    console.warn('[AlertEngine] hasActiveTaskForDevice check warning:', err);
    return false;
  }
}

/** Creates an alert document in Firestore and optionally dispatches an automated task to available maintenance */
async function createAlertAndMaybeTask(params: {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  deviceId: string;
  isHardwareFailure?: boolean;
  shouldDispatchTask?: boolean;
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

  // Automatically dispatch a debounced task when specified or on critical hardware failure
  const shouldCreate =
    params.shouldDispatchTask ||
    (params.isHardwareFailure && params.severity === 'high');

  if (shouldCreate) {
    const taskTrigger = mapToTaskTriggerType(params.type);
    const hasActiveTask = await hasActiveTaskForDevice(params.deviceId, taskTrigger);

    if (!hasActiveTask) {
      try {
        // Query active, on-duty technicians who have no active task
        const availableTechnicians = await findAvailableMaintenancePersonnel();

        let assignedTo: string | null = null;
        let assignedToIds: string[] = [];

        if (availableTechnicians.length > 0) {
          const primaryTech = availableTechnicians[0];
          assignedTo = primaryTech.id;
          assignedToIds = [primaryTech.id];
          console.log(
            `[AlertEngine] Auto-assigning task to available technician: ${primaryTech.displayName} (${primaryTech.id})`,
          );
        } else {
          console.log(
            `[AlertEngine] All technicians currently occupied. Created unassigned broadcast task for pool.`,
          );
        }

        await createTaskAndNotify({
          deviceId: params.deviceId,
          triggerType: taskTrigger,
          message: params.message,
          assignedTo,
          assignedToIds,
          createdBy: 'system:automation_rule',
        });

        console.log(
          `[AlertEngine] Successfully dispatched automated task for ${params.deviceId} (trigger: ${taskTrigger})`,
        );
      } catch (err) {
        console.error('[AlertEngine] Failed to create automated task:', err);
      }
    } else {
      console.log(
        `[AlertEngine] Suppressed duplicate task: Active task already pending for ${params.deviceId} (${taskTrigger})`,
      );
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

        const debounced = await isDebounced(alertType, deviceId);
        if (!debounced) {
          await createAlertAndMaybeTask({
            type: alertType,
            message,
            severity: 'high',
            deviceId,
            isHardwareFailure: true,
            shouldDispatchTask: true,
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
  let isHardwareFailure = false;
  const shouldDispatchTask = isSendTaskAction(rule.action);

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
    const debounced = await isDebounced(alertType, deviceId);
    if (!debounced) {
      await createAlertAndMaybeTask({
        type: alertType,
        message,
        severity,
        deviceId,
        isHardwareFailure,
        shouldDispatchTask,
      });
    } else {
      console.log(`[AlertEngine] Debounced alert: ${alertType} for ${deviceId}`);
    }
  }
}
