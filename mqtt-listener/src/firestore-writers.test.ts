jest.mock('./firebase-admin', () => ({ adminDb: {} }));
jest.mock('./hardware-counters', () => ({ incrementCounters: jest.fn() }));
jest.mock('./local-runtime-cache', () => ({
  recordDeviceHeartbeat: jest.fn(),
  recordSensorReading: jest.fn(),
}));

import { isValidCompletedFlowEvent } from './firestore-writers';

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
