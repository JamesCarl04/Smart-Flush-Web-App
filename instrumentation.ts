// instrumentation.ts (Next.js 14 server instrumentation hook)
// MQTT listening has been moved to the standalone Railway service (mqtt-listener/).
// Vercel is serverless and cannot hold persistent TCP connections.
// This file is intentionally a no-op.
export async function register(): Promise<void> {
  // No-op: MQTT is handled by the Railway mqtt-listener service.
}
