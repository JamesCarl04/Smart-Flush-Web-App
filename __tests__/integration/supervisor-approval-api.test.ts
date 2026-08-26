jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'supervisor-1', email: 'supervisor@example.com' }),
  getUserRole: jest.fn().mockResolvedValue('supervisor'),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'server-timestamp'),
  },
}));

import { POST } from '@/app/api/supervisor/approve-task/route';
import { adminDb } from '@/lib/firebase-admin';

const mockCollection = adminDb.collection as jest.Mock;
const mockRunTransaction = adminDb.runTransaction as jest.Mock;

function request(taskId = 'task-1'): Request {
  return new Request('http://localhost/api/supervisor/approve-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, supervisorName: 'Sue' }),
  });
}

function configureRefs() {
  const taskRef = { id: 'task-1' };
  const counterRef = { id: 'current' };
  const maintenanceCounters = { doc: jest.fn(() => counterRef) };
  const deviceRef = { collection: jest.fn(() => maintenanceCounters) };
  mockCollection.mockImplementation((name: string) => {
    if (name === 'tasks') return { doc: jest.fn(() => taskRef) };
    if (name === 'devices') return { doc: jest.fn(() => deviceRef) };
    throw new Error(`Unexpected collection ${name}`);
  });
  return { taskRef, counterRef };
}

describe('supervisor task approval', () => {
  beforeEach(() => {
    mockCollection.mockReset();
    mockRunTransaction.mockReset();
  });

  it('atomically approves completed routine maintenance and resets its cycle counter', async () => {
    const { taskRef, counterRef } = configureRefs();
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          status: 'completed', automationTrigger: 'maintenance_due', deviceId: 'toilet-01',
        }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ flushCycleCount: 215 }) });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({
      inspectionStatus: 'approved', inspectedBy: 'supervisor-1',
      maintenanceCounterReset: true,
    }));
    expect(transaction.set).toHaveBeenCalledWith(counterRef, expect.objectContaining({
      flushCycleCount: 0,
    }), { merge: true });
  });

  it('rejects routine maintenance approval until the technician completes the task', async () => {
    configureRefs();
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'acknowledged', automationTrigger: 'maintenance_due', deviceId: 'toilet-01' }),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('does not reset the cycle counter twice when approval is repeated', async () => {
    configureRefs();
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        status: 'completed', automationTrigger: 'maintenance_due', deviceId: 'toilet-01',
        inspectionStatus: 'approved', maintenanceCounterReset: true,
      }),
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('approves a non-routine completed task without touching maintenance counters', async () => {
    const { taskRef } = configureRefs();
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'completed', automationTrigger: 'water_overuse', deviceId: 'toilet-01' }),
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({ inspectionStatus: 'approved' }));
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.get).toHaveBeenCalledTimes(1);
  });

  it('repairs a stale active status when completedAt proves completion', async () => {
    const { taskRef } = configureRefs();
    const transaction = { get: jest.fn(), update: jest.fn(), set: jest.fn() };
    mockRunTransaction.mockImplementation(async (callback) => callback(transaction));
    transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'pending', completedAt: { toMillis: () => 100 }, automationTrigger: 'water_overuse' }),
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({ status: 'completed' }));
  });
});
