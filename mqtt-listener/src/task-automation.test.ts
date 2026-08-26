const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();
const mockSendTaskNotification = jest.fn();

jest.mock('./firebase-admin', () => ({
  adminDb: {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  },
}));

jest.mock('./fcm', () => ({
  sendTaskNotification: mockSendTaskNotification,
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ toMillis: () => 1_000 })),
    fromMillis: jest.fn((millis: number) => ({ toMillis: () => millis })),
  },
}));

import {
  createAutomatedTaskAndNotify,
  dispatchAutomatedTaskAndNotify,
  findAvailableMaintenancePersonnel,
} from './task-service';
import type { TaskDoc } from './task-types';

const automationInput = {
  deviceId: 'toilet-01',
  triggerType: 'water_overuse' as const,
  automationRuleId: 'rule-water',
  automationTrigger: 'water_overuse' as const,
  message: 'Water use exceeded the configured limit.',
};

function snapshot(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
) {
  return {
    empty: docs.length === 0,
    docs: docs.map(({ id, data }) => ({ id, data: () => data })),
  };
}

function guardedAutomationTask(status: 'assigned' | 'unassigned'): TaskDoc {
  return {
    id: 'existing-task',
    deviceId: 'toilet-01',
    triggerType: 'water_overuse',
    message: 'Existing automated work.',
    status,
    assignedTo: status === 'assigned' ? 'tech-1' : null,
    assignedToIds: status === 'assigned' ? ['tech-1'] : [],
    isBroadcast: false,
    createdAt: {} as TaskDoc['createdAt'],
    updatedAt: {} as TaskDoc['updatedAt'],
    assignedAt: null,
    acknowledgedAt: null,
    completedAt: null,
    createdBy: 'system:mqtt',
    automationRuleId: 'rule-water',
    automationTrigger: 'water_overuse',
    requiresSupervisorAssignment: status === 'unassigned',
  };
}

function setUpExistingGuard(transaction: { get: jest.Mock; set: jest.Mock; update: jest.Mock }, task: TaskDoc) {
  const guardRef = { id: 'guard-toilet-01-water-overuse' };
  const existingTaskRef = { id: 'existing-task' };
  const newTaskRef = { id: 'new-task' };
  const userRef = { id: 'tech-1' };
  const tasks = {
    doc: jest.fn((id?: string) => (id ? existingTaskRef : newTaskRef)),
    where: jest.fn(() => ({ get: jest.fn() })),
  };

  mockCollection.mockImplementation((name: string) => {
    if (name === 'tasks') return tasks;
    if (name === 'automationTaskGuards') {
      return { doc: jest.fn(() => guardRef) };
    }
    return { doc: jest.fn(() => userRef), where: jest.fn(() => ({ get: jest.fn() })) };
  });
  mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
  transaction.get
    .mockResolvedValueOnce({ exists: true, data: () => ({ taskId: 'existing-task' }) })
    .mockResolvedValueOnce({ data: () => task })
    .mockResolvedValueOnce(snapshot([]))
    .mockResolvedValueOnce(snapshot([]));
}

