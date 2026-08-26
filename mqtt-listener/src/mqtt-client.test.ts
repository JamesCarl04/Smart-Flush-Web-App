const writeSensorReading = jest.fn();
const writeFlushEvent = jest.fn();
const updateDeviceLastSeen = jest.fn();
const handleCompletedFlow = jest.fn();
const handleUltrasonic = jest.fn();
const handlePumpEvent = jest.fn();
const processDueNoWaterCheck = jest.fn();
const processPendingThresholdEvents = jest.fn();
const recordHeartbeat = jest.fn();

jest.mock('mqtt', () => ({ __esModule: true, default: { connect: jest.fn() } }));
jest.mock('./firestore-writers', () => ({
  writeSensorReading,
  writeFlushEvent,
  writeLidEvent: jest.fn(),
  writeUVCycle: jest.fn(),
  updateDeviceLastSeen,
  isValidCompletedFlowEvent: (payload: { volume?: number; duration?: number; unit?: string }) =>
    typeof payload.volume === 'number' && payload.volume > 0 &&
    typeof payload.duration === 'number' && payload.duration > 0 &&
    payload.unit === 'L',
}));
jest.mock('./alert-engine', () => ({ resetOfflineWatchdog: jest.fn() }));
jest.mock('./local-runtime-cache', () => ({ recordDeviceHeartbeat: jest.fn() }));
jest.mock('./automation-engine', () => ({
  createAutomationEngine: () => ({
    recordHeartbeat,
    handleCompletedFlow,
    handleUltrasonic,
    handlePumpEvent,
    processDueNoWaterCheck,
    processPendingThresholdEvents,
  }),
}));

import { handleMessage, handleMessageSafely, processPendingAutomationState } from './mqtt-client';

describe('MQTT automation routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores zero flow only as telemetry and never as a completed flush', async () => {
    await handleMessage('toilet/sensors/waterflow', Buffer.from(JSON.stringify({ volume: 0, duration: 3, unit: 'L' })));
    expect(writeSensorReading).toHaveBeenCalledTimes(1);
    expect(writeFlushEvent).not.toHaveBeenCalled();
    expect(handleCompletedFlow).not.toHaveBeenCalled();
  });

  it('awaits a valid flush write before evaluating its returned cycle count', async () => {
    writeFlushEvent.mockResolvedValue({ id: 'flush-1', flushCycleCount: 200 });
    const payload = { volume: 1.5, duration: 3, unit: 'L' };
    await handleMessage('toilet/sensors/waterflow', Buffer.from(JSON.stringify(payload)));
    expect(writeFlushEvent).toHaveBeenCalledWith(payload, 'toilet-01');
    expect(handleCompletedFlow).toHaveBeenCalledWith('toilet-01', payload, 200);
  });

  it('routes ultrasonic and pump activity into the automation engine', async () => {
    const ultrasonic = { distance: 0, unit: 'cm', timestamp: 1 };
    await handleMessage('toilet/sensors/ultrasonic', Buffer.from(JSON.stringify(ultrasonic)));
    await handleMessage('toilet/events/pump', Buffer.from(JSON.stringify({ status: 'active', timestamp: 2 })));
    expect(recordHeartbeat).toHaveBeenCalledWith('toilet-01');
    expect(handleUltrasonic).toHaveBeenCalledWith('toilet-01', ultrasonic);
    expect(handlePumpEvent).toHaveBeenCalledWith('toilet-01', { status: 'active', timestamp: 2 });
  });

  it('contains a Firestore failure at one message boundary and processes the next message', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    updateDeviceLastSeen.mockRejectedValueOnce(new Error('index unavailable')).mockResolvedValue(undefined);

    await handleMessageSafely('toilet/events/pump', Buffer.from('{"status":"active"}'));
    await handleMessageSafely('toilet/events/pump', Buffer.from('{"status":"inactive"}'));

    expect(handlePumpEvent).toHaveBeenCalledTimes(1);
    expect(handlePumpEvent).toHaveBeenCalledWith('toilet-01', { status: 'inactive' });
    consoleError.mockRestore();
  });

  it('continues pending-state recovery when one state query fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    processDueNoWaterCheck.mockRejectedValueOnce(new Error('query failed'));

    await processPendingAutomationState();

    expect(processPendingThresholdEvents).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
