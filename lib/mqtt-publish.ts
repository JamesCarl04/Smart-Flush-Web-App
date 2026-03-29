// lib/mqtt-publish.ts
// Publish commands to the ESP32 via HiveMQ
import { getMqttClient } from '@/lib/mqtt-client';

type PumpCommand = 'ON' | 'OFF';
type UVCommand = 'ON' | 'OFF';
type LidCommand = 'OPEN' | 'CLOSE';

interface ConfigUpdate {
  pumpDuration: number;
  uvDuration: number;
  threshold: number;
}

function publish(topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getMqttClient();
    client.publish(topic, payload, { qos: 1 }, (error) => {
      if (error) {
        console.error(`[MQTT] Publish error on ${topic}:`, error);
        reject(error);
      } else {
        console.log(`[MQTT] Published to ${topic}: ${payload}`);
        resolve();
      }
    });
  });
}

export function publishPumpCommand(command: PumpCommand): Promise<void> {
  return publish('toilet/commands/pump', command);
}

export function publishUVCommand(command: UVCommand): Promise<void> {
  return publish('toilet/commands/uv', command);
}

export function publishLidCommand(command: LidCommand): Promise<void> {
  return publish('toilet/commands/lid', command);
}

export function publishConfigUpdate(config: ConfigUpdate): Promise<void> {
  return publish('toilet/commands/config', JSON.stringify(config));
}

export function publishResetCommand(): Promise<void> {
  return publish('toilet/commands/reset', 'RESET');
}
