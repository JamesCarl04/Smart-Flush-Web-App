jest.mock('./firebase-admin', () => ({ adminDb: {} }));
jest.mock('./task-service', () => ({ createAutomatedTaskAndNotify: jest.fn() }));

import {
  TelemetryAutomationEngine,
  type AutomationRule,
  type AutomationStore,
} from './automation-engine';

const WATER_FLOW = { volume: 3.5, duration: 3, unit: 'L' };

class MemoryStore implements AutomationStore {
  rules: AutomationRule[] = [];
  readonly createdTasks: Array<{ rule: AutomationRule; cycleCount?: number }> = [];
  readonly alerts: string[] = [];
  readonly active = new Set<string>();
  readonly debounced = new Set<string>();
  readonly noWater = new Map<string, { pending: boolean; dueAtMs: number | null; dryCycles: number }>();
  readonly pendingDryAttempts = new Map<string, number[]>();
  dryCycleClaims = 0;
  readonly pump = new Map<string, { active: boolean; routineCycleCount: number; hadFlow: boolean }>();
  pendingEvents: Array<{ eventId?: string; ruleId: string; deviceId: string; cycleCount?: number }> = [];
  readonly invalidSince = new Map<string, number>();
  readonly consumedEventIds = new Set<string>();
  failDispatch = false;
  failAcknowledgeOnce = false;
  dispatchGate: Promise<void> | null = null;

