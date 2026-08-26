import {
  isUnfinishedTask,
  shouldClearAutomationGuard,
  technicianAvailabilityAfterRelease,
} from '@/lib/task-lifecycle';

describe('task lifecycle helpers', () => {
  it('treats completedAt as authoritative over a stale active status', () => {
    expect(isUnfinishedTask({ status: 'pending', completedAt: { toMillis: () => 1 } })).toBe(false);
    expect(isUnfinishedTask({ status: 'assigned', completedAt: null })).toBe(true);
  });

  it('keeps a previous assignee unavailable when another unfinished task remains', () => {
    expect(technicianAvailabilityAfterRelease('tech-1', 'released', [
      { id: 'released', status: 'assigned', assignedTo: 'tech-1', assignedToIds: ['tech-1'], completedAt: null },
      { id: 'other', status: 'acknowledged', assignedTo: 'tech-1', assignedToIds: ['tech-1'], completedAt: null },
    ])).toEqual({ currentTaskId: 'other', isAvailable: false });
  });

  it('marks a technician available only when no unfinished assignment remains', () => {
    expect(technicianAvailabilityAfterRelease('tech-1', 'released', [
      { id: 'released', status: 'completed', assignedTo: 'tech-1', assignedToIds: ['tech-1'], completedAt: { toMillis: () => 1 } },
    ])).toEqual({ currentTaskId: null, isAvailable: true });
  });

  it('clears active and pending guard state only when it links to the deleted task', () => {
    expect(shouldClearAutomationGuard('task-deleted', { taskId: 'task-deleted', pending: true })).toBe(true);
    expect(shouldClearAutomationGuard('task-deleted', { taskId: 'task-newer', pending: true })).toBe(false);
  });
});
