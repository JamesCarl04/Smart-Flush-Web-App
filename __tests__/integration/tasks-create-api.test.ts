const mockCreateTaskAndNotify = jest.fn();

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'supervisor-1', email: 'sup@example.com' }),
  getUserRole: jest.fn().mockResolvedValue('supervisor'),
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(() => ({ success: true })),
  RATE_LIMITS: { tasks: {} },
  createRateLimitResponse: jest.fn(),
}));

jest.mock('@/lib/task-service', () => ({
  createTaskAndNotify: (...args: unknown[]) => mockCreateTaskAndNotify(...args),
}));

import { POST as postTasks } from '@/app/api/tasks/route';
import { POST as postTasksCreate } from '@/app/api/tasks/create/route';

describe('Task creation API endpoints', () => {
  beforeEach(() => {
    mockCreateTaskAndNotify.mockReset();
    mockCreateTaskAndNotify.mockResolvedValue({ id: 'new-task-123' });
  });

  describe('POST /api/tasks', () => {
    it('creates a broadcast task when isBroadcast: true is passed', async () => {
      const request = new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'toilet-01',
          triggerType: 'manual',
          message: 'Broadcast cleaning needed',
          isBroadcast: true,
          assignmentType: 'broadcast',
          assignedToIds: [],
        }),
      });

      const response = await postTasks(request);
      expect(response.status).toBe(201);
      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          isBroadcast: true,
          assignmentType: 'broadcast',
          assignedTo: null,
          assignedToIds: [],
        }),
      );
    });

    it('creates an unassigned non-broadcast task when isBroadcast: false and assignedToIds: [] is passed', async () => {
      const request = new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'toilet-01',
          triggerType: 'manual',
          message: 'Needs supervisor triage',
          isBroadcast: false,
          assignedToIds: [],
        }),
      });

      const response = await postTasks(request);
      expect(response.status).toBe(201);
      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          isBroadcast: false,
          assignmentType: undefined,
          assignedTo: null,
          assignedToIds: [],
        }),
      );
    });

    it('creates an individual assigned task when a single technician is assigned', async () => {
      const request = new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'toilet-01',
          triggerType: 'manual',
          message: 'Fix handle',
          assignedTo: 'tech-1',
          assignedToIds: ['tech-1'],
        }),
      });

      const response = await postTasks(request);
      expect(response.status).toBe(201);
      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          isBroadcast: false,
          assignmentType: 'individual',
          assignedTo: 'tech-1',
          assignedToIds: ['tech-1'],
        }),
      );
    });
  });

  describe('POST /api/tasks/create', () => {
    it('supports creating a broadcast task via alternate create endpoint', async () => {
      const request = new Request('http://localhost/api/tasks/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toiletId: 'toilet-01',
          note: 'Broadcast cleaning needed',
          isBroadcast: true,
          assignmentType: 'broadcast',
        }),
      });

      const response = await postTasksCreate(request);
      expect(response.status).toBe(201);
      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          isBroadcast: true,
          assignmentType: 'broadcast',
          assignedTo: null,
          assignedToIds: [],
        }),
      );
    });

    it('creates an unassigned task when no assignees and no broadcast requested', async () => {
      const request = new Request('http://localhost/api/tasks/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toiletId: 'toilet-01',
          note: 'Needs triage',
        }),
      });

      const response = await postTasksCreate(request);
      expect(response.status).toBe(201);
      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          isBroadcast: false,
          assignmentType: undefined,
          assignedTo: null,
          assignedToIds: [],
        }),
      );
    });
  });
});
