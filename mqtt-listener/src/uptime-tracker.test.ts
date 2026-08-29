import { todayKey, recordUptimeTick, startUptimeTracker, stopUptimeTracker } from './uptime-tracker';

const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn(() => ({
  set: mockBatchSet,
  commit: mockBatchCommit,
}));

const mockDoc = jest.fn((id: string) => ({ id }));
const mockCollection = jest.fn();

jest.mock('./firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
    batch: () => mockBatch(),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n: number) => ({ _increment: n }),
  },
  Timestamp: {
    fromDate: (d: Date) => ({ _date: d }),
  },
}));

describe('uptime-tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    stopUptimeTracker();
  });

  it('formats todayKey as YYYY-MM-DD', () => {
    const fixedDate = new Date('2026-08-29T12:00:00Z');
    expect(todayKey(fixedDate)).toBe('2026-08-29');
  });

  it('records uptime tick for online and offline devices', async () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const fourMinAgo = new Date(now.getTime() - 4 * 60 * 1000);
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const devicesDocs = [
      {
        id: 'device-online',
        data: () => ({
          lastSeen: { toMillis: () => fourMinAgo.getTime() },
        }),
      },
      {
        id: 'device-offline',
        data: () => ({
          lastSeen: { toMillis: () => tenMinAgo.getTime() },
        }),
      },
    ];

    mockCollection.mockImplementation((name: string) => {
      if (name === 'devices') {
        return {
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: devicesDocs,
          }),
        };
      }
      if (name === 'deviceUptimeDaily') {
        return {
          doc: mockDoc,
        };
      }
      return {};
    });

    await recordUptimeTick(now);

    expect(mockBatch).toHaveBeenCalled();
    expect(mockBatchSet).toHaveBeenCalledTimes(2);

    // device-online: onlineMinutes incremented by 1
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceId: 'device-online',
        date: '2026-08-29',
        totalMinutes: { _increment: 1 },
        onlineMinutes: { _increment: 1 },
      }),
      { merge: true },
    );

    // device-offline: onlineMinutes incremented by 0
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceId: 'device-offline',
        date: '2026-08-29',
        totalMinutes: { _increment: 1 },
        onlineMinutes: { _increment: 0 },
      }),
      { merge: true },
    );

    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('handles empty device collection without errors', async () => {
    mockCollection.mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    });

    await expect(recordUptimeTick()).resolves.toBeUndefined();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
