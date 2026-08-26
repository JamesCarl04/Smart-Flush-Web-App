import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { createAutomatedTaskAndNotify } from './task-service';
import type { AutomationTrigger, TaskTriggerType } from './task-types';

export type AutomationRuleTrigger =
  | 'ultrasonic_sensor_fault'
  | 'water_overuse'
  | 'no_water_after_flush'
  | 'maintenance_due';

export interface AutomationRule {
  id: string;
  group: 'system_alert' | 'maintenance';
  trigger: AutomationRuleTrigger;
  threshold: number;
  action: string;
  enabled: boolean;
  waterWaitSeconds?: number;
}

export interface NoWaterState {
  pending: boolean;
  dueAtMs: number | null;
  dryCycles: number;
}

export interface AutomationStore {
  getEnabledRules(): Promise<AutomationRule[]>;
  getRule(id: string): Promise<AutomationRule | null>;
  hasActiveTask(deviceId: string, trigger: AutomationRuleTrigger): Promise<boolean>;
  isDebounced(deviceId: string, trigger: AutomationRuleTrigger): Promise<boolean>;
  createTask(rule: AutomationRule, deviceId: string, cycleCount?: number): Promise<void>;
  createAlert(deviceId: string, trigger: AutomationRuleTrigger): Promise<void>;
  getNoWaterState(deviceId: string): Promise<NoWaterState>;
  setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void>;
  clearNoWaterPending(deviceId: string, resetDryCycles: boolean): Promise<void>;
  consumePendingDryCycle(deviceId: string, nowMs: number): Promise<number | null>;
  resetDryCycles(deviceId: string): Promise<void>;
}

const ACTIVE_TASK_STATUSES = [
  'unassigned', 'assigned', 'pending', 'acknowledged', 'rechecking', 'flagged', 'reassignment_needed',
];
const DEBOUNCE_MS = 10 * 60 * 1000;
const HEARTBEAT_FRESH_MS = 60_000;
const TASK_ACTIONS = new Set([
  'Send Task to Available Maintenance',
  'Create Maintenance Ticket',
]);

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRunnableRule(rule: AutomationRule): boolean {
  if (!rule.enabled || !isFinitePositive(rule.threshold)) return false;

  switch (rule.trigger) {
    case 'ultrasonic_sensor_fault':
      return rule.group === 'system_alert' && Number.isInteger(rule.threshold) && rule.threshold >= 5 && rule.threshold <= 60;
    case 'water_overuse':
      return rule.group === 'system_alert';
    case 'no_water_after_flush':
      return rule.group === 'system_alert' &&
        Number.isInteger(rule.threshold) && rule.threshold >= 1 && rule.threshold <= 20 &&
        (rule.waterWaitSeconds === undefined ||
          (Number.isInteger(rule.waterWaitSeconds) && rule.waterWaitSeconds >= 5 && rule.waterWaitSeconds <= 30));
    case 'maintenance_due':
      return rule.group === 'maintenance' && Number.isInteger(rule.threshold) && rule.threshold >= 1 && rule.threshold <= 100_000;
  }
}

function isInvalidUltrasonic(payload: { distance: unknown }): boolean {
  return !isFinitePositive(payload.distance) || payload.distance > 400;
}

function taskContract(rule: AutomationRule): {
  automationTrigger: AutomationTrigger;
  triggerType: TaskTriggerType;
  message: string;
} {
  switch (rule.trigger) {
    case 'ultrasonic_sensor_fault':
      return { automationTrigger: rule.trigger, triggerType: 'sensor_fault', message: 'Ultrasonic sensor readings have remained invalid.' };
    case 'water_overuse':
      return { automationTrigger: rule.trigger, triggerType: 'water_overuse', message: 'A completed flush exceeded the configured water limit.' };
    case 'no_water_after_flush':
      return { automationTrigger: rule.trigger, triggerType: 'water_no_flow', message: 'Consecutive pump cycles completed without positive water flow.' };
    case 'maintenance_due':
      return { automationTrigger: rule.trigger, triggerType: 'maintenance', message: 'Routine toilet check is due after completed flush cycles.' };
  }
}

export class TelemetryAutomationEngine {
  private readonly invalidUltrasonicSince = new Map<string, number>();
  private readonly heartbeats = new Map<string, number>();
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => void;

