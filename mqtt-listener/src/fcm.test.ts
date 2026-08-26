const mockCollection = jest.fn();
const mockSend = jest.fn();
const mockSendEachForMulticast = jest.fn();

jest.mock('./firebase-admin', () => ({
  adminDb: { collection: mockCollection },
  adminMessaging: {
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: jest.fn(), serverTimestamp: jest.fn() },
}));

import { sendTaskNotification } from './fcm';
import type { TaskDoc } from './task-types';

const assignedTask = {
  id: 'task-1',
  deviceId: 'toilet-01',
  triggerType: 'water_overuse',
  message: 'Water use exceeded the configured limit.',
  status: 'assigned',
  assignedTo: 'tech-1',
  assignedToIds: ['tech-1'],
  isBroadcast: false,
  requiresSupervisorAssignment: false,
  createdAt: {} as TaskDoc['createdAt'],
  updatedAt: {} as TaskDoc['updatedAt'],
  assignedAt: {} as TaskDoc['assignedAt'],
  acknowledgedAt: null,
  completedAt: null,
  createdBy: 'system:mqtt',
} satisfies TaskDoc;

describe('listener FCM task notification', () => {
  let consoleInfo: jest.SpyInstance;

  beforeEach(() => {
    mockCollection.mockReset();
    mockSend.mockReset();
    mockSendEachForMulticast.mockReset();
    consoleInfo = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => consoleInfo.mockRestore());

  it('sends an assigned task only to its technician with the task contract in data', async () => {
    mockCollection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: () => ({ fcmToken: 'tech-token' }) }) })),
    });
    mockSend.mockResolvedValue('message-id');

    await sendTaskNotification(assignedTask);

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      token: 'tech-token',
      data: { taskId: 'task-1', deviceId: 'toilet-01', triggerType: 'water_overuse', status: 'assigned' },
    }));
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sends an unassigned automation task only to supervisor and admin tokens', async () => {
    const supervisorQuery = { get: jest.fn().mockResolvedValue({
      docs: [
        { id: 'supervisor-1', data: () => ({ fcmToken: 'supervisor-token' }) },
        { id: 'admin-1', data: () => ({ fcmToken: 'admin-token' }) },
      ],
    }) };
    const maintenanceQuery = { get: jest.fn().mockResolvedValue({
      docs: [{ id: 'tech-1', data: () => ({ fcmToken: 'maintenance-token' }) }],
    }) };
    const where = jest.fn((field: string, operator: string, roles: unknown) =>
      field === 'role' &&
      operator === 'in' &&
      JSON.stringify(roles) === JSON.stringify(['supervisor', 'admin'])
        ? supervisorQuery
        : maintenanceQuery,
    );
    mockCollection.mockReturnValue({ where });
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2, failureCount: 0, responses: [{ success: true }, { success: true }],
    });

    await sendTaskNotification({
      ...assignedTask,
      status: 'unassigned',
      assignedTo: null,
      assignedToIds: [],
      requiresSupervisorAssignment: true,
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['supervisor-token', 'admin-token'],
      data: expect.objectContaining({ status: 'unassigned' }),
    }));
    expect(where).toHaveBeenCalledWith('role', 'in', ['supervisor', 'admin']);
  });
});