describe('automated listener task dispatch', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockRunTransaction.mockReset();
    mockCollection.mockReset();
    mockSendTaskNotification.mockReset();
    consoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => consoleError.mockRestore());

  it('selects only idle, online, active technicians, least recently auto-assigned first', async () => {
    const usersQuery = { get: jest.fn() };
    const tasksQuery: { where: jest.Mock; get: jest.Mock } = {
      where: jest.fn(),
      get: jest.fn(),
    };
    tasksQuery.where.mockReturnValue(tasksQuery);
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { where: jest.fn(() => usersQuery) };
      }
      return tasksQuery;
    });
    usersQuery.get.mockResolvedValue(
      snapshot([
        { id: 'recent', data: { isOnline: true, isActive: true, lastAutoAssignedAt: { toMillis: () => 800 } } },
        { id: 'idle-z', data: { isOnline: true, isActive: true } },
        { id: 'idle-a', data: { isOnline: true, isActive: true } },
        { id: 'busy', data: { isOnline: true, isActive: true } },
        { id: 'offline', data: { isOnline: false, isActive: true } },
        { id: 'inactive', data: { isOnline: true, isActive: false } },
        { id: 'unavailable', data: { isOnline: true, isActive: true, isAvailable: false } },
        { id: 'stale-done', data: { isOnline: true, isActive: true } },
      ]),
    );
    tasksQuery.get.mockResolvedValue(
      snapshot([
        { id: 'task-busy', data: { assignedTo: 'busy', status: 'assigned', completedAt: null } },
        { id: 'task-stale', data: { assignedTo: 'stale-done', status: 'pending', completedAt: { toMillis: () => 700 } } },
      ]),
    );

    await expect(findAvailableMaintenancePersonnel()).resolves.toEqual([
      expect.objectContaining({ uid: 'idle-a' }),
      expect.objectContaining({ uid: 'idle-z' }),
      expect.objectContaining({ uid: 'stale-done' }),
      expect.objectContaining({ uid: 'recent' }),
    ]);
  });

  it('persists an assigned task and notifies only the selected technician', async () => {
    const taskRef = { id: 'task-1' };
    const techRef = { id: 'tech-1' };
    const transaction = {
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
    };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') {
        return {
          doc: jest.fn(() => taskRef),
          where: jest.fn(() => ({ where: jest.fn(() => ({ get: jest.fn() })) })),
        };
      }
      return { doc: jest.fn(() => techRef), where: jest.fn(() => ({ get: jest.fn() })) };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce(snapshot([{ id: 'tech-1', data: { isOnline: true, isActive: true } }]))
      .mockResolvedValueOnce(snapshot([]));

    const task = await createAutomatedTaskAndNotify(automationInput);

    expect(task).toEqual(expect.objectContaining({
      id: 'task-1', status: 'assigned', assignedTo: 'tech-1', assignedToIds: ['tech-1'],
      isBroadcast: false, requiresSupervisorAssignment: false,
      assignmentSource: 'initial_auto', autoAssignmentEligibleAt: null,
    }));
    expect(transaction.set).toHaveBeenCalledWith(taskRef, expect.objectContaining({
      automationRuleId: 'rule-water', automationTrigger: 'water_overuse', status: 'assigned',
    }));
    expect(transaction.update).toHaveBeenCalledWith(techRef, expect.anything());
    expect(mockSendTaskNotification).toHaveBeenCalledWith(task);
  });

  it('returns an existing guarded assigned task without another write or notification', async () => {
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
    const existingTask = guardedAutomationTask('assigned');
    setUpExistingGuard(transaction, existingTask);

    await expect(createAutomatedTaskAndNotify(automationInput)).resolves.toEqual(expect.objectContaining({
      id: existingTask.id, occurrenceCount: 2,
    }));

    expect(transaction.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pending: false }), { merge: true });
    expect(transaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ occurrenceCount: 2 }));
    expect(mockSendTaskNotification).not.toHaveBeenCalled();
  });

  it('returns an existing guarded unassigned task without another write or notification', async () => {
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
    const existingTask = guardedAutomationTask('unassigned');
    setUpExistingGuard(transaction, existingTask);

    await expect(createAutomatedTaskAndNotify(automationInput)).resolves.toEqual(expect.objectContaining({
      id: existingTask.id, occurrenceCount: 2,
    }));

    expect(transaction.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pending: false }), { merge: true });
    expect(transaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ occurrenceCount: 2 }));
    expect(mockSendTaskNotification).not.toHaveBeenCalled();
  });

  it('consumes a durable routine event in the same transaction as its occurrence merge', async () => {
    const eventRef = { id: 'event-1' };
    const guardRef = { id: 'guard' };
    const taskRef = { id: 'existing-task' };
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn(), delete: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'automationPendingEvents') return { doc: jest.fn(() => eventRef) };
      if (name === 'automationTaskGuards') return { doc: jest.fn(() => guardRef) };
      if (name === 'tasks') return { doc: jest.fn(() => taskRef) };
      return { doc: jest.fn() };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          pending: true,
          type: 'routine_threshold',
          automationRuleId: 'routine-rule',
          deviceId: 'toilet-01',
        }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ taskId: 'existing-task' }) })
      .mockResolvedValueOnce({ exists: true, data: () => guardedAutomationTask('assigned') });

    const eventInput = {
      ...automationInput,
      automationRuleId: 'routine-rule',
      automationTrigger: 'maintenance_due' as const,
      triggerType: 'maintenance' as const,
      pendingEventId: 'event-1',
    };
    await expect(dispatchAutomatedTaskAndNotify(eventInput)).resolves.toEqual(expect.objectContaining({ outcome: 'merged' }));

    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({ occurrenceCount: 2 }));
    expect(transaction.delete).toHaveBeenCalledWith(eventRef);
  });

  it('treats a missing routine event as already consumed without replaying its task mutation', async () => {
    const eventRef = { id: 'event-consumed' };
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn(), delete: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'automationPendingEvents') return { doc: jest.fn(() => eventRef) };
      return { doc: jest.fn(), where: jest.fn() };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({ exists: false, data: () => undefined });

    await expect(dispatchAutomatedTaskAndNotify({
      ...automationInput,
      automationRuleId: 'routine-rule',
      automationTrigger: 'maintenance_due',
      triggerType: 'maintenance',
      pendingEventId: 'event-consumed',
    })).resolves.toEqual({ outcome: 'consumed' });

    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it('persists a supervisor-only unassigned task when nobody is available', async () => {
    const taskRef = { id: 'task-2' };
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => ({
      doc: jest.fn(() => taskRef),
      where: jest.fn(() => ({ where: jest.fn(() => ({ get: jest.fn() })) })),
    }));
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce(snapshot([{ id: 'offline-tech', data: { isOnline: false, isActive: true } }]))
      .mockResolvedValueOnce(snapshot([]));

    const task = await createAutomatedTaskAndNotify(automationInput);

    expect(task).toEqual(expect.objectContaining({
      id: 'task-2', status: 'unassigned', assignedTo: null, assignedToIds: [],
      isBroadcast: false, requiresSupervisorAssignment: true,
      autoAssignmentEligibleAt: expect.anything(),
    }));
    expect(task.autoAssignmentEligibleAt?.toMillis()).toBe(61_000);
    expect(mockSendTaskNotification).toHaveBeenCalledWith(task);
  });

  it('keeps the Firestore task when FCM delivery fails', async () => {
    const taskRef = { id: 'task-3' };
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation(() => ({
      doc: jest.fn(() => taskRef),
      where: jest.fn(() => ({ where: jest.fn(() => ({ get: jest.fn() })) })),
    }));
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce(snapshot([{ id: 'tech-1', data: { isOnline: true, isActive: true } }]))
      .mockResolvedValueOnce(snapshot([]));
    mockSendTaskNotification.mockRejectedValue(new Error('FCM unavailable'));

    await expect(createAutomatedTaskAndNotify(automationInput)).resolves.toEqual(
      expect.objectContaining({ id: 'task-3', status: 'assigned' }),
    );
    expect(transaction.set).toHaveBeenCalledWith(taskRef, expect.anything());
  });

  it('durably records a threshold event when a completed task is still cooling down', async () => {
    const guardRef = { id: 'guard' };
    const taskRef = { id: 'existing-task' };
    const transaction = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') return { doc: jest.fn(() => taskRef) };
      if (name === 'automationTaskGuards') return { doc: jest.fn(() => guardRef) };
      return { doc: jest.fn() };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: true, data: () => ({ taskId: 'existing-task', nextEligibleAt: { toMillis: () => 600_000 } }) })
      .mockResolvedValueOnce({ data: () => ({ ...guardedAutomationTask('assigned'), completedAt: { toMillis: () => 100_000 }, status: 'pending' }) });

    await expect(dispatchAutomatedTaskAndNotify(automationInput)).resolves.toEqual({ outcome: 'pending' });
    expect(transaction.set).toHaveBeenCalledWith(guardRef, expect.objectContaining({
      pending: true,
      nextEligibleAt: expect.objectContaining({ toMillis: expect.any(Function) }),
    }), { merge: true });
    expect(mockSendTaskNotification).not.toHaveBeenCalled();
  });
});
