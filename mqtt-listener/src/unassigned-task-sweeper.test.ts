const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();
const mockSendTaskNotification = jest.fn();

jest.mock('./firebase-admin', () => ({
  adminDb: {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  },
}));

jest.mock('./fcm', () => ({ sendTaskNotification: mockSendTaskNotification }));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ toMillis: () => 120_000 })),
    fromMillis: jest.fn((millis: number) => ({ toMillis: () => millis })),
  },
}));

import { sweepUnassignedAutomationTasks } from './unassigned-task-sweeper';

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map(({ id, data }) => ({
      id,
      ref: { id },
      data: () => data,
    })),
  };
}

function setUpDueQuery(taskData: Record<string, unknown>) {
  const dueQuery = {
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    get: jest.fn().mockResolvedValue(snapshot([{ id: 'task-1', data: taskData }])),
  };
  dueQuery.where.mockReturnValue(dueQuery);
  dueQuery.orderBy.mockReturnValue(dueQuery);
  dueQuery.limit.mockReturnValue(dueQuery);
  return dueQuery;
}

describe('unassigned automation task sweeper', () => {
  beforeEach(() => {
    mockRunTransaction.mockReset();
    mockCollection.mockReset();
    mockSendTaskNotification.mockReset();
  });

  it('assigns a due task to the least recently assigned idle technician', async () => {
    const taskData = {
      deviceId: 'toilet-01', triggerType: 'water_no_flow', message: 'No water detected.',
      status: 'unassigned', assignedTo: null, assignedToIds: [], isBroadcast: false,
      automationTrigger: 'no_water_after_flush', autoAssignmentEligibleAt: { toMillis: () => 60_000 },
      createdAt: {}, updatedAt: {}, assignedAt: null, acknowledgedAt: null, completedAt: null,
      createdBy: 'system:mqtt', requiresSupervisorAssignment: true,
    };
    const dueQuery = setUpDueQuery(taskData);
    const taskRef = { id: 'task-1' };
    const techRef = { id: 'tech-idle' };
    const transaction = { get: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') return { ...dueQuery, doc: jest.fn(() => taskRef) };
      return { doc: jest.fn(() => techRef), where: jest.fn(() => ({ id: 'users-query' })) };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: true, id: 'task-1', data: () => taskData })
      .mockResolvedValueOnce(snapshot([
        { id: 'tech-recent', data: { isOnline: true, isActive: true, lastAutoAssignedAt: { toMillis: () => 100_000 } } },
        { id: 'tech-idle', data: { isOnline: true, isActive: true } },
      ]))
      .mockResolvedValueOnce(snapshot([]));

    await expect(sweepUnassignedAutomationTasks()).resolves.toEqual({ scanned: 1, assigned: 1, rescheduled: 0 });

    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({
      status: 'assigned', assignedTo: 'tech-idle', assignedToIds: ['tech-idle'],
      assignmentSource: 'retry_auto', requiresSupervisorAssignment: false,
      autoAssignmentEligibleAt: null,
    }));
    expect(transaction.update).toHaveBeenCalledWith(techRef, expect.objectContaining({ lastAutoAssignedAt: expect.anything() }));
    expect(mockSendTaskNotification).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1', assignedTo: 'tech-idle', status: 'assigned',
    }));
  });

  it('moves the retry forward without notifying maintenance when nobody is free', async () => {
    const taskData = {
      deviceId: 'toilet-01', triggerType: 'water_no_flow', message: 'No water detected.',
      status: 'unassigned', assignedTo: null, assignedToIds: [], isBroadcast: false,
      automationTrigger: 'no_water_after_flush', autoAssignmentEligibleAt: { toMillis: () => 60_000 },
      createdAt: {}, updatedAt: {}, assignedAt: null, acknowledgedAt: null, completedAt: null,
      createdBy: 'system:mqtt', requiresSupervisorAssignment: true,
    };
    const dueQuery = setUpDueQuery(taskData);
    const taskRef = { id: 'task-1' };
    const transaction = { get: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') return { ...dueQuery, doc: jest.fn(() => taskRef) };
      return { doc: jest.fn(), where: jest.fn(() => ({ id: 'users-query' })) };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: true, id: 'task-1', data: () => taskData })
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([]));

    await expect(sweepUnassignedAutomationTasks()).resolves.toEqual({ scanned: 1, assigned: 0, rescheduled: 1 });

    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({
      status: 'unassigned', assignedTo: null, isBroadcast: false,
      autoAssignmentEligibleAt: expect.objectContaining({ toMillis: expect.any(Function) }),
    }));
    expect(mockSendTaskNotification).not.toHaveBeenCalled();
  });

  it('does nothing when a supervisor assigned the task before the retry transaction', async () => {
    const queued = {
      status: 'unassigned', assignedTo: null, automationTrigger: 'water_overuse',
      autoAssignmentEligibleAt: { toMillis: () => 60_000 },
    };
    const dueQuery = setUpDueQuery(queued);
    const taskRef = { id: 'task-1' };
    const transaction = { get: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') return { ...dueQuery, doc: jest.fn(() => taskRef) };
      return { doc: jest.fn(), where: jest.fn() };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({
      exists: true,
      id: 'task-1',
      data: () => ({ ...queued, status: 'assigned', assignedTo: 'tech-manual' }),
    });

    await expect(sweepUnassignedAutomationTasks()).resolves.toEqual({ scanned: 1, assigned: 0, rescheduled: 0 });
    expect(transaction.update).not.toHaveBeenCalled();
    expect(mockSendTaskNotification).not.toHaveBeenCalled();
  });

  it('retries a generic non-broadcast task without an automation trigger', async () => {
    const taskData = {
      deviceId: 'toilet-01', triggerType: 'manual', taskOrigin: 'public_report', message: 'Reported issue.',
      status: 'unassigned', assignedTo: null, assignedToIds: [], isBroadcast: false,
      autoAssignmentEligibleAt: { toMillis: () => 60_000 },
      createdAt: {}, updatedAt: {}, assignedAt: null, acknowledgedAt: null, completedAt: null,
      createdBy: 'public-report', requiresSupervisorAssignment: true,
    };
    const dueQuery = setUpDueQuery(taskData);
    const taskRef = { id: 'task-1' };
    const techRef = { id: 'tech-idle' };
    const transaction = { get: jest.fn(), update: jest.fn() };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') return { ...dueQuery, doc: jest.fn(() => taskRef) };
      return { doc: jest.fn(() => techRef), where: jest.fn(() => ({ id: 'users-query' })) };
    });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({ exists: true, id: 'task-1', data: () => taskData })
      .mockResolvedValueOnce(snapshot([{ id: 'tech-idle', data: { isOnline: true, isActive: true, isAvailable: true } }]))
      .mockResolvedValueOnce(snapshot([]));

    await expect(sweepUnassignedAutomationTasks()).resolves.toEqual({ scanned: 1, assigned: 1, rescheduled: 0 });
  });
});
