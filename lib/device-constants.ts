export const DEFAULT_DEVICE_ID = 'toilet-01';

// The ESP32 listener marks devices offline after 60s with no heartbeat.
// Allow a small grace period so the UI does not flap during normal polling jitter.
export const DEVICE_HEARTBEAT_TIMEOUT_MS = 90_000;
