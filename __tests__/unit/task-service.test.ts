const mockTaskSet = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn((name: string) => ({
      doc: jest.fn(() =>
        name === 'tasks'
          ? { id: 'task-1', set: mockTaskSet }
          : { get: jest.fn().mockResolvedValue({ exists: false }) },
      ),
    })),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => 'now') },
}));

jest.mock('@/lib/fcm', () => ({ sendTaskNotification: jest.fn() }));

import { createTaskDocument } from '@/lib/task-service';

describe('createTaskDocument', () => {
  beforeEach(() => mockTaskSet.mockReset());

  it('persists an unassigned automation task as a team broadcast for mobile sync', async () => {
    await createTaskDocument({
      deviceId: 'toilet-01',
      triggerType: 'water_overuse',
      message: 'Water use exceeded the limit.',
      assignedTo: null,
      assignedToIds: [],
      createdBy: 'system:automation_rule',
    });

    expect(mockTaskSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        status: 'unassigned',
        isBroadcast: true,
        assignmentType: 'broadcast',
      }),
    );
  });
});
