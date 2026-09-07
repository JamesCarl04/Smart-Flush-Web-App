import {
  withDashboardTaskStatus,
  withMaintenanceUserStatus,
} from '@/lib/task-status';
import type { TaskApiData } from '@/lib/task-types';

const baseTask: TaskApiData = {
  id: 'task-100',
  deviceId: 'device-1',
  triggerType: 'manual',
  message: 'Fix flush sensor',
  status: 'assigned',
  assignedTo: null,
  assignedToIds: ['tech-1', 'tech-2'],
  isBroadcast: false,
  assignmentType: 'team',
  createdAt: 1000,
  createdBy: 'system',
  assignedAt: 1000,
  acknowledgedAt: null,
  completedAt: null,
  acknowledgedBy: {},
  completedBy: {},
};

describe('withDashboardTaskStatus', () => {
  it('preserves status: completed from Firestore and never regresses to acknowledged', () => {
    const completedTask: TaskApiData = {
      ...baseTask,
      status: 'completed',
      acknowledgedAt: 2000,
      completedAt: 5000,
      acknowledgedBy: { 'tech-1': 2000, 'tech-2': 2100 },
      completedBy: { 'tech-1': 4000, 'tech-2': 5000 },
    };

    const result = withDashboardTaskStatus(completedTask, ['tech-1', 'tech-2']);
    expect(result.status).toBe('completed');
  });

  it('populates completedAt from completedBy map when completedAt is null on completed task', () => {
    const completedTaskWithoutTimestamp: TaskApiData = {
      ...baseTask,
      status: 'completed',
      acknowledgedAt: 2000,
      completedAt: null,
      acknowledgedBy: { 'tech-1': 2000, 'tech-2': 2100 },
      completedBy: { 'tech-1': 4000, 'tech-2': 5500 },
    };

    const result = withDashboardTaskStatus(completedTaskWithoutTimestamp, ['tech-1', 'tech-2']);
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe(5500);
  });

  it('marks multi-assignee task as completed when all assignees have submissions', () => {
    const taskWithSubmissions: TaskApiData = {
      ...baseTask,
      status: 'acknowledged',
      acknowledgedAt: 2000,
      acknowledgedBy: { 'tech-1': 2000, 'tech-2': 2100 },
      completedBy: {},
      submissions: {
        'tech-1': { completedAt: 4000 },
        'tech-2': { completedAt: 5000 },
      },
    };

    const result = withDashboardTaskStatus(taskWithSubmissions, ['tech-1', 'tech-2']);
    expect(result.status).toBe('completed');
  });

  it('shows acknowledged when only some assignees have completed or acknowledged', () => {
    const partiallyDone: TaskApiData = {
      ...baseTask,
      status: 'acknowledged',
      acknowledgedAt: 2000,
      acknowledgedBy: { 'tech-1': 2000 },
      completedBy: { 'tech-1': 4000 },
    };

    const result = withDashboardTaskStatus(partiallyDone, ['tech-1', 'tech-2']);
    expect(result.status).toBe('acknowledged');
  });
});

describe('withMaintenanceUserStatus', () => {
  it('returns assigned status for tech-2 when only tech-1 has acknowledged', () => {
    const taskAckByTech1: TaskApiData = {
      ...baseTask,
      status: 'acknowledged',
      acknowledgedBy: { 'tech-1': 2000 },
    };

    const result = withMaintenanceUserStatus(taskAckByTech1, 'tech-2');
    expect(result.status).toBe('assigned');
  });

  it('returns acknowledged status for tech-2 once tech-2 acknowledges', () => {
    const taskAckByBoth: TaskApiData = {
      ...baseTask,
      status: 'acknowledged',
      acknowledgedBy: { 'tech-1': 2000, 'tech-2': 2500 },
    };

    const result = withMaintenanceUserStatus(taskAckByBoth, 'tech-2');
    expect(result.status).toBe('acknowledged');
    expect(result.acknowledgedAt).toBe(2500);
  });

  it('preserves completed status when task is globally completed', () => {
    const completedTask: TaskApiData = {
      ...baseTask,
      status: 'completed',
      acknowledgedAt: 2000,
      completedAt: 5000,
    };

    const result = withMaintenanceUserStatus(completedTask, 'tech-2');
    expect(result.status).toBe('completed');
  });
});
