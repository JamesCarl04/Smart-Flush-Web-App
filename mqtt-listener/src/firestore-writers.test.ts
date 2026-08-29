const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn(() => ({
  id: 'mock-doc-id',
  set: mockSet,
}));
const mockCollection = jest.fn((name?: string) => ({
  doc: mockDoc,
}));

jest.mock('./firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ _type: 'server-now' })),
    fromMillis: jest.fn((ms: number) => ({ _millis: ms })),
  },
  FieldValue: {
    serverTimestamp: jest.fn(() => ({ _type: 'server-timestamp' })),
  },
}));

jest.mock('./hardware-counters', () => ({ incrementCounters: jest.fn() }));
jest.mock('./local-runtime-cache', () => ({
  recordDeviceHeartbeat: jest.fn(),
  recordSensorReading: jest.fn(),
}));

import {
  isValidCompletedFlowEvent,
  writeUVCycle,
  writeLidEvent,
} from './firestore-writers';

describe('isValidCompletedFlowEvent', () => {
  it.each([
    [{ volume: 0, duration: 3, unit: 'L' }],
    [{ volume: 2, duration: 0, unit: 'L' }],
    [{ volume: Number.NaN, duration: 3, unit: 'L' }],
    [{ volume: 2, duration: 3, unit: 'gallons' }],
  ])('rejects a non-completed or unsupported water packet: %o', (payload) => {
    expect(isValidCompletedFlowEvent(payload)).toBe(false);
  });

  it('accepts a finite positive completed litre-flow packet', () => {
    expect(isValidCompletedFlowEvent({ volume: 1.25, duration: 3, unit: 'L' })).toBe(true);
  });
});

describe('writeUVCycle and writeLidEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes UV cycle with server Timestamp.now() and optional reason', async () => {
    await writeUVCycle(
      {
        duration: 5,
        completed: false,
        reason: 'lid_opened',
        timestamp: 12345, // raw millis from ESP32
      },
      'toilet-01',
    );

    expect(mockCollection).toHaveBeenCalledWith('uvCycles');
    expect(mockDoc).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      id: 'mock-doc-id',
      deviceId: 'toilet-01',
      duration: 5,
      completed: false,
      reason: 'lid_opened',
      timestamp: { _type: 'server-now' },
    });
  });

  it('writes Lid event with server Timestamp.now()', async () => {
    await writeLidEvent(
      {
        status: 'open',
        timestamp: 12345,
      },
      'toilet-01',
    );

    expect(mockCollection).toHaveBeenCalledWith('lidEvents');
    expect(mockDoc).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      id: 'mock-doc-id',
      deviceId: 'toilet-01',
      status: 'open',
      timestamp: { _type: 'server-now' },
    });
  });
});
