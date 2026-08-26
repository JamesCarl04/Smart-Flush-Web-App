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
  dryCycleClaims = 0;
  readonly pump = new Map<string, { active: boolean; routineCycleCount: number }>();
  pendingEvents: Array<{ ruleId: string; deviceId: string; cycleCount?: number }> = [];
  readonly invalidSince = new Map<string, number>();

  async getEnabledRules(): Promise<AutomationRule[]> { return this.rules.filter((rule) => rule.enabled); }
  async getRule(id: string): Promise<AutomationRule | null> { return this.rules.find((rule) => rule.id === id) ?? null; }
  async dispatchThreshold(rule: AutomationRule, deviceId: string, cycleCount?: number): Promise<'created' | 'merged' | 'pending'> {
    if (this.active.has(`${deviceId}:${rule.trigger}`)) return 'merged';
    if (this.debounced.has(`${deviceId}:${rule.trigger}`)) return 'pending';
    this.createdTasks.push({ rule, cycleCount });
    return 'created';
  }
  async createAlert(_deviceId: string, trigger: AutomationRule['trigger']): Promise<void> { this.alerts.push(trigger); }
  async getNoWaterState(deviceId: string) { return this.noWater.get(deviceId) ?? { pending: false, dueAtMs: null, dryCycles: 0 }; }
  async setNoWaterPending(deviceId: string, dueAtMs: number): Promise<void> { const state = await this.getNoWaterState(deviceId); this.noWater.set(deviceId, { ...state, pending: true, dueAtMs }); }
  async clearNoWaterPending(deviceId: string, resetDryCycles: boolean): Promise<void> { const state = await this.getNoWaterState(deviceId); this.noWater.set(deviceId, { pending: false, dueAtMs: null, dryCycles: resetDryCycles ? 0 : state.dryCycles }); }
  async consumePendingDryCycle(deviceId: string, nowMs: number): Promise<number | null> { const state = this.noWater.get(deviceId) ?? { pending: false, dueAtMs: null, dryCycles: 0 }; if (!state.pending || state.dueAtMs === null || state.dueAtMs > nowMs) return null; this.dryCycleClaims += 1; const next = state.dryCycles + 1; this.noWater.set(deviceId, { pending: false, dueAtMs: null, dryCycles: next }); return next; }
  async resetDryCycles(deviceId: string): Promise<void> { const state = await this.getNoWaterState(deviceId); this.noWater.set(deviceId, { ...state, dryCycles: 0 }); }
  async recordPumpTransition(deviceId: string, status: 'active' | 'inactive') {
    const state = this.pump.get(deviceId) ?? { active: false, routineCycleCount: 0 };
    if (status === 'active') {
      this.pump.set(deviceId, { ...state, active: true });
      return { transitionedToActive: !state.active, completedCycle: false, routineCycleCount: state.routineCycleCount };
    }
    if (!state.active) return { transitionedToActive: false, completedCycle: false, routineCycleCount: state.routineCycleCount };
    const next = { active: false, routineCycleCount: state.routineCycleCount + 1 };
    this.pump.set(deviceId, next);
    return { transitionedToActive: false, completedCycle: true, routineCycleCount: next.routineCycleCount };
  }
  async getPendingThresholdEvents() { return this.pendingEvents; }
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

    await engine.handlePumpEvent('toilet-a', { status: 'active' });
    now = 8_000;
    await engine.processDueNoWaterCheck('toilet-a');
    await engine.handlePumpEvent('toilet-a', { status: 'inactive' });
    now = 9_000;
    await engine.handlePumpEvent('toilet-a', { status: 'active' });
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
