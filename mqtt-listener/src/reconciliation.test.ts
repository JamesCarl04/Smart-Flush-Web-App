import {
  classifyAutomationRepairs,
  revalidateGuardRepair,
  revalidateTaskRepair,
  revalidateTechnicianRepair,
} from './reconciliation';

describe('automation reconciliation classification', () => {
  it('classifies stale completion, invalid technician state, and stale guards without deleting history', () => {
    expect(classifyAutomationRepairs({
      tasks: [
        { id: 'done-stale', status: 'pending', completedAtMs: 100 },
        { id: 'active', status: 'assigned', completedAtMs: null, assignedToIds: ['tech-valid'] },
      ],
      technicians: [
        { id: 'tech-valid', currentTaskId: 'active', isAvailable: false },
        { id: 'tech-missing', currentTaskId: 'missing', isAvailable: false },
        { id: 'tech-idle', currentTaskId: null, isAvailable: false },
      ],
      guards: [
        { id: 'guard-active', taskId: 'active' },
        { id: 'guard-missing', taskId: 'missing' },
        { id: 'guard-complete', taskId: 'done-stale' },
      ],
    })).toEqual({
      taskRepairs: [{ id: 'done-stale', status: 'completed' }],
      technicianRepairs: [
        { id: 'tech-missing', currentTaskId: null, isAvailable: true },
        { id: 'tech-idle', currentTaskId: null, isAvailable: true },
      ],
      guardRepairs: [
        { id: 'guard-missing', clearTask: true, clearPending: true },
        { id: 'guard-complete', clearTask: true, clearPending: false },
      ],
    });
  });

  it('unions assignedTo with assignedToIds even when the array exists but is empty', () => {
    expect(classifyAutomationRepairs({
      tasks: [{
        id: 'active', status: 'assigned', completedAtMs: null,
        assignedTo: 'tech-1', assignedToIds: [],
      }],
      technicians: [{ id: 'tech-1', currentTaskId: null, isAvailable: true }],
      guards: [],
    }).technicianRepairs).toEqual([
      { id: 'tech-1', currentTaskId: 'active', isAvailable: false },
    ]);
  });

  it('drops stale repair plans when current documents no longer violate the invariant', () => {
    expect(revalidateTaskRepair({ id: 'task-1', status: 'completed', completedAtMs: 1 })).toBeNull();
    expect(revalidateTechnicianRepair(
      { id: 'tech-1', currentTaskId: 'task-1', isAvailable: false },
      [{ id: 'task-1', status: 'assigned', completedAtMs: null, assignedTo: 'tech-1', assignedToIds: [] }],
    )).toBeNull();
    expect(revalidateGuardRepair(
      { id: 'guard-1', taskId: 'task-1' },
      { id: 'task-1', status: 'assigned', completedAtMs: null },
    )).toBeNull();
  });
});
