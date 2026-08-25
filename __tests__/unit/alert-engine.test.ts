const mockCreateTaskAndNotify = jest.fn();
const mockFindAvailableMaintenancePersonnel = jest.fn();

let rules: Array<Record<string, unknown>> = [];
let flushCount = 0;
let activeTaskExists = false;

function queryWithGet(result: unknown) {
  const query: { where: jest.Mock; limit: jest.Mock; get: jest.Mock; doc: jest.Mock } = {
    where: jest.fn(),
    limit: jest.fn(),
    get: jest.fn().mockResolvedValue(result),
    doc: jest.fn(() => ({ id: 'alert-1', set: jest.fn().mockResolvedValue(undefined) })),
  };
  query.where.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn((name: string) => {
      if (name === 'automationRules') {
        return queryWithGet({ docs: rules.map((data) => ({ data: () => data })) });
      }
      if (name === 'flushEvents') {
        return queryWithGet({ size: flushCount });
      }
      if (name === 'alerts' || name === 'tasks') {
        return queryWithGet(
          name === 'tasks' && activeTaskExists
            ? { empty: false, docs: [{ id: 'active-task' }] }
            : { empty: true, docs: [] },
        );
      }
      return queryWithGet({ empty: true, docs: [] });
    }),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
  Timestamp: {
    fromMillis: jest.fn((millis: number) => ({ millis })),
    fromDate: jest.fn((date: Date) => ({ date })),
  },
}));

jest.mock('@/lib/task-service', () => ({
  createTaskAndNotify: (...args: unknown[]) => mockCreateTaskAndNotify(...args),
}));

jest.mock('@/lib/task-assignment', () => ({
  findAvailableMaintenancePersonnel: (...args: unknown[]) =>
    mockFindAvailableMaintenancePersonnel(...args),
}));

import { evaluateAlerts, isSendTaskAction } from '@/lib/alert-engine';

describe('alert-engine automation dispatch', () => {
  beforeEach(() => {
    rules = [];
    flushCount = 0;
    activeTaskExists = false;
    mockCreateTaskAndNotify.mockReset();
    mockFindAvailableMaintenancePersonnel.mockReset();
    mockFindAvailableMaintenancePersonnel.mockResolvedValue([
      { id: 'tech-idle', displayName: 'Idle Tech', email: 'idle@example.com' },
    ]);
  });

  it('recognizes the renamed and legacy task-dispatch actions', () => {
    expect(isSendTaskAction('Send Task to Available Maintenance')).toBe(true);
    expect(isSendTaskAction('Create Maintenance Ticket')).toBe(true);
    expect(isSendTaskAction('Send Warning Email')).toBe(false);
  });

  it.each([
    ['flush_count_exceeded', 'toilet/sensors/waterflow', { volume: 1 }, 'flush_count'],
    ['water_overuse', 'toilet/sensors/waterflow', { volume: 8 }, 'water_overuse'],
    ['uv_cycle_failed', 'toilet/events/uv', { completed: false }, 'uv_complete'],
    ['maintenance_due', 'toilet/events/pump', { status: 'ok' }, 'maintenance'],
  ] as const)(
    'dispatches a %s rule as a %s mobile task',
    async (trigger, topic, payload, expectedTriggerType) => {
      rules = [
        {
          id: `${trigger}-rule`,
          group: trigger === 'maintenance_due' ? 'maintenance' : 'system_alert',
          trigger,
          threshold: 2,
          action: 'Send Task to Available Maintenance',
          enabled: true,
        },
      ];
      flushCount = 3;

      await evaluateAlerts(topic, payload, 'toilet-01');

      expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'toilet-01',
          triggerType: expectedTriggerType,
          assignedTo: 'tech-idle',
          assignedToIds: ['tech-idle'],
          createdBy: 'system:automation_rule',
        }),
      );
    },
  );

  it('leaves a task unassigned when every maintenance technician is busy', async () => {
    rules = [
      {
        id: 'water-rule',
        group: 'system_alert',
        trigger: 'water_overuse',
        threshold: 2,
        action: 'Create Maintenance Ticket',
        enabled: true,
      },
    ];
    mockFindAvailableMaintenancePersonnel.mockResolvedValue([]);

    await evaluateAlerts('toilet/sensors/waterflow', { volume: 8 }, 'toilet-01');

    expect(mockCreateTaskAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: null, assignedToIds: [] }),
    );
  });

  it('does not dispatch a duplicate task while the same device and trigger already have active work', async () => {
    rules = [
      {
        id: 'water-rule',
        group: 'system_alert',
        trigger: 'water_overuse',
        threshold: 2,
        action: 'Send Task to Available Maintenance',
        enabled: true,
      },
    ];
    activeTaskExists = true;

    await evaluateAlerts('toilet/sensors/waterflow', { volume: 8 }, 'toilet-01');

    expect(mockCreateTaskAndNotify).not.toHaveBeenCalled();
  });
});
