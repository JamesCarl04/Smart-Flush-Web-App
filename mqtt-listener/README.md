# SmartFlush MQTT Listener Service

Standalone MQTT listener that bridges **HiveMQ Cloud ↔ Firebase Firestore**.  
Deployed on **Railway** as a long-lived process (not serverless).

## Why this exists

Vercel is serverless — it kills persistent TCP connections like MQTT.  
This service runs 24/7 on Railway, listens for ESP32 sensor data over MQTT,  
and writes it to Firestore. The Next.js app on Vercel only handles the  
dashboard UI and publish-side MQTT commands.

## Architecture

```
ESP32 ──── MQTT (HiveMQ Cloud) ──── Railway (this service) ──── Firestore
                   │
           Vercel (Next.js) publishes commands via MQTT
```

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env
# Fill in your MQTT and Firebase credentials

# 3. Run
npm run dev
```

## Deploy to Railway

1. Create a new project on [railway.app](https://railway.app)
2. Connect this folder as a service (or use the Railway CLI)
3. Set the **Start Command** to: `npx ts-node src/index.ts`
4. Add these environment variables in Railway dashboard:

| Variable | Description |
|---|---|
| `MQTT_BROKER_URL` | HiveMQ Cloud broker hostname |
| `MQTT_USERNAME` | MQTT username |
| `MQTT_PASSWORD` | MQTT password |
| `MQTT_PORT` | `8883` (TLS) |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key (with `\n` escapes) |
| `MQTT_DEVICE_ID` | Device identifier (default: `toilet-01`) |

## MQTT Topics

### Subscribed (ESP32 → Railway → Firestore)

| Topic | Payload |
|---|---|
| `toilet/sensors/ultrasonic` | `{"distance":18,"unit":"cm","timestamp":123}` |
| `toilet/sensors/waterflow` | `{"volume":0.8,"duration":4,"unit":"L"}` |
| `toilet/events/lid` | `{"status":"open","timestamp":123}` |
| `toilet/events/pump` | `{"status":"active","timestamp":123}` |
| `toilet/events/uv` | `{"duration":30,"completed":true,"timestamp":123}` |

### Published (Vercel → ESP32) — handled by Next.js API routes

| Topic | Payload |
|---|---|
| `toilet/commands/pump` | `"ON"` or `"OFF"` |
| `toilet/commands/uv` | `"ON"` or `"OFF"` |
| `toilet/commands/lid` | `"OPEN"` or `"CLOSE"` |
| `toilet/commands/config` | `{"pumpDuration":5,"uvDuration":30,"threshold":30}` |

## File Structure

```
mqtt-listener/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── index.ts              ← Entry point, boots MQTT + graceful shutdown
    ├── mqtt-client.ts        ← MQTT connection singleton + message router
    ├── firebase-admin.ts     ← Firebase Admin SDK init
    ├── firestore-writers.ts  ← Writes sensor/event data to Firestore
    ├── alert-engine.ts       ← Evaluates automation rules, creates alerts
    └── hardware-counters.ts  ← Increments maintenance counters
```
