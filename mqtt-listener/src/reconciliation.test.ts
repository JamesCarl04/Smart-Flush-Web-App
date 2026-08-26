import { classifyAutomationRepairs } from './reconciliation';

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
});
