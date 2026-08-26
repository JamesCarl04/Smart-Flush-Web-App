import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { dispatchAutomatedTaskAndNotify } from './task-service';
import { normalizeRepeatIntervalMinutes, planRoutineCycle } from './automation-policy';
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
  repeatIntervalMinutes?: number;
}

export interface NoWaterState {
  pending: boolean;
  dueAtMs: number | null;
  dryCycles: number;
}

export interface PumpTransitionResult {
  transitionedToActive: boolean;
  completedCycle: boolean;
  routineCycleCount: number;
  pendingThresholdEvents: PendingThresholdEvent[];
  noWaterDueAtMs: number | null;
}

export interface PendingThresholdEvent {
  eventId?: string;
  ruleId: string;
  deviceId: string;
  cycleCount?: number;
}

export interface AutomationStore {
  getEnabledRules(): Promise<AutomationRule[]>;
  getRule(id: string): Promise<AutomationRule | null>;
  dispatchThreshold(rule: AutomationRule, deviceId: string, cycleCount?: number, eventId?: string): Promise<'created' | 'merged' | 'pending' | 'consumed'>;
  createAlert(deviceId: string, trigger: AutomationRuleTrigger): Promise<void>;
  getNoWaterState(deviceId: string): Promise<NoWaterState>;
  setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void>;
  clearNoWaterPending(deviceId: string): Promise<void>;
  consumePendingDryCycle(deviceId: string, nowMs: number): Promise<number | null>;
  recordPositiveFlow(deviceId: string): Promise<void>;
  recordPumpTransition(
    deviceId: string,
    status: 'active' | 'inactive',
    options: {
      nowMs: number;
      routineRules: Array<{ ruleId: string; threshold: number }>;
      noWaterWaitMs: number | null;
    },
  ): Promise<PumpTransitionResult>;
  getPendingThresholdEvents(nowMs: number): Promise<PendingThresholdEvent[]>;
  acknowledgePendingThresholdEvent(eventId: string): Promise<void>;
  getInvalidUltrasonicSince(deviceId: string): Promise<number | null>;
  setInvalidUltrasonicSince(deviceId: string, value: number | null): Promise<void>;
}

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
      await this.store.setInvalidUltrasonicSince(deviceId, null);
      return;
    }

    const heartbeatAt = this.heartbeats.get(deviceId);
    if (heartbeatAt === undefined || now - heartbeatAt > HEARTBEAT_FRESH_MS) return;

    const persistedSince = await this.store.getInvalidUltrasonicSince(deviceId);
    const startedAt = persistedSince ?? now;
    if (persistedSince === null) await this.store.setInvalidUltrasonicSince(deviceId, startedAt);
    for (const rule of await this.enabledRules('ultrasonic_sensor_fault')) {
      if (now - startedAt >= rule.threshold * 1000 && await this.dispatch(rule, deviceId)) {
        await this.store.setInvalidUltrasonicSince(deviceId, now);
      }
    }
  }

  async handleCompletedFlow(
    deviceId: string,
    payload: { volume: number; duration: number; unit: string },
    _flushCycleCount: number,
  ): Promise<void> {
    await this.store.recordPositiveFlow(deviceId);
    for (const rule of await this.enabledRules('water_overuse')) {
      if (payload.volume > rule.threshold) await this.dispatch(rule, deviceId);
    }
  }

  async handlePumpEvent(deviceId: string, payload: { status?: unknown }): Promise<void> {
    if (payload.status !== 'active' && payload.status !== 'inactive') return;
    const [routineRules, noWaterRules] = await Promise.all([
      this.enabledRules('maintenance_due'),
      this.enabledRules('no_water_after_flush'),
    ]);
    const waitSeconds = noWaterRules.length > 0
      ? Math.min(...noWaterRules.map((rule) => isFinitePositive(rule.waterWaitSeconds) ? rule.waterWaitSeconds : 8))
      : null;
    const transition = await this.store.recordPumpTransition(deviceId, payload.status, {
      nowMs: this.now(),
      routineRules: routineRules.map((rule) => ({ ruleId: rule.id, threshold: rule.threshold })),
      noWaterWaitMs: waitSeconds === null ? null : waitSeconds * 1000,
    });
    if (transition.noWaterDueAtMs !== null) {
      const dueAtMs = transition.noWaterDueAtMs;
      this.schedule(() => {
        void this.processDueNoWaterCheck(deviceId).catch((error) => {
          console.error(`[Automation] Scheduled no-water check failed for ${deviceId}:`, error);
        });
      }, Math.max(0, dueAtMs - this.now()));
    }
    for (const event of transition.pendingThresholdEvents) {
      await this.processPendingEvent(event);
    }
  }

  async processDueNoWaterCheck(deviceId: string): Promise<void> {
    const state = await this.store.getNoWaterState(deviceId);
    if (!state.pending || state.dueAtMs === null || state.dueAtMs > this.now()) return;
    const rules = await this.enabledRules('no_water_after_flush');
    if (rules.length === 0) {
      await this.store.clearNoWaterPending(deviceId);
      return;
    }
    const dryCycles = await this.store.consumePendingDryCycle(
      deviceId,
      this.now(),
    );
    if (dryCycles === null) return;
    for (const rule of rules) {
      if (dryCycles >= rule.threshold) await this.dispatch(rule, deviceId);
    }
  }

  async processPendingThresholdEvents(): Promise<void> {
    let pending: PendingThresholdEvent[];
    try {
      pending = await this.store.getPendingThresholdEvents(this.now());
    } catch (error) {
      console.error('[Automation] Pending threshold query failed:', error);
      return;
    }
    for (const event of pending) {
      try {
        await this.processPendingEvent(event);
      } catch (error) {
        console.error(`[Automation] Pending threshold dispatch failed for ${event.deviceId}/${event.ruleId}:`, error);
      }
    }
  }

  private async processPendingEvent(event: PendingThresholdEvent): Promise<void> {
    const rule = await this.store.getRule(event.ruleId);
    if (rule && isRunnableRule(rule) && TASK_ACTIONS.has(rule.action)) {
      const dispatched = await this.dispatch(rule, event.deviceId, event.cycleCount, event.eventId);
      if (dispatched) return;
    }
    if (event.eventId) await this.store.acknowledgePendingThresholdEvent(event.eventId);
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
    eventId?: string,
  ): Promise<boolean> {
    const current = await this.store.getRule(cachedRule.id);
    if (!current || current.trigger !== cachedRule.trigger || !isRunnableRule(current) || !TASK_ACTIONS.has(current.action)) return false;
    const outcome = await this.store.dispatchThreshold(current, deviceId, cycleCount, eventId);
    if (outcome === 'consumed') return true;
    try {
      await this.store.createAlert(deviceId, current.trigger);
    } catch (error) {
      console.error(`[Automation] Alert audit write failed for ${deviceId}/${current.trigger}:`, error);
    }
    return true;
  }
}

