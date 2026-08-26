import { POST } from '@/app/api/automation-rules/route';
import { PUT } from '@/app/api/automation-rules/[id]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'admin-1' }),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'server-timestamp'),
    delete: jest.fn(() => 'delete-field'),
  },
}));

type RuleDocument = {
  get: jest.Mock;
  set: jest.Mock;
  update: jest.Mock;
};

const collection = adminDb.collection as jest.Mock;

function jsonRequest(method: 'POST' | 'PUT', body: unknown): Request {
  return new Request('http://localhost:3000/api/automation-rules/rule-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('automation rule API validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unsupported trigger values before creating a Firestore rule', async () => {
    const set = jest.fn();
    collection.mockReturnValue({ doc: jest.fn(() => ({ id: 'rule-1', set })) });

    const response = await POST(
      jsonRequest('POST', {
        name: 'Unknown check',
        group: 'system_alert',
        trigger: 'flush_count_exceeded',
        threshold: 100,
        action: 'Send Warning Email',
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('trigger');
    expect(set).not.toHaveBeenCalled();
  });

  it('persists canonical no-water defaults when the alias action is submitted', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    collection.mockReturnValue({ doc: jest.fn(() => ({ id: 'rule-1', set })) });

    const response = await POST(
      jsonRequest('POST', {
        name: 'Dry flush maintenance',
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        action: 'Create Maintenance Ticket',
      }),
    );

    expect(response.status).toBe(201);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 8,
        action: 'Send Task to Available Maintenance',
      }),
    );
  });

  it('rejects a maintenance threshold outside its configured range on update', async () => {
    const snapshot = {
      exists: true,
      data: jest.fn(() => ({
        id: 'rule-1',
        name: 'Routine check',
        group: 'maintenance',
        trigger: 'maintenance_due',
        threshold: 200,
        action: 'Send Task to Available Maintenance',
        enabled: true,
      })),
    };
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue(snapshot),
      set: jest.fn(),
      update: jest.fn(),
    };
    collection.mockReturnValue({ doc: jest.fn(() => ruleDocument) });

    const response = await PUT(
      jsonRequest('PUT', { threshold: 100001 }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('threshold');
    expect(ruleDocument.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid threshold shape instead of falling back to the stored value', async () => {
    const snapshot = {
      exists: true,
      data: jest.fn(() => ({
        id: 'rule-1',
        name: 'Water usage check',
        group: 'system_alert',
        trigger: 'water_overuse',
        threshold: 12.5,
        action: 'Send Warning Email',
        enabled: true,
      })),
    };
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue(snapshot),
      set: jest.fn(),
      update: jest.fn(),
    };
    collection.mockReturnValue({ doc: jest.fn(() => ruleDocument) });

    const response = await PUT(
      jsonRequest('PUT', { threshold: null }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('threshold');
    expect(ruleDocument.update).not.toHaveBeenCalled();
  });

  it('removes the no-water-only setting when a no-water rule changes to another supported trigger', async () => {
    const snapshot = {
      exists: true,
      data: jest.fn(() => ({
        id: 'rule-1',
        name: 'Dry flush maintenance',
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 8,
        action: 'Send Warning Email',
        enabled: true,
      })),
    };
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue(snapshot),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    collection.mockReturnValue({ doc: jest.fn(() => ruleDocument) });

    const response = await PUT(
      jsonRequest('PUT', {
        trigger: 'ultrasonic_sensor_fault',
        threshold: 10,
      }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );

    expect(response.status).toBe(200);
    expect(ruleDocument.update).toHaveBeenCalledWith({
      trigger: 'ultrasonic_sensor_fault',
      threshold: 10,
      waterWaitSeconds: FieldValue.delete(),
    });
  });

  it('persists the default wait when a supported rule changes to no-water', async () => {
    const snapshot = {
      exists: true,
      data: jest.fn(() => ({
        id: 'rule-1',
        name: 'Sensor fault',
        group: 'system_alert',
        trigger: 'ultrasonic_sensor_fault',
        threshold: 10,
        action: 'Send Warning Email',
        enabled: true,
      })),
    };
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue(snapshot),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    collection.mockReturnValue({ doc: jest.fn(() => ruleDocument) });

    const response = await PUT(
      jsonRequest('PUT', {
        trigger: 'no_water_after_flush',
        threshold: 2,
      }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );

    expect(response.status).toBe(200);
    expect(ruleDocument.update).toHaveBeenCalledWith({
      trigger: 'no_water_after_flush',
      threshold: 2,
      waterWaitSeconds: 8,
    });
  });

  it('keeps enabled-only updates compatible with legacy rule records', async () => {
    const snapshot = {
      exists: true,
      data: jest.fn(() => ({
        id: 'rule-1',
        name: 'Legacy flush counter',
        group: 'system_alert',
        trigger: 'flush_count_exceeded',
        threshold: 100,
        action: 'Send Warning Email',
        enabled: true,
      })),
    };
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue(snapshot),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    collection.mockReturnValue({ doc: jest.fn(() => ruleDocument) });

    const response = await PUT(
      jsonRequest('PUT', { enabled: false }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );

    expect(response.status).toBe(200);
    expect(ruleDocument.update).toHaveBeenCalledWith({ enabled: false });
  });
});
