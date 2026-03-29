// src/index.ts
// Entry point for the standalone SmartFlush MQTT listener service.
// Deployed on Railway — runs as a long-lived process (NOT serverless).
//
// Start command:  ts-node src/index.ts
// ────────────────────────────────────────────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config(); // Load .env file (Railway also injects env vars at runtime)

import { getMqttClient } from './mqtt-client';

// ─── Banner ───────────────────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║   SmartFlush MQTT Listener Service                  ║');
console.log('║   Runtime: Railway (long-lived process)             ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log(`[${new Date().toISOString()}] Starting up …`);
console.log(`  Device ID:  ${process.env.MQTT_DEVICE_ID ?? 'toilet-01'}`);
console.log(`  Broker:     ${process.env.MQTT_BROKER_URL ?? '(not set)'}`);
console.log(`  Project:    ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? '(not set)'}`);
console.log('');

// ─── Boot MQTT ────────────────────────────────────────────────────────────────

const client = getMqttClient();

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[${new Date().toISOString()}] Received ${signal} — shutting down …`);
  client.end(false, {}, () => {
    console.log(`[${new Date().toISOString()}] MQTT client closed. Bye!`);
    process.exit(0);
  });

  // Force-kill after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Keep-alive ───────────────────────────────────────────────────────────────
// Railway keeps the process alive as long as it's running.
// This heartbeat log helps verify the service is still active.

setInterval(() => {
  const connected = client.connected;
  console.log(
    `[${new Date().toISOString()}] [Heartbeat] MQTT ${connected ? '✓ connected' : '✗ disconnected'}`
  );
}, 60_000); // Every 60 seconds
