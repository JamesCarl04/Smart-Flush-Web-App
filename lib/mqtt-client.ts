// lib/mqtt-client.ts
// Singleton MQTT client for HiveMQ Cloud (TLS port 8883)
// Import this via getMqttClient() — never call mqtt.connect() directly elsewhere
import mqtt, { type MqttClient } from 'mqtt';
import {
  writeSensorReading,
  writeFlushEvent,
  writeLidEvent,
  writeUVCycle,
  updateDeviceLastSeen,
} from '@/lib/firestore-writers';
import { evaluateAlerts } from '@/lib/alert-engine';

// The device ID associated with the single physical toilet unit.
// Override via MQTT_DEVICE_ID env var if you later support multiple devices.
const DEVICE_ID = process.env.MQTT_DEVICE_ID ?? 'toilet-01';

// ─── Payload interfaces ───────────────────────────────────────────────────────

interface UltrasonicPayload {
  distance: number;
  unit: string;
  timestamp: number;
}

interface WaterflowPayload {
  volume: number;
  duration: number;
  unit: string;
}

interface LidPayload {
  status: 'open' | 'closed';
  timestamp: number;
}

interface UVPayload {
  duration: number;
  completed: boolean;
  timestamp: number;
}

// ─── Singleton state ──────────────────────────────────────────────────────────

let client: MqttClient | null = null;

// ─── Message router ───────────────────────────────────────────────────────────

async function handleMessage(topic: string, raw: Buffer): Promise<void> {
  console.log(`[MQTT] Message: ${topic}`);

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    console.error(`[MQTT] Invalid JSON on topic ${topic}:`, raw.toString());
    return;
  }

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
      console.log('[MQTT] Pump event:', JSON.stringify(payload));
      break;
    }
    default:
      console.warn(`[MQTT] Unhandled topic: ${topic}`);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the shared MQTT client, creating and connecting it on first call.
 * Safe to call multiple times — subsequent calls return the same instance.
 */
export function getMqttClient(): MqttClient {
  if (client) return client;

  const brokerUrl = `mqtts://${process.env.MQTT_BROKER_URL}:${process.env.MQTT_PORT ?? '8883'}`;

  console.log(`[MQTT] Connecting to ${brokerUrl} …`);

  client = mqtt.connect(brokerUrl, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    rejectUnauthorized: true,
    reconnectPeriod: 5000, // 5 s between reconnect attempts
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    console.log('[MQTT] Connected');
    client!.subscribe(
      ['toilet/sensors/#', 'toilet/events/#'],
      { qos: 1 },
      (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err);
        } else {
          console.log(
            '[MQTT] Subscribed to toilet/sensors/# and toilet/events/#',
          );
        }
      },
    );
  });

  client.on('message', (topic, message) => {
    void handleMessage(topic, message);
  });

  client.on('error', (error) => {
    console.error('[MQTT] Error:', error.message);
  });

  client.on('close', () => {
    console.warn('[MQTT] Disconnected — will retry in 5 s');
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting …');
  });

  return client;
}
