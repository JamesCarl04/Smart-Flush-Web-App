jest.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: jest.fn() },
  adminMessaging: { send: jest.fn(), sendEachForMulticast: jest.fn() },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: jest.fn(), serverTimestamp: jest.fn() },
}));

import { sendAdminNotification } from '@/lib/fcm';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

const mockCollection = adminDb.collection as jest.Mock;
const mockSendEachForMulticast = adminMessaging.sendEachForMulticast as jest.Mock;

describe('reusable administrator-only FCM notification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries exactly administrators and sends only their tokens', async () => {
    const get = jest.fn().mockResolvedValue({
      docs: [
        { id: 'admin-1', data: () => ({ role: 'admin', fcmToken: 'admin-token-1' }) },
        { id: 'admin-2', data: () => ({ role: 'admin', fcmToken: 'admin-token-2' }) },
      ],
    });
    const where = jest.fn(() => ({ get }));
    mockCollection.mockReturnValue({ where });
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    await sendAdminNotification({
      title: 'Continuous leak reported',
      body: 'Main Restroom has a public leak report.',
      data: {
        notificationId: 'outbox-attempt-1',
        issueReportId: 'report-1',
        category: 'continuous_leak',
      },
    });

    expect(where).toHaveBeenCalledWith('role', '==', 'admin');
    expect(mockSendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['admin-token-1', 'admin-token-2'],
      notification: {
        title: 'Continuous leak reported',
        body: 'Main Restroom has a public leak report.',
      },
      data: {
        notificationId: 'outbox-attempt-1',
        issueReportId: 'report-1',
        category: 'continuous_leak',
      },
      android: { collapseKey: 'outbox-attempt-1' },
      apns: { headers: { 'apns-collapse-id': 'outbox-attempt-1' } },
    });
  });

  it('rejects when administrator delivery fails so the durable outbox remains retryable', async () => {
    const get = jest.fn().mockResolvedValue({
      docs: [
        { id: 'admin-1', data: () => ({ role: 'admin', fcmToken: 'admin-token-1' }) },
      ],
    });
    mockCollection.mockReturnValue({ where: jest.fn(() => ({ get })) });
    mockSendEachForMulticast.mockRejectedValue(new Error('FCM unavailable'));

    await expect(
      sendAdminNotification({
        title: 'Continuous leak reported',
        body: 'Main Restroom has a public leak report.',
        data: {
          notificationId: 'outbox-attempt-2',
          issueReportId: 'report-2',
          category: 'continuous_leak',
        },
      }),
    ).rejects.toThrow('Administrator notification delivery failed');
  });
});
