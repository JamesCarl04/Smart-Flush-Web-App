jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'tech-1' }),
  requireMaintenance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => 'now') },
}));

import { POST } from '@/app/api/tasks/[id]/acknowledge/route';
import { adminDb } from '@/lib/firebase-admin';

describe('task acknowledgement authorization', () => {
  const taskRef = { id: 'task-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    (adminDb.collection as jest.Mock).mockReturnValue({ doc: jest.fn(() => taskRef) });
  });

  it('rejects a guessed supervisor-only unassigned automation task id', async () => {
    const transaction = { get: jest.fn(), update: jest.fn() };
    transaction.get.mockResolvedValue({
      exists: true,
      data: () => ({ assignedTo: null, assignedToIds: [], isBroadcast: false }),
    });
    (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) => callback(transaction));

    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('atomically claims an explicit legacy broadcast for the technician', async () => {
    const transaction = { get: jest.fn(), update: jest.fn() };
    transaction.get.mockResolvedValue({
      exists: true,
      data: () => ({ assignedTo: null, assignedToIds: [], isBroadcast: true }),
    });
    (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) => callback(transaction));

    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledWith(taskRef, expect.objectContaining({
      assignedTo: 'tech-1',
      assignedToIds: ['tech-1'],
      isBroadcast: false,
      status: 'acknowledged',
    }));
  });
});
