import { GET, POST } from '@/app/api/automation-rules/route';
import { DELETE, PUT } from '@/app/api/automation-rules/[id]/route';
import { POST as resetCounter } from '@/app/api/automation-rules/[id]/reset-counter/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, verifyAuthToken } from '@/lib/auth-helpers';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'admin-1' }),
  requireAdmin: jest.fn().mockResolvedValue(undefined),
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
  delete?: jest.Mock;
  collection?: jest.Mock;
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
    collection.mockReturnValue({
      doc: jest.fn(() => ({ id: 'rule-1', set })),
      where: jest.fn(() => ({ get: jest.fn() })),
    });

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
    collection.mockReturnValue({
      doc: jest.fn(() => ({ id: 'rule-1', set })),
      where: jest.fn(() => ({ get: jest.fn() })),
    });
    (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) =>
      callback({ get: jest.fn().mockResolvedValue({ docs: [] }), set }),
    );

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
    expect(await response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'rule-1',
        repeatIntervalMinutes: 10,
        action: 'Send Task to Available Maintenance',
      }),
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rule-1' }),
      expect.objectContaining({
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 8,
        repeatIntervalMinutes: 10,
        action: 'Send Task to Available Maintenance',
      }),
    );
  });

  it.each([0, 1.5, 1441, '10', true, null])(
    'rejects an invalid repeat interval at the server boundary: %p',
    async (repeatIntervalMinutes) => {
      const set = jest.fn();
      collection.mockReturnValue({ doc: jest.fn(() => ({ id: 'rule-1', set })) });

      const response = await POST(
        jsonRequest('POST', {
          name: 'Interval validation',
          group: 'system_alert',
          trigger: 'ultrasonic_sensor_fault',
          threshold: 10,
          action: 'Send Warning Email',
          repeatIntervalMinutes,
        }),
      );

      expect(response.status).toBe(400);
      expect(set).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-admin mutation before creating a rule', async () => {
    (requireAdmin as jest.Mock).mockRejectedValueOnce(
      new Response(
        JSON.stringify({ success: false, error: 'Forbidden: admin only' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const set = jest.fn();
    collection.mockReturnValue({ doc: jest.fn(() => ({ id: 'rule-1', set })) });

    const response = await POST(
      jsonRequest('POST', {
        name: 'Unauthorized rule',
        group: 'system_alert',
        trigger: 'ultrasonic_sensor_fault',
        threshold: 10,
        action: 'Send Warning Email',
      }),
    );

    expect(response.status).toBe(403);
    expect(set).not.toHaveBeenCalled();
  });

  it('requires an administrator for every rule mutation while allowing authenticated reads', async () => {
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'rule-1',
          group: 'maintenance',
          trigger: 'maintenance_due',
          threshold: 200,
          action: 'Send Warning Email',
          enabled: true,
        }),
      }),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
      })),
    };
    const get = jest.fn().mockResolvedValue({ docs: [{ data: () => ({ id: 'legacy-1' }) }] });
    collection.mockReturnValue({
      doc: jest.fn(() => ruleDocument),
      orderBy: jest.fn(() => ({ get })),
    });

    const listResponse = await GET(new Request('http://localhost/api/automation-rules'));
    expect(listResponse.status).toBe(200);
    expect(verifyAuthToken).toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();

    await POST(jsonRequest('POST', {
      name: 'Administrator-only rule',
      group: 'system_alert',
      trigger: 'ultrasonic_sensor_fault',
      threshold: 10,
      action: 'Send Warning Email',
    }));

    await PUT(jsonRequest('PUT', { enabled: false }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    await DELETE(new Request('http://localhost/api/automation-rules/rule-1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    await resetCounter(new Request('http://localhost/api/automation-rules/rule-1/reset-counter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }), { params: Promise.resolve({ id: 'rule-1' }) });

    expect(requireAdmin).toHaveBeenCalledTimes(4);
  });

  it('returns legacy rules with the default repeat interval on GET', async () => {
    const get = jest.fn().mockResolvedValue({
      docs: [{ data: () => ({ id: 'legacy-1', name: 'Legacy rule' }) }],
    });
    collection.mockReturnValue({ orderBy: jest.fn(() => ({ get })) });

    const response = await GET(new Request('http://localhost/api/automation-rules'));
    const body = (await response.json()) as { data: Array<{ repeatIntervalMinutes: number }> };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'legacy-1', name: 'Legacy rule', repeatIntervalMinutes: 10 }]);
  });

  it('atomically rejects a second enabled task-dispatch rule for the same trigger', async () => {
    const docRef = { id: 'rule-2', set: jest.fn() };
    const transaction = {
      get: jest.fn().mockResolvedValue({
        docs: [{
          id: 'rule-1',
          data: () => ({
            trigger: 'water_overuse',
            action: 'Create Maintenance Ticket',
            enabled: true,
          }),
        }],
      }),
      set: jest.fn(),
    };
    collection.mockReturnValue({
      doc: jest.fn(() => docRef),
      where: jest.fn(() => ({ where: jest.fn(() => ({ get: jest.fn() })) })),
    });
    (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) => callback(transaction));

    const response = await POST(
      jsonRequest('POST', {
        name: 'Duplicate task rule',
        group: 'system_alert',
        trigger: 'water_overuse',
        threshold: 12,
        action: 'Send Task to Available Maintenance',
        enabled: true,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: 'An enabled task-dispatch rule already exists for this trigger',
    });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('atomically rejects enabling a task-dispatch rule when its trigger already has one', async () => {
    const ruleDocument: RuleDocument = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'rule-2',
          name: 'Disabled task rule',
          group: 'system_alert',
          trigger: 'water_overuse',
          threshold: 12,
          action: 'Send Task to Available Maintenance',
          enabled: false,
        }),
      }),
      set: jest.fn(),
      update: jest.fn(),
    };
    const transaction = {
      get: jest.fn().mockResolvedValue({
        docs: [{
          id: 'rule-1',
          data: () => ({
            trigger: 'water_overuse',
            action: 'Create Maintenance Ticket',
            enabled: true,
          }),
        }],
      }),
      update: jest.fn(),
    };
    collection.mockReturnValue({
      doc: jest.fn(() => ruleDocument),
      where: jest.fn(() => ({ get: jest.fn() })),
    });
    (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) => callback(transaction));

    const response = await PUT(jsonRequest('PUT', { enabled: true }), {
      params: Promise.resolve({ id: 'rule-2' }),
    });

    expect(response.status).toBe(409);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([
    ['trigger', { trigger: 'water_overuse', threshold: 12 }],
    ['action', { action: 'Send Task to Available Maintenance' }],
  ])(
    'rejects a %s update that would duplicate an enabled task-dispatch trigger',
    async (_field, body) => {
      const ruleDocument: RuleDocument = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'rule-2',
            name: 'Rule being changed',
            group: 'system_alert',
            trigger: body.trigger === 'water_overuse' ? 'ultrasonic_sensor_fault' : 'water_overuse',
            threshold: 10,
            action: body.action ? 'Send Warning Email' : 'Send Task to Available Maintenance',
            enabled: true,
          }),
        }),
        set: jest.fn(),
        update: jest.fn(),
      };
      const transaction = {
        get: jest.fn().mockResolvedValue({
          docs: [{
            id: 'rule-1',
            data: () => ({
              trigger: 'water_overuse',
              action: 'Create Maintenance Ticket',
              enabled: true,
            }),
          }],
        }),
        update: jest.fn(),
      };
      collection.mockReturnValue({
        doc: jest.fn(() => ruleDocument),
        where: jest.fn(() => ({ get: jest.fn() })),
      });
      (adminDb.runTransaction as jest.Mock).mockImplementation(async (callback) => callback(transaction));

      const response = await PUT(jsonRequest('PUT', body), {
        params: Promise.resolve({ id: 'rule-2' }),
      });

      expect(response.status).toBe(409);
      expect(transaction.update).not.toHaveBeenCalled();
    },
  );

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