function timestampMillis(value: unknown): number | null {
  return value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function'
    ? value.toMillis()
    : null;
}

function pendingDryAttemptMillis(data: Record<string, unknown>): number[] {
  const explicit = Array.isArray(data.pendingDryAttemptDueAt)
    ? data.pendingDryAttemptDueAt
      .map((value) => timestampMillis(value))
      .filter((value): value is number => value !== null)
    : [];
  const legacyDueAt = data.pendingWaterCheck === true ? timestampMillis(data.noWaterDueAt) : null;
  return [
    ...explicit,
    ...(explicit.length === 0 && legacyDueAt !== null ? [legacyDueAt] : []),
  ].sort((left, right) => left - right);
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

  async dispatchThreshold(rule: AutomationRule, deviceId: string, cycleCount?: number, eventId?: string): Promise<'created' | 'merged' | 'pending' | 'consumed'> {
    const contract = taskContract(rule);
    const result = await dispatchAutomatedTaskAndNotify({
      deviceId,
      triggerType: contract.triggerType,
      automationRuleId: rule.id,
      automationTrigger: contract.automationTrigger,
      message: contract.message,
      repeatIntervalMinutes: normalizeRepeatIntervalMinutes(rule.repeatIntervalMinutes),
      ...(cycleCount === undefined ? {} : { cycleCountAtTrigger: cycleCount }),
      ...(eventId === undefined ? {} : { pendingEventId: eventId }),
    });
    return result.outcome;
  }

  async createAlert(deviceId: string, trigger: AutomationRuleTrigger): Promise<void> {
    const doc = adminDb.collection('alerts').doc();
    await doc.set({ id: doc.id, deviceId, type: trigger, severity: 'medium', acknowledged: false, timestamp: Timestamp.now() });
  }

  async getNoWaterState(deviceId: string): Promise<NoWaterState> {
    const doc = await this.stateRef(deviceId).get();
    const data = doc.data() ?? {};
    const attempts = pendingDryAttemptMillis(data);
    return {
      pending: attempts.length > 0,
      dueAtMs: attempts[0] ?? null,
      dryCycles: typeof data.noWaterConsecutiveCycles === 'number' ? data.noWaterConsecutiveCycles : 0,
    };
  }

  async setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void> {
    const dueAt = Timestamp.fromMillis(dueAtMs);
    await this.stateRef(deviceId).set({
      pendingWaterCheck: true,
      noWaterDueAt: dueAt,
      pendingDryAttemptDueAt: [dueAt],
    }, { merge: true });
  }

  async clearNoWaterPending(deviceId: string): Promise<void> {
    await this.stateRef(deviceId).set({
      pendingWaterCheck: false,
      noWaterDueAt: null,
      pendingDryAttemptDueAt: [],
    }, { merge: true });
  }

  async consumePendingDryCycle(
    deviceId: string,
    nowMs: number,
  ): Promise<number | null> {
    const ref = this.stateRef(deviceId);
    return adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.data() ?? {};
      const attempts = pendingDryAttemptMillis(data);
      const dueAttempts = attempts.filter((dueAtMs) => dueAtMs <= nowMs);
      if (dueAttempts.length === 0) return null;
      const remainingAttempts = attempts.filter((dueAtMs) => dueAtMs > nowMs);
      const current = Number(data.noWaterConsecutiveCycles ?? 0);
      const next = (Number.isFinite(current) ? current : 0) + dueAttempts.length;
      transaction.set(ref, {
        pendingWaterCheck: remainingAttempts.length > 0,
        noWaterDueAt: remainingAttempts.length > 0 ? Timestamp.fromMillis(remainingAttempts[0]) : null,
        pendingDryAttemptDueAt: remainingAttempts.map((dueAtMs) => Timestamp.fromMillis(dueAtMs)),
        noWaterConsecutiveCycles: next,
      }, { merge: true });
      return next;
    });
  }

  async recordPositiveFlow(deviceId: string): Promise<void> {
    const runtimeRef = this.runtimeStateRef(deviceId);
    const noWaterRef = this.stateRef(deviceId);
    await adminDb.runTransaction(async (transaction) => {
      const [runtimeSnapshot, noWaterSnapshot] = await Promise.all([
        transaction.get(runtimeRef),
        transaction.get(noWaterRef),
      ]);
      const noWaterData = noWaterSnapshot.data() ?? {};
      const pendingAttempts = pendingDryAttemptMillis(noWaterData);
      if (runtimeSnapshot.data()?.pumpActive === true) {
        transaction.set(runtimeRef, { pumpAttemptHadFlow: true }, { merge: true });
      }
      transaction.set(noWaterRef, {
        pendingWaterCheck: pendingAttempts.length > 0,
        noWaterDueAt: pendingAttempts.length > 0 ? Timestamp.fromMillis(pendingAttempts[0]) : null,
        pendingDryAttemptDueAt: pendingAttempts.map((dueAtMs) => Timestamp.fromMillis(dueAtMs)),
        noWaterConsecutiveCycles: 0,
      }, { merge: true });
    });
  }

  async recordPumpTransition(
    deviceId: string,
    status: 'active' | 'inactive',
    options: {
      nowMs: number;
      routineRules: Array<{ ruleId: string; threshold: number }>;
      noWaterWaitMs: number | null;
    },
  ): Promise<PumpTransitionResult> {
    const runtimeRef = this.runtimeStateRef(deviceId);
    const noWaterRef = this.stateRef(deviceId);
    const pendingEventRefs = new Map(options.routineRules.map((rule) => [
      rule.ruleId,
      adminDb.collection('automationPendingEvents').doc(),
    ]));
    return adminDb.runTransaction(async (transaction) => {
      const [snapshot, noWaterSnapshot] = await Promise.all([
        transaction.get(runtimeRef),
        transaction.get(noWaterRef),
      ]);
      const data = snapshot.data() ?? {};
      const noWaterData = noWaterSnapshot.data() ?? {};
      const wasActive = data.pumpActive === true;
      const currentCount = Number.isFinite(data.routineCycleCount) ? Number(data.routineCycleCount) : 0;
      if (status === 'active') {
        if (!wasActive) transaction.set(runtimeRef, {
          pumpActive: true,
          pumpAttemptHadFlow: false,
          pumpTransitionUpdatedAt: Timestamp.now(),
        }, { merge: true });
        return {
          transitionedToActive: !wasActive,
          completedCycle: false,
          routineCycleCount: currentCount,
          pendingThresholdEvents: [],
          noWaterDueAtMs: null,
        };
      }
      if (!wasActive) return {
        transitionedToActive: false,
        completedCycle: false,
        routineCycleCount: currentCount,
        pendingThresholdEvents: [],
        noWaterDueAtMs: null,
      };

      const routinePlan = planRoutineCycle(currentCount, options.routineRules);
      const pendingThresholdEvents = routinePlan.pendingEvents.map((event) => ({
        eventId: pendingEventRefs.get(event.ruleId)!.id,
        ruleId: event.ruleId,
        deviceId,
        cycleCount: event.cycleCount,
      }));
      transaction.set(runtimeRef, {
        pumpActive: false,
        pumpAttemptHadFlow: false,
        routineCycleCount: routinePlan.routineCycleCount,
        pumpTransitionUpdatedAt: Timestamp.now(),
      }, { merge: true });
      for (const event of pendingThresholdEvents) {
        transaction.set(pendingEventRefs.get(event.ruleId)!, {
          pending: true,
          type: 'routine_threshold',
          deviceId,
          automationRuleId: event.ruleId,
          cycleCount: event.cycleCount,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      let noWaterDueAtMs: number | null = null;
      if (data.pumpAttemptHadFlow !== true && options.noWaterWaitMs !== null) {
        noWaterDueAtMs = options.nowMs + options.noWaterWaitMs;
        const pendingAttempts = [
          ...pendingDryAttemptMillis(noWaterData),
          noWaterDueAtMs,
        ].sort((left, right) => left - right);
        transaction.set(noWaterRef, {
          pendingWaterCheck: true,
          noWaterDueAt: Timestamp.fromMillis(pendingAttempts[0]),
          pendingDryAttemptDueAt: pendingAttempts.map((dueAtMs) => Timestamp.fromMillis(dueAtMs)),
        }, { merge: true });
      }

      return {
        transitionedToActive: false,
        completedCycle: true,
        routineCycleCount: routinePlan.routineCycleCount,
        pendingThresholdEvents,
        noWaterDueAtMs,
      };
    });
  }

  async getPendingThresholdEvents(nowMs: number): Promise<PendingThresholdEvent[]> {
    const [guardResult, routineResult] = await Promise.allSettled([
      adminDb.collection('automationTaskGuards')
        .where('pending', '==', true)
        .where('nextEligibleAt', '<=', Timestamp.fromMillis(nowMs))
        .limit(50)
        .get(),
      adminDb.collection('automationPendingEvents')
        .where('pending', '==', true)
        .limit(50)
        .get(),
    ]);
    if (guardResult.status === 'rejected') {
      console.error('[Automation] Guard pending-event query failed:', guardResult.reason);
    }
    if (routineResult.status === 'rejected') {
      console.error('[Automation] Routine pending-event query failed:', routineResult.reason);
    }
    const guardSnapshot = guardResult.status === 'fulfilled' ? guardResult.value : { docs: [] };
    const routineSnapshot = routineResult.status === 'fulfilled' ? routineResult.value : { docs: [] };
    const guardEvents = guardSnapshot.docs.flatMap((doc) => {
      const data = doc.data();
      if (typeof data.automationRuleId !== 'string' || typeof data.deviceId !== 'string') return [];
      return [{
        ruleId: data.automationRuleId,
        deviceId: data.deviceId,
        ...(typeof data.pendingCycleCount === 'number' ? { cycleCount: data.pendingCycleCount } : {}),
      }];
    });
    const routineEvents = routineSnapshot.docs.flatMap((doc) => {
      const data = doc.data();
      if (typeof data.automationRuleId !== 'string' || typeof data.deviceId !== 'string') return [];
      return [{
        eventId: doc.id,
        ruleId: data.automationRuleId,
        deviceId: data.deviceId,
        ...(typeof data.cycleCount === 'number' ? { cycleCount: data.cycleCount } : {}),
      }];
    });
    return [...guardEvents, ...routineEvents];
  }

  async acknowledgePendingThresholdEvent(eventId: string): Promise<void> {
    await adminDb.collection('automationPendingEvents').doc(eventId).delete();
  }

  async getInvalidUltrasonicSince(deviceId: string): Promise<number | null> {
    const snapshot = await this.runtimeStateRef(deviceId).get();
    return timestampMillis(snapshot.data()?.invalidUltrasonicSince);
  }

  async setInvalidUltrasonicSince(deviceId: string, value: number | null): Promise<void> {
    await this.runtimeStateRef(deviceId).set({
      invalidUltrasonicSince: value === null ? null : Timestamp.fromMillis(value),
      invalidUltrasonicUpdatedAt: Timestamp.now(),
    }, { merge: true });
  }

  private stateRef(deviceId: string) {
    return adminDb.collection('devices').doc(deviceId).collection('automationState').doc('waterNoFlow');
  }

  private runtimeStateRef(deviceId: string) {
    return adminDb.collection('devices').doc(deviceId).collection('automationState').doc('runtime');
  }

  private now(): number { return Date.now(); }
}

export function createAutomationEngine(): TelemetryAutomationEngine {
  return new TelemetryAutomationEngine(new FirestoreAutomationStore());
}
