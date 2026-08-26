import {
  normalizeRepeatIntervalMinutes,
  planRoutineCycle,
  planThresholdDispatch,
} from './automation-policy';

describe('automation dispatch policy', () => {
  it.each([
    [undefined, 10],
    [null, 10],
    [0, 10],
    [1, 1],
    [10, 10],
    [37, 37],
    [1440, 1440],
    [1.5, 10],
    [1441, 10],
  ])('normalizes repeat interval %p to %p minutes', (value, expected) => {
    expect(normalizeRepeatIntervalMinutes(value)).toBe(expected);
  });

  it('merges an occurrence into a related active task', () => {
    expect(planThresholdDispatch({
      nowMs: 120_000,
      nextEligibleAtMs: 600_000,
      guardedTask: { id: 'task-active', status: 'assigned', completedAtMs: null },
    })).toEqual({ kind: 'merge', taskId: 'task-active' });
  });

  it('treats completedAt as completion even when legacy status is active', () => {
    expect(planThresholdDispatch({
      nowMs: 120_000,
      nextEligibleAtMs: 600_000,
      guardedTask: { id: 'task-stale', status: 'pending', completedAtMs: 100_000 },
    })).toEqual({ kind: 'pending', eligibleAtMs: 600_000 });
  });

  it('creates at exact cooldown expiry and waits one millisecond before it', () => {
    expect(planThresholdDispatch({
      nowMs: 599_999,
      nextEligibleAtMs: 600_000,
      guardedTask: null,
    })).toEqual({ kind: 'pending', eligibleAtMs: 600_000 });
    expect(planThresholdDispatch({
      nowMs: 600_000,
      nextEligibleAtMs: 600_000,
      guardedTask: null,
    })).toEqual({ kind: 'create' });
  });

  it('atomically converts an exact routine threshold crossing into durable events and resets the counter', () => {
    expect(planRoutineCycle(4, [
      { ruleId: 'routine-five', threshold: 5 },
      { ruleId: 'routine-ten', threshold: 10 },
    ])).toEqual({
      routineCycleCount: 0,
      pendingEvents: [{ ruleId: 'routine-five', cycleCount: 5 }],
    });
  });

  it('retains the increment when no routine threshold is crossed', () => {
    expect(planRoutineCycle(4, [{ ruleId: 'routine-ten', threshold: 10 }])).toEqual({
      routineCycleCount: 5,
      pendingEvents: [],
    });
  });
});