  constructor(
    private readonly store: AutomationStore,
    options: {
      now?: () => number;
      schedule?: (callback: () => void, delayMs: number) => void;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delayMs) => { setTimeout(callback, delayMs); });
  }

  recordHeartbeat(deviceId: string, receivedAtMs = this.now()): void {
    this.heartbeats.set(deviceId, receivedAtMs);
  }

  async handleUltrasonic(
    deviceId: string,
    payload: { distance: number; unit: string; timestamp: number },
  ): Promise<void> {
    const now = this.now();
    if (!isInvalidUltrasonic(payload)) {
      this.invalidUltrasonicSince.delete(deviceId);
      return;
    }

    const heartbeatAt = this.heartbeats.get(deviceId);
    if (heartbeatAt === undefined || now - heartbeatAt > HEARTBEAT_FRESH_MS) return;

    const startedAt = this.invalidUltrasonicSince.get(deviceId) ?? now;
    this.invalidUltrasonicSince.set(deviceId, startedAt);
    for (const rule of await this.enabledRules('ultrasonic_sensor_fault')) {
      if (now - startedAt >= rule.threshold * 1000) await this.dispatch(rule, deviceId);
    }
  }

  async handleCompletedFlow(
    deviceId: string,
    payload: { volume: number; duration: number; unit: string },
    flushCycleCount: number,
  ): Promise<void> {
    await this.clearPendingNoWater(deviceId);
    for (const rule of await this.enabledRules('water_overuse')) {
      if (payload.volume > rule.threshold) await this.dispatch(rule, deviceId);
    }
    for (const rule of await this.enabledRules('maintenance_due')) {
      if (flushCycleCount >= rule.threshold) await this.dispatch(rule, deviceId, flushCycleCount);
    }
  }

  async handlePumpEvent(deviceId: string, payload: { status?: unknown }): Promise<void> {
    if (payload.status !== 'active') return;
    const rule = (await this.enabledRules('no_water_after_flush'))[0];
    if (!rule) return;
    const state = await this.store.getNoWaterState(deviceId);
    if (state.pending) return;
    const dueAtMs = this.now() + (isFinitePositive(rule.waterWaitSeconds) ? rule.waterWaitSeconds : 8) * 1000;
    await this.store.setNoWaterPending(deviceId, dueAtMs);
    this.schedule(() => { void this.processDueNoWaterCheck(deviceId); }, dueAtMs - this.now());
  }

  async processDueNoWaterCheck(deviceId: string): Promise<void> {
    const state = await this.store.getNoWaterState(deviceId);
    if (!state.pending || state.dueAtMs === null || state.dueAtMs > this.now()) return;
    const rules = await this.enabledRules('no_water_after_flush');
    if (rules.length === 0) {
      await this.store.clearNoWaterPending(deviceId, false);
      return;
    }
    const dryCycles = await this.store.consumePendingDryCycle(
      deviceId,
      this.now(),
    );
    if (dryCycles === null) return;
    for (const rule of rules) {
      if (dryCycles >= rule.threshold && await this.dispatch(rule, deviceId)) {
        await this.store.clearNoWaterPending(deviceId, false);
        await this.store.resetDryCycles(deviceId);
      }
    }
  }

  private async clearPendingNoWater(deviceId: string): Promise<void> {
    const state = await this.store.getNoWaterState(deviceId);
    if (state.pending) await this.store.clearNoWaterPending(deviceId, true);
  }

  private async enabledRules(trigger: AutomationRuleTrigger): Promise<AutomationRule[]> {
    return (await this.store.getEnabledRules()).filter((rule) =>
      rule.trigger === trigger && isRunnableRule(rule),
    );
  }

  private async dispatch(
    cachedRule: AutomationRule,
    deviceId: string,
    cycleCount?: number,
  ): Promise<boolean> {
    const current = await this.store.getRule(cachedRule.id);
    if (!current || current.trigger !== cachedRule.trigger || !isRunnableRule(current) || !TASK_ACTIONS.has(current.action)) return false;
    if (await this.store.hasActiveTask(deviceId, current.trigger)) return false;
    if (await this.store.isDebounced(deviceId, current.trigger)) return false;
    await this.store.createTask(current, deviceId, cycleCount);
    await this.store.createAlert(deviceId, current.trigger);
    return true;
  }
}

