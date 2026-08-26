const DEFAULT_REPEAT_INTERVAL_MINUTES = 10;

export function normalizeRepeatIntervalMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440
    ? value
    : DEFAULT_REPEAT_INTERVAL_MINUTES;
}

export interface GuardedTaskState {
  id: string;
  status: string;
  completedAtMs: number | null;
}

export type ThresholdDispatchPlan =
  | { kind: 'merge'; taskId: string }
  | { kind: 'pending'; eligibleAtMs: number }
  | { kind: 'create' };

export function planThresholdDispatch(input: {
  nowMs: number;
  nextEligibleAtMs: number | null;
  guardedTask: GuardedTaskState | null;
}): ThresholdDispatchPlan {
  if (input.guardedTask && input.guardedTask.completedAtMs === null && input.guardedTask.status !== 'completed') {
    return { kind: 'merge', taskId: input.guardedTask.id };
  }
  if (input.nextEligibleAtMs !== null && input.nextEligibleAtMs > input.nowMs) {
    return { kind: 'pending', eligibleAtMs: input.nextEligibleAtMs };
  }
  return { kind: 'create' };
}

export interface RoutineThreshold {
  ruleId: string;
  threshold: number;
}

export function planRoutineCycle(
  currentCount: number,
  rules: RoutineThreshold[],
): { routineCycleCount: number; pendingEvents: Array<{ ruleId: string; cycleCount: number }> } {
  const cycleCount = (Number.isFinite(currentCount) && currentCount >= 0 ? currentCount : 0) + 1;
  const pendingEvents = rules
    .filter((rule) => Number.isInteger(rule.threshold) && rule.threshold > 0 && cycleCount >= rule.threshold)
    .map((rule) => ({ ruleId: rule.ruleId, cycleCount }));
  return {
    routineCycleCount: pendingEvents.length > 0 ? 0 : cycleCount,
    pendingEvents,
  };
}