  async getEnabledRules(): Promise<AutomationRule[]> { return this.rules.filter((rule) => rule.enabled); }
  async getRule(id: string): Promise<AutomationRule | null> { return this.rules.find((rule) => rule.id === id) ?? null; }
  async dispatchThreshold(rule: AutomationRule, deviceId: string, cycleCount?: number, eventId?: string): Promise<'created' | 'merged' | 'pending' | 'consumed'> {
    if (this.failDispatch) throw new Error('dispatch unavailable');
    if (this.dispatchGate) await this.dispatchGate;
    if (eventId && this.consumedEventIds.has(eventId)) return 'consumed';
    const outcome = this.active.has(`${deviceId}:${rule.trigger}`)
      ? 'merged' as const
      : this.debounced.has(`${deviceId}:${rule.trigger}`)
        ? 'pending' as const
        : 'created' as const;
    if (eventId) {
      this.consumedEventIds.add(eventId);
      this.pendingEvents = this.pendingEvents.filter((event) => event.eventId !== eventId);
    }
    if (outcome === 'created') this.createdTasks.push({ rule, cycleCount });
    return outcome;
  }
  async createAlert(_deviceId: string, trigger: AutomationRule['trigger']): Promise<void> { this.alerts.push(trigger); }
  async getNoWaterState(deviceId: string) { const state = this.noWater.get(deviceId) ?? { pending: false, dueAtMs: null, dryCycles: 0 }; const attempts = this.pendingDryAttempts.get(deviceId) ?? []; return { ...state, pending: attempts.length > 0, dueAtMs: attempts[0] ?? null }; }
  async setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void> { const state = await this.getNoWaterState(deviceId); this.pendingDryAttempts.set(deviceId, [dueAtMs]); this.noWater.set(deviceId, { ...state, pending: true, dueAtMs }); }
  async clearNoWaterPending(deviceId: string, resetDryCycles: boolean): Promise<void> { const state = await this.getNoWaterState(deviceId); this.pendingDryAttempts.delete(deviceId); this.noWater.set(deviceId, { pending: false, dueAtMs: null, dryCycles: resetDryCycles ? 0 : state.dryCycles }); }
  async consumePendingDryCycle(deviceId: string, nowMs: number): Promise<number | null> { const state = await this.getNoWaterState(deviceId); const attempts = this.pendingDryAttempts.get(deviceId) ?? []; const due = attempts.filter((dueAtMs) => dueAtMs <= nowMs); if (due.length === 0) return null; const remaining = attempts.filter((dueAtMs) => dueAtMs > nowMs); this.pendingDryAttempts.set(deviceId, remaining); this.dryCycleClaims += due.length; const next = state.dryCycles + due.length; this.noWater.set(deviceId, { pending: remaining.length > 0, dueAtMs: remaining[0] ?? null, dryCycles: next }); return next; }
  async resetDryCycles(deviceId: string): Promise<void> { const state = await this.getNoWaterState(deviceId); this.noWater.set(deviceId, { ...state, dryCycles: 0 }); }
  async recordPositiveFlow(deviceId: string): Promise<void> {
    const state = this.pump.get(deviceId);
    if (state?.active) this.pump.set(deviceId, { ...state, hadFlow: true });
    const noWater = await this.getNoWaterState(deviceId);
    this.noWater.set(deviceId, { ...noWater, dryCycles: 0 });
  }
  async recordPumpTransition(
    deviceId: string,
    status: 'active' | 'inactive',
    options: { nowMs: number; routineRules: Array<{ ruleId: string; threshold: number }>; noWaterWaitMs: number | null },
  ) {
    const state = this.pump.get(deviceId) ?? { active: false, routineCycleCount: 0, hadFlow: false };
    if (status === 'active') {
      if (!state.active) this.pump.set(deviceId, { ...state, active: true, hadFlow: false });
      return { transitionedToActive: !state.active, completedCycle: false, routineCycleCount: state.routineCycleCount, pendingThresholdEvents: [], noWaterDueAtMs: null };
    }
    if (!state.active) return { transitionedToActive: false, completedCycle: false, routineCycleCount: state.routineCycleCount, pendingThresholdEvents: [], noWaterDueAtMs: null };
    const cycleCount = state.routineCycleCount + 1;
    const crossed = options.routineRules.filter((item) => cycleCount >= item.threshold);
    const next = { active: false, routineCycleCount: crossed.length > 0 ? 0 : cycleCount, hadFlow: false };
    this.pump.set(deviceId, next);
    const pendingThresholdEvents = crossed.map((item, index) => ({
      eventId: `event-${this.pendingEvents.length + index + 1}`,
      ruleId: item.ruleId,
      deviceId,
      cycleCount,
    }));
    this.pendingEvents.push(...pendingThresholdEvents);
    let noWaterDueAtMs: number | null = null;
    const noWater = await this.getNoWaterState(deviceId);
    if (!state.hadFlow && options.noWaterWaitMs !== null) {
      noWaterDueAtMs = options.nowMs + options.noWaterWaitMs;
      const attempts = [...(this.pendingDryAttempts.get(deviceId) ?? []), noWaterDueAtMs].sort((left, right) => left - right);
      this.pendingDryAttempts.set(deviceId, attempts);
      this.noWater.set(deviceId, { ...noWater, pending: true, dueAtMs: attempts[0] });
    }
    return { transitionedToActive: false, completedCycle: true, routineCycleCount: next.routineCycleCount, pendingThresholdEvents, noWaterDueAtMs };
  }
  async getPendingThresholdEvents() { return this.pendingEvents; }
  async acknowledgePendingThresholdEvent(eventId: string): Promise<void> {
    if (this.failAcknowledgeOnce) {
      this.failAcknowledgeOnce = false;
      throw new Error('event delete unavailable');
    }
    this.pendingEvents = this.pendingEvents.filter((event) => event.eventId !== eventId);
  }
  async getInvalidUltrasonicSince(deviceId: string) { return this.invalidSince.get(deviceId) ?? null; }
  async setInvalidUltrasonicSince(deviceId: string, value: number | null) {
    if (value === null) this.invalidSince.delete(deviceId); else this.invalidSince.set(deviceId, value);
  }
}

function rule(overrides: Partial<AutomationRule>): AutomationRule {
  return {
    id: 'rule-1', group: 'system_alert', trigger: 'water_overuse', threshold: 3,
    action: 'Send Task to Available Maintenance', enabled: true, ...overrides,
  };
}