function timestampMillis(value: unknown): number | null {
  return value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function'
    ? value.toMillis()
    : null;
}

class FirestoreAutomationStore implements AutomationStore {
  async getEnabledRules(): Promise<AutomationRule[]> {
    const snapshot = await adminDb.collection('automationRules').where('enabled', '==', true).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AutomationRule));
  }

  async getRule(id: string): Promise<AutomationRule | null> {
    const doc = await adminDb.collection('automationRules').doc(id).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as AutomationRule) : null;
  }

  async hasActiveTask(deviceId: string, trigger: AutomationRuleTrigger): Promise<boolean> {
    const snapshot = await adminDb.collection('tasks')
      .where('deviceId', '==', deviceId)
      .where('automationTrigger', '==', trigger)
      .where('status', 'in', ACTIVE_TASK_STATUSES)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  async isDebounced(deviceId: string, trigger: AutomationRuleTrigger): Promise<boolean> {
    const snapshot = await adminDb.collection('alerts')
      .where('deviceId', '==', deviceId)
      .where('type', '==', trigger)
      .where('timestamp', '>=', Timestamp.fromMillis(this.now() - DEBOUNCE_MS))
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  async createTask(rule: AutomationRule, deviceId: string, cycleCount?: number): Promise<void> {
    const contract = taskContract(rule);
    await createAutomatedTaskAndNotify({
      deviceId,
      triggerType: contract.triggerType,
      automationRuleId: rule.id,
      automationTrigger: contract.automationTrigger,
      message: contract.message,
      ...(cycleCount === undefined ? {} : { cycleCountAtTrigger: cycleCount }),
    });
  }

  async createAlert(deviceId: string, trigger: AutomationRuleTrigger): Promise<void> {
    const doc = adminDb.collection('alerts').doc();
    await doc.set({ id: doc.id, deviceId, type: trigger, severity: 'medium', acknowledged: false, timestamp: Timestamp.now() });
  }

  async getNoWaterState(deviceId: string): Promise<NoWaterState> {
    const doc = await this.stateRef(deviceId).get();
    const data = doc.data() ?? {};
    return {
      pending: data.pendingWaterCheck === true,
      dueAtMs: timestampMillis(data.noWaterDueAt),
      dryCycles: typeof data.noWaterConsecutiveCycles === 'number' ? data.noWaterConsecutiveCycles : 0,
    };
  }

  async setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void> {
    await this.stateRef(deviceId).set({ pendingWaterCheck: true, noWaterDueAt: Timestamp.fromMillis(dueAtMs) }, { merge: true });
  }

  async clearNoWaterPending(deviceId: string, resetDryCycles: boolean): Promise<void> {
    await this.stateRef(deviceId).set({ pendingWaterCheck: false, noWaterDueAt: null, ...(resetDryCycles ? { noWaterConsecutiveCycles: 0 } : {}) }, { merge: true });
  }

  async consumePendingDryCycle(
    deviceId: string,
    nowMs: number,
  ): Promise<number | null> {
    const ref = this.stateRef(deviceId);
    return adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.data() ?? {};
      const dueAtMs = timestampMillis(data.noWaterDueAt);
      if (
        data.pendingWaterCheck !== true ||
        dueAtMs === null ||
        dueAtMs > nowMs
      ) {
        return null;
      }
      const current = Number(data.noWaterConsecutiveCycles ?? 0);
      const next = Number.isFinite(current) ? current + 1 : 1;
      transaction.set(ref, { pendingWaterCheck: false, noWaterDueAt: null, noWaterConsecutiveCycles: next }, { merge: true });
      return next;
    });
  }

  async resetDryCycles(deviceId: string): Promise<void> {
    await this.stateRef(deviceId).set({ noWaterConsecutiveCycles: 0 }, { merge: true });
  }

  private stateRef(deviceId: string) {
    return adminDb.collection('devices').doc(deviceId).collection('automationState').doc('waterNoFlow');
  }

  private now(): number { return Date.now(); }
}

export function createAutomationEngine(): TelemetryAutomationEngine {
  return new TelemetryAutomationEngine(new FirestoreAutomationStore());
}
