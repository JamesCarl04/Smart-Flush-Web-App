const mockTaskSet = jest.fn();
const mockTransactionSet = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    runTransaction: jest.fn(async (callback) => callback({ set: mockTransactionSet })),
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

import { createTaskDocument, serializeTaskSnapshot } from '@/lib/task-service';

describe('createTaskDocument', () => {
  beforeEach(() => { mockTaskSet.mockReset(); mockTransactionSet.mockReset(); });

  it('persists an unassigned automation task as a team broadcast for mobile sync', async () => {
    await createTaskDocument({
      deviceId: 'toilet-01',
      triggerType: 'water_overuse',
      message: 'Water use exceeded the limit.',
      assignedTo: null,
      assignedToIds: [],
      createdBy: 'system:automation_rule',
    });

    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'task-1',
        status: 'unassigned',
        isBroadcast: true,
        assignmentType: 'broadcast',
      }),
    );
  });
});

describe('serializeTaskSnapshot', () => {
  it('preserves additional photos from a Firestore task snapshot', () => {
    const additionalPhotos = [
      { area: 'floor', url: 'https://storage.example/floor.jpg' },
      { area: 'seat', url: 'https://storage.example/seat.jpg' },
    ];
    const snapshot = {
      id: 'task-photos',
      data: () => ({
        deviceId: 'toilet-01',
        triggerType: 'manual',
        message: 'Inspect toilet.',
        status: 'pending',
        assignedTo: null,
        assignedToIds: [],
        additionalPhotos,
        createdBy: 'user-1',
      }),
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot;

    const result = serializeTaskSnapshot(snapshot);

    expect(result.additionalPhotos).toEqual(additionalPhotos);
  });

  it('preserves automation assignment metadata for dashboard and mobile clients', () => {
    const snapshot = {
      id: 'task-automation',
      data: () => ({
        deviceId: 'toilet-01',
        triggerType: 'water_no_flow',
        message: 'No water detected after a flush cycle.',
        status: 'unassigned',
        assignedTo: null,
        assignedToIds: [],
        isBroadcast: false,
        assignmentType: 'individual',
        automationRuleId: 'rule-dry-flow',
        automationTrigger: 'no_water_after_flush',
        assignmentSource: 'initial_auto',
        requiresSupervisorAssignment: true,
        autoAssignmentEligibleAt: { toMillis: () => 60_000 },
        cycleCountAtTrigger: 2,
        createdBy: 'system:mqtt',
      }),
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot;

    expect(serializeTaskSnapshot(snapshot)).toEqual(expect.objectContaining({
      triggerType: 'water_no_flow',
      isBroadcast: false,
      automationRuleId: 'rule-dry-flow',
      automationTrigger: 'no_water_after_flush',
      assignmentSource: 'initial_auto',
      requiresSupervisorAssignment: true,
      autoAssignmentEligibleAt: 60_000,
      cycleCountAtTrigger: 2,
    }));
  });
});