describe('TelemetryAutomationEngine', () => {
  it('creates water-overuse work only above the calibrated completed-flow threshold', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ threshold: 3 })];
    const engine = new TelemetryAutomationEngine(store, { now: () => 1_000 });

    await engine.handleCompletedFlow('toilet-a', { ...WATER_FLOW, volume: 3 }, 12);
    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 13);

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: undefined }]);
    expect(store.alerts).toEqual(['water_overuse']);
  });

  it('does not infer routine maintenance cycles from water-flow messages', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 200 })];
    const engine = new TelemetryAutomationEngine(store);

    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 199);
    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 200);

    expect(store.createdTasks).toEqual([]);
  });

  it('ignores a trigger stored under the wrong rule group', async () => {
    const store = new MemoryStore();
    store.rules = [rule({
      id: 'wrong-group',
      group: 'maintenance',
      trigger: 'water_overuse',
      threshold: 1,
    })];
    const engine = new TelemetryAutomationEngine(store);

    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 1);

    expect(store.createdTasks).toEqual([]);
  });

  it('requires sustained fresh invalid ultrasonic readings and clears on a valid reading', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'ultrasonic', trigger: 'ultrasonic_sensor_fault', threshold: 10 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now });

    engine.recordHeartbeat('toilet-a');
    await engine.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 1 });
    now = 9_999;
    engine.recordHeartbeat('toilet-a');
    await engine.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 2 });
    now = 10_000;
    engine.recordHeartbeat('toilet-a');
    await engine.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 3 });
    await engine.handleUltrasonic('toilet-a', { distance: 20, unit: 'cm', timestamp: 4 });
    now = 20_000;
    engine.recordHeartbeat('toilet-a');
    await engine.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 5 });

    expect(store.createdTasks).toHaveLength(1);
  });

  it('keeps duplicate and debounce guards scoped to the device and trigger', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ threshold: 2 })];
    store.active.add('toilet-a:water_overuse');
    store.debounced.add('toilet-b:water_overuse');
    const engine = new TelemetryAutomationEngine(store);

    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 1);
    await engine.handleCompletedFlow('toilet-b', WATER_FLOW, 1);
    await engine.handleCompletedFlow('toilet-c', WATER_FLOW, 1);

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: undefined }]);
  });

  it('creates one persistent no-water check, clears it on timely positive flow, and dispatches at the dry-cycle threshold', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 1);
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    expect(await store.getNoWaterState('toilet-a')).toEqual({ pending: false, dueAtMs: null, dryCycles: 0 });

    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 8_000;
    await engine.processDueNoWaterCheck('toilet-a');
    now = 9_000;
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 17_000;
    await engine.processDueNoWaterCheck('toilet-a');

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: undefined }]);
    expect(await store.getNoWaterState('toilet-a')).toEqual({ pending: false, dueAtMs: null, dryCycles: 0 });
  });

  it('consumes one expired water check only once when timer and recovery race', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 8_000;

    await Promise.all([
      engine.processDueNoWaterCheck('toilet-a'),
      engine.processDueNoWaterCheck('toilet-a'),
    ]);

    expect(store.createdTasks).toHaveLength(0);
    expect((await store.getNoWaterState('toilet-a')).dryCycles).toBe(1);
    expect(store.dryCycleClaims).toBe(1);
  });

  it('counts exactly one routine cycle for active to inactive, including a dry attempt', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 1 })];
    const engine = new TelemetryAutomationEngine(store, { schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: 1 }]);
  });

  it('does not start a dry-flow timer until an active pump attempt completes', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    now = 20_000;
    await engine.processDueNoWaterCheck('toilet-a');

    expect(await store.getNoWaterState('toilet-a')).toEqual({ pending: false, dueAtMs: null, dryCycles: 0 });

    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    expect(await store.getNoWaterState('toilet-a')).toEqual({ pending: true, dueAtMs: 28_000, dryCycles: 0 });
  });

  it('preserves an unresolved dry-flow check when another attempt completes', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 1_000;
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });

    expect((await store.getNoWaterState('toilet-a')).dueAtMs).toBe(8_000);
  });

  it('durably counts two completed dry attempts before the first deadline', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 1_000;
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });

    now = 8_000;
    await engine.processDueNoWaterCheck('toilet-a');
    expect((await store.getNoWaterState('toilet-a')).dryCycles).toBe(1);
    now = 9_000;
    await engine.processDueNoWaterCheck('toilet-a');

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: undefined }]);
  });

  it('does not let later positive flow erase an earlier completed dry attempt', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let now = 0;
    const engine = new TelemetryAutomationEngine(store, { now: () => now, schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 1_000;
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handleCompletedFlow('toilet-a', WATER_FLOW, 1);
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 8_000;
    await engine.processDueNoWaterCheck('toilet-a');

    expect((await store.getNoWaterState('toilet-a')).dryCycles).toBe(1);
  });

  it('recovers a routine threshold event persisted before dispatch failed', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 1 })];
    store.failDispatch = true;
    const engine = new TelemetryAutomationEngine(store, { schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await expect(engine.handlePumpEvent('toilet-a', { status: 'inactive' })).rejects.toThrow('dispatch unavailable');
    expect(store.pendingEvents).toEqual([expect.objectContaining({ ruleId: 'routine', deviceId: 'toilet-a', cycleCount: 1 })]);

    store.failDispatch = false;
    await new TelemetryAutomationEngine(store).processPendingThresholdEvents();
    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: 1 }]);
    expect(store.pendingEvents).toEqual([]);
  });

  it('does not replay a routine event when immediate and recovery processing overlap', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 1 })];
    let releaseDispatch!: () => void;
    store.dispatchGate = new Promise((resolve) => { releaseDispatch = resolve; });
    const engine = new TelemetryAutomationEngine(store, { schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    const immediate = engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    await new Promise((resolve) => setImmediate(resolve));
    const recovery = engine.processPendingThresholdEvents();
    await new Promise((resolve) => setImmediate(resolve));
    releaseDispatch();
    await Promise.all([immediate, recovery]);

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: 1 }]);
    expect(store.pendingEvents).toEqual([]);
  });

  it('does not replay a committed routine event after a separate delete failure', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 1 })];
    store.failAcknowledgeOnce = true;
    const engine = new TelemetryAutomationEngine(store, { schedule: () => undefined });

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await expect(engine.handlePumpEvent('toilet-a', { status: 'inactive' })).resolves.toBeUndefined();
    await engine.processPendingThresholdEvents();

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: 1 }]);
    expect(store.pendingEvents).toEqual([]);
    expect(store.failAcknowledgeOnce).toBe(true);
  });

  it('catches and logs rejected Firestore work from a scheduled callback', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'no-water', trigger: 'no_water_after_flush', threshold: 2, waterWaitSeconds: 8 })];
    let scheduled: (() => void) | undefined;
    const engine = new TelemetryAutomationEngine(store, {
      now: () => 0,
      schedule: (callback) => { scheduled = callback; },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    jest.spyOn(store, 'getNoWaterState').mockRejectedValueOnce(new Error('firestore unavailable'));
    scheduled?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scheduled no-water check failed'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('preserves the active pump transition across an engine restart', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'routine', group: 'maintenance', trigger: 'maintenance_due', threshold: 1 })];

    await new TelemetryAutomationEngine(store, { schedule: () => undefined })
      .handlePumpEvent('toilet-a', { status: 'active' });
    await new TelemetryAutomationEngine(store, { schedule: () => undefined })
      .handlePumpEvent('toilet-a', { status: 'inactive' });

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: 1 }]);
  });

  it('preserves sustained invalid-ultrasonic timing across an engine restart', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'ultrasonic', trigger: 'ultrasonic_sensor_fault', threshold: 10 })];
    let now = 0;
    const first = new TelemetryAutomationEngine(store, { now: () => now });
    first.recordHeartbeat('toilet-a');
    await first.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 1 });
    now = 10_000;
    const restarted = new TelemetryAutomationEngine(store, { now: () => now });
    restarted.recordHeartbeat('toilet-a');
    await restarted.handleUltrasonic('toilet-a', { distance: 0, unit: 'cm', timestamp: 2 });

    expect(store.createdTasks).toHaveLength(1);
  });

  it('automatically dispatches a durably pending threshold event at expiry', async () => {
    const store = new MemoryStore();
    store.rules = [rule({ id: 'water-pending', threshold: 3, repeatIntervalMinutes: 1 })];
    store.pendingEvents = [{ ruleId: 'water-pending', deviceId: 'toilet-a' }];

    await new TelemetryAutomationEngine(store).processPendingThresholdEvents();

    expect(store.createdTasks).toEqual([{ rule: store.rules[0], cycleCount: undefined }]);
  });
});
