export const DEFAULT_DEVICE_ID = 'toilet-01';

// The ESP32 listener marks devices offline after 60s with no heartbeat.
// Allow a small grace period so the UI does not flap during normal polling jitter.
export const DEVICE_HEARTBEAT_TIMEOUT_MS = 90_000;

// Transient actuator readings (waterflow, UV cycles) represent active work only
// within this freshness window; older readings from earlier flushes are stale.
export const SENSOR_EVENT_FRESHNESS_MS = 15_000;

// Minimum waterflow volume/rate (L or L/min) treated as active flow.
export const ACTIVE_WATERFLOW_THRESHOLD = 0.05;
