jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'admin-1' }),
  getUserRole: jest.fn().mockResolvedValue('admin'),
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ toMillis: () => 120_000 })) },
}));

jest.mock('@/lib/task-lifecycle', () => ({
  shouldClearAutomationGuard: jest.fn(),
  syncTechniciansAfterTaskRelease: jest.fn().mockResolvedValue(undefined),
}));

import { PATCH, PUT } from '@/app/api/tasks/[id]/route';
import { adminDb } from '@/lib/firebase-admin';

const mockCollection = adminDb.collection as jest.Mock;
const mockRunTransaction = adminDb.runTransaction as jest.Mock;

function taskSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    id: 'task-1',
    data: () => ({
      id: 'task-1', deviceId: 'toilet-01', triggerType: 'manual', message: 'Inspect.',
      status: 'pending', assignedTo: 'tech-old', assignedToIds: ['tech-old'],
      createdBy: 'admin-1', completedAt: null,
      ...overrides,
    }),
  };
}

describe('task PATCH lifecycle transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not clear completedAt or resurrect a task completed during the assignment race', async () => {
    const taskRef = {
      get: jest.fn()
        .mockResolvedValueOnce(taskSnapshot())
        .mockResolvedValueOnce(taskSnapshot({ status: 'completed', completedAt: { toMillis: () => 119_000 } })),
      update: jest.fn(),
    };
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    transaction.get
      .mockResolvedValueOnce(taskSnapshot({ status: 'pending', completedAt: { toMillis: () => 119_000 } }))
      .mockResolvedValueOnce({ docs: [] });
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') {
        return {
          doc: jest.fn(() => taskRef),
          where: jest.fn(() => ({ id: 'active-tasks-query' })),
        };
      }
      return {
        doc: jest.fn(() => ({ id: 'tech-new' })),
        where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [] }) })),
      };
    });

    const response = await PATCH(new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedTo: 'tech-new', assignedToIds: ['tech-new'] }),
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(409);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
    expect(taskRef.update).not.toHaveBeenCalled();
  });

  it('lets a supervisor atomically assign a supervisor-only unassigned task', async () => {
    const supervisorTask = taskSnapshot({
      status: 'unassigned',
      assignedTo: null,
      assignedToIds: [],
      isBroadcast: false,
      requiresSupervisorAssignment: true,
      autoAssignmentEligibleAt: { toMillis: () => 180_000 },
    });
    const assignedTask = taskSnapshot({
      status: 'assigned',
      assignedTo: 'tech-new',
      assignedToIds: ['tech-new'],
      isBroadcast: false,
      assignmentSource: 'supervisor',
      requiresSupervisorAssignment: false,
      autoAssignmentEligibleAt: null,
    });
    const taskRef = {
      get: jest.fn()
        .mockResolvedValueOnce(supervisorTask)
        .mockResolvedValueOnce(assignedTask),
    };
    const transaction = { get: jest.fn().mockResolvedValue(supervisorTask), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') {
        return { doc: jest.fn(() => taskRef) };
      }
      return {
        doc: jest.fn(() => ({ id: 'tech-new' })),
        where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [] }) })),
      };
    });

    const response = await PATCH(new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedTo: 'tech-new', assignedToIds: ['tech-new'] }),
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledWith(
      taskRef,
      expect.objectContaining({
        status: 'assigned',
        assignedTo: 'tech-new',
        assignedToIds: ['tech-new'],
        isBroadcast: false,
        assignmentSource: 'supervisor',
        requiresSupervisorAssignment: false,
        autoAssignmentEligibleAt: null,
      }),
    );
  });

  it('supports updating tasks via PUT alias', async () => {
    const supervisorTask = taskSnapshot({
      status: 'pending',
      assignedTo: null,
      assignedToIds: [],
    });
    const updatedTask = taskSnapshot({
      status: 'assigned',
      assignedTo: 'tech-new',
      assignedToIds: ['tech-new'],
    });
    const taskRef = {
      get: jest.fn()
        .mockResolvedValueOnce(supervisorTask)
        .mockResolvedValueOnce(updatedTask),
    };
    const transaction = { get: jest.fn().mockResolvedValue(supervisorTask), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    mockCollection.mockImplementation((name: string) => {
      if (name === 'tasks') {
        return { doc: jest.fn(() => taskRef) };
      }
      return {
        doc: jest.fn(() => ({ id: 'tech-new' })),
        where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [] }) })),
      };
    });

    const response = await PUT(new Request('http://localhost/api/tasks/task-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedTo: 'tech-new', assignedToIds: ['tech-new'] }),
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    expect(PUT).toBe(PATCH);
  });
});
