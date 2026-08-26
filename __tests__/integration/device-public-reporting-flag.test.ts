jest.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'admin-1' }),
  requireAdmin: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
}));

import { GET, POST } from '@/app/api/devices/route';
import { GET as getDevice, PUT } from '@/app/api/devices/[id]/route';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth-helpers';

const collection = adminDb.collection as jest.Mock;

function jsonRequest(method: 'POST' | 'PUT', body: unknown): Request {
  return new Request('http://localhost/api/devices/toilet-01', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('device public-reporting flag', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults new devices to public reporting enabled and preserves an explicit false', async () => {
    for (const [body, expected] of [
      [{ name: 'Legacy-compatible' }, true],
      [{ name: 'Private toilet', publicReportingEnabled: false }, false],
    ] as const) {
      const set = jest.fn().mockResolvedValue(undefined);
      collection.mockReturnValue({ doc: jest.fn(() => ({ id: 'toilet-01', set })) });

      const response = await POST(jsonRequest('POST', body));

      expect(response.status).toBe(201);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ publicReportingEnabled: expected }),
      );
    }
  });

  it('normalizes missing legacy flags to true in authenticated list and detail responses', async () => {
    collection.mockReturnValueOnce({
      get: jest.fn().mockResolvedValue({
        docs: [{ data: () => ({ id: 'legacy', name: 'Legacy toilet' }) }],
      }),
    });
    const listResponse = await GET(new Request('http://localhost/api/devices'));
    expect(await listResponse.json()).toEqual({
      success: true,
      data: [{ id: 'legacy', name: 'Legacy toilet', publicReportingEnabled: true }],
    });

    collection.mockReturnValueOnce({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ id: 'legacy', name: 'Legacy toilet' }),
        }),
      })),
    });
    const detailResponse = await getDevice(new Request('http://localhost/api/devices/legacy'), {
      params: Promise.resolve({ id: 'legacy' }),
    });
    expect(await detailResponse.json()).toEqual({
      success: true,
      data: { id: 'legacy', name: 'Legacy toilet', publicReportingEnabled: true },
    });
  });

  it('updates the flag only when it is boolean and rejects invalid values', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ id: 'toilet-01', publicReportingEnabled: false }),
      });
    const set = jest.fn().mockResolvedValue(undefined);
    collection.mockReturnValue({ doc: jest.fn(() => ({ get, set })) });

    const response = await PUT(jsonRequest('PUT', { publicReportingEnabled: false }), {
      params: Promise.resolve({ id: 'toilet-01' }),
    });
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ publicReportingEnabled: false }),
      { merge: true },
    );

    const invalidSet = jest.fn();
    collection.mockReturnValue({ doc: jest.fn(() => ({ set: invalidSet })) });
    const invalid = await PUT(
      jsonRequest('PUT', { publicReportingEnabled: 'false' }),
      { params: Promise.resolve({ id: 'toilet-01' }) },
    );
    expect(invalid.status).toBe(400);
    expect(invalidSet).not.toHaveBeenCalled();
  });

  it('requires an administrator when changing the public-reporting flag', async () => {
    (requireAdmin as jest.Mock).mockRejectedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'Forbidden: admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const set = jest.fn();
    collection.mockReturnValue({ doc: jest.fn(() => ({ set })) });

    const response = await PUT(jsonRequest('PUT', { publicReportingEnabled: false }), {
      params: Promise.resolve({ id: 'toilet-01' }),
    });

    expect(response.status).toBe(403);
    expect(set).not.toHaveBeenCalled();
  });
});
