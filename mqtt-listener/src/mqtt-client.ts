// src/mqtt-client.ts
// MQTT connection singleton for HiveMQ Cloud (TLS port 8883).
// Subscribes to sensor & event topics, routes messages to Firestore writers
// and the alert engine.
import mqtt, { type MqttClient } from 'mqtt';
import {
  writeSensorReading,
  writeFlushEvent,
  writeLidEvent,
  writeUVCycle,
  updateDeviceLastSeen,
  type UltrasonicPayload,
  type WaterflowPayload,
  type LidPayload,
  type UVPayload,
} from './firestore-writers';
import { evaluateAlerts, resetOfflineWatchdog } from './alert-engine';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEVICE_ID = process.env.MQTT_DEVICE_ID ?? 'toilet-01';

const BROKER_URL = process.env.MQTT_BROKER_URL;
const USERNAME = process.env.MQTT_USERNAME;
const PASSWORD = process.env.MQTT_PASSWORD;
const PORT = process.env.MQTT_PORT ?? '8883';

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

// ─── Singleton state ──────────────────────────────────────────────────────────

let client: MqttClient | null = null;

// ─── Message router ───────────────────────────────────────────────────────────

async function handleMessage(topic: string, raw: Buffer): Promise<void> {
  console.log(`[${ts()}] [MQTT] Message on: ${topic}`);

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    console.error(`[${ts()}] [MQTT] Invalid JSON on topic ${topic}:`, raw.toString());
    return;
  }

  // Reset the device-offline watchdog on every inbound message
  resetOfflineWatchdog(DEVICE_ID);

  // Update the device's lastSeen for every inbound message
  void updateDeviceLastSeen(DEVICE_ID);

  switch (topic) {
    case 'toilet/sensors/ultrasonic': {
      const p = payload as UltrasonicPayload;
      void writeSensorReading(topic, p, DEVICE_ID);
      break;
    }
    case 'toilet/sensors/waterflow': {
      const p = payload as WaterflowPayload;
      void writeSensorReading(topic, p, DEVICE_ID);
      void writeFlushEvent(p, DEVICE_ID);
      void evaluateAlerts(topic, p, DEVICE_ID);
      break;
    }
    case 'toilet/events/lid': {
      const p = payload as LidPayload;
      void writeLidEvent(p, DEVICE_ID);
      break;
    }
    case 'toilet/events/uv': {
      const p = payload as UVPayload;
      void writeUVCycle(p, DEVICE_ID);
      void evaluateAlerts(topic, p, DEVICE_ID);
      break;
    }
    case 'toilet/events/pump': {
      // Pump events are informational — log only (no dedicated collection)
      console.log(`[${ts()}] [MQTT] Pump event:`, JSON.stringify(payload));
      break;
    }
    default:
      console.warn(`[${ts()}] [MQTT] Unhandled topic: ${topic}`);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the shared MQTT client, creating and connecting it on first call.
 * Safe to call multiple times — subsequent calls return the same instance.
 */
export function getMqttClient(): MqttClient {
  if (client) return client;

  if (!BROKER_URL || !USERNAME || !PASSWORD) {
    console.error(`[${ts()}] [MQTT] Missing required env vars:`);
    console.error('  MQTT_BROKER_URL:', BROKER_URL ? '✓' : '✗');
    console.error('  MQTT_USERNAME:', USERNAME ? '✓' : '✗');
    console.error('  MQTT_PASSWORD:', PASSWORD ? '✓' : '✗');
    process.exit(1);
  }

  const brokerUrl = `mqtts://${BROKER_URL}:${PORT}`;
  console.log(`[${ts()}] [MQTT] Connecting to ${brokerUrl} …`);

  client = mqtt.connect(brokerUrl, {
    username: USERNAME,
    password: PASSWORD,
    rejectUnauthorized: false, // Prototype — HiveMQ Cloud uses valid certs but Railway may not resolve them
    reconnectPeriod: 5000, // 5 s between reconnect attempts
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    console.log(`[${ts()}] [MQTT] ✓ Connected to ${brokerUrl}`);
    client!.subscribe(['toilet/sensors/#', 'toilet/events/#'], { qos: 1 }, (err) => {
      if (err) {
        console.error(`[${ts()}] [MQTT] Subscribe error:`, err);
      } else {
        console.log(`[${ts()}] [MQTT] ✓ Subscribed to toilet/sensors/# and toilet/events/#`);
      }
    });
  });

  client.on('message', (topic, message) => {
    void handleMessage(topic, message);
  });

  client.on('error', (error) => {
    console.error(`[${ts()}] [MQTT] Error:`, error.message);
  });

  client.on('close', () => {
    console.warn(`[${ts()}] [MQTT] Disconnected — will retry in 5 s`);
  });

  client.on('reconnect', () => {
    console.log(`[${ts()}] [MQTT] Reconnecting …`);
  });

  client.on('offline', () => {
    console.warn(`[${ts()}] [MQTT] Client offline`);
  });

  return client;
}
