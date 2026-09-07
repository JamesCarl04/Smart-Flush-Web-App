import { NextResponse } from 'next/server';

const mockSet = jest.fn();
const mockDoc = jest.fn((_id: string) => ({
  set: mockSet,
}));
const mockCollection = jest.fn((_name: string) => ({
  doc: mockDoc,
}));

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
  },
}));

const mockDeleteSentinel = { _delete: true };
const mockServerTimestampSentinel = { _serverTimestamp: true };

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: jest.fn(() => mockDeleteSentinel),
    serverTimestamp: jest.fn(() => mockServerTimestampSentinel),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn(),
}));

import { POST } from '@/app/api/tasks/unregister-token/route';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

describe('POST /api/tasks/unregister-token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes fcmToken from Firestore users collection and returns success', async () => {
    (verifyAuthToken as jest.Mock).mockResolvedValue({
      uid: 'technician-user-123',
      role: 'maintenance',
    });
    mockSet.mockResolvedValue(undefined);

    const request = new Request('http://localhost:3000/api/tasks/unregister-token', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });

    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockDoc).toHaveBeenCalledWith('technician-user-123');
    expect(mockSet).toHaveBeenCalledWith(
      {
        fcmToken: mockDeleteSentinel,
        updatedAt: mockServerTimestampSentinel,
      },
      { merge: true },
    );
    expect(FieldValue.delete).toHaveBeenCalled();
  });

  it('propagates 401 Response thrown by verifyAuthToken', async () => {
    const authErrorResponse = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
    (verifyAuthToken as jest.Mock).mockRejectedValue(authErrorResponse);

    const request = new Request('http://localhost:3000/api/tasks/unregister-token', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns status 500 when Firestore set throws an unexpected error', async () => {
    (verifyAuthToken as jest.Mock).mockResolvedValue({
      uid: 'technician-user-123',
    });
    mockSet.mockRejectedValue(new Error('Firestore connection timeout'));

    const request = new Request('http://localhost:3000/api/tasks/unregister-token', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'Failed to unregister FCM token',
    });
  });

  it('returns status 500 when verifyAuthToken throws a non-Response generic error', async () => {
    (verifyAuthToken as jest.Mock).mockRejectedValue(new Error('Cryptographic signature verification failed'));

    const request = new Request('http://localhost:3000/api/tasks/unregister-token', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'Failed to unregister FCM token',
    });
    expect(mockSet).not.toHaveBeenCalled();
  });
});
