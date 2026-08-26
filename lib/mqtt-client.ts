// lib/mqtt-client.ts
// Singleton MQTT client for HiveMQ Cloud (TLS port 8883)
// Import this via getMqttClient() — never call mqtt.connect() directly elsewhere
import mqtt, { type MqttClient } from 'mqtt';

// ─── Singleton state ──────────────────────────────────────────────────────────

let client: MqttClient | null = null;

function buildBrokerUrl(hostOrUrl: string | undefined, port: string): string {
  const value = hostOrUrl?.trim();
  if (!value) {
    throw new Error('MQTT_BROKER_URL is required');
  }

  if (/^mqtts?:\/\//i.test(value)) {
    return value;
  }

  return `mqtts://${value}:${port.trim() || '8883'}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the shared MQTT client, creating and connecting it on first call.
 * Safe to call multiple times — subsequent calls return the same instance.
 */
export function getMqttClient(): MqttClient {
  if (client) return client;

  const brokerUrl = buildBrokerUrl(
    process.env.MQTT_BROKER_URL,
    process.env.MQTT_PORT ?? '8883',
  );
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  if (!username || !password) {
    throw new Error('MQTT_USERNAME and MQTT_PASSWORD are required');
  }

  console.log(`[MQTT] Connecting to ${brokerUrl} …`);

  client = mqtt.connect(brokerUrl, {
    username,
    password,
    rejectUnauthorized: true,
    reconnectPeriod: 5000, // 5 s between reconnect attempts
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    console.log('[MQTT] Connected for command publishing');
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
