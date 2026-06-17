# An IoT-Based Toilet Sanitation, Analytics, and Predictive Maintenance Management System - Backend Guide

> Stack: **Next.js 14 App Router + TypeScript 5 + Firebase Firestore (Admin SDK) + Firebase Auth + MQTT (HiveMQ Cloud)**  
> Deployment: **Vercel** (API routes + frontend), **Render/Railway** (MQTT worker, separate)

---

## Firestore Security Rules

All rules simplified — no role-based access control. Any authenticated user has full access to their scope.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    // users: only self can read/write their own document
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // devices: any authenticated user can read/write
    match /devices/{deviceId} {
      allow read, write: if isAuthenticated();
      match /maintenanceCounters/{counterId} {
        allow read, write: if isAuthenticated();
      }
    }

    // sensorReadings: any authenticated user can read; Admin SDK only writes
    match /sensorReadings/{date}/readings/{readingId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    // alerts: any authenticated user can read/write
    match /alerts/{alertId} {
      allow read, write: if isAuthenticated();
    }

    // automationRules: any authenticated user can read/write
    match /automationRules/{ruleId} {
      allow read, write: if isAuthenticated();
    }

    // reports: any authenticated user can read their own
    match /reports/{reportId} {
      allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
      allow write: if false;
    }

    match /flushEvents/{id} { allow read: if isAuthenticated(); allow write: if false; }
    match /lidEvents/{id}   { allow read: if isAuthenticated(); allow write: if false; }
    match /uvCycles/{id}    { allow read: if isAuthenticated(); allow write: if false; }
  }
}
```

---

## Firestore Collection Schemas

### `users` — `/users/{userId}`
```ts
{ id: string; email: string; displayName: string; createdAt: Timestamp; }
```
> No `role` field.

### `devices` — `/devices/{deviceId}`
```ts
{ id: string; name: string; status: 'online'|'offline'; firmwareVersion: string; lastSeen: Timestamp; config: Record<string,string|number|boolean>; }
```

### `sensorReadings` — `/sensorReadings/{YYYY-MM-DD}/readings/{id}`
```ts
{ id: string; deviceId: string; sensorType: string; value: number; unit: string; timestamp: Timestamp; }
```

### `flushEvents` — `/flushEvents/{id}`
```ts
{ id: string; deviceId: string; waterVolume: number; duration: number; timestamp: Timestamp; }
```

### `lidEvents` — `/lidEvents/{id}`
```ts
{ id: string; deviceId: string; status: 'open'|'closed'; timestamp: Timestamp; }
```

### `uvCycles` — `/uvCycles/{id}`
```ts
{ id: string; deviceId: string; duration: number; completed: boolean; timestamp: Timestamp; }
```

### `automationRules` — `/automationRules/{id}`
```ts
{ id: string; name: string; group: string; trigger: string; threshold: number; action: string; enabled: boolean; createdAt: Timestamp; }
```

### `alerts` — `/alerts/{id}`
```ts
{ id: string; type: string; message: string; severity: 'low'|'medium'|'high'; acknowledged: boolean; deviceId: string; timestamp: Timestamp; }
```

### `reports` — `/reports/{id}`
```ts
{ id: string; type: string; from: string; to: string; format: 'csv'|'json'|'pdf'; userId: string; generatedAt: Timestamp; }
```

### `maintenanceCounters` — `/devices/{id}/maintenanceCounters/current`
```ts
{ uvOnTimeSeconds: number; lidCycleCount: number; flowSensorTotalLiters: number; pumpTotalLiters: number; relayTotalTriggers: number; ultrasonicConsecutiveFailures: number; }
```

---

## Auth API

### `POST /api/auth/register`
Creates Firebase Auth user + Firestore `users` doc.

**Body:** `{ email, password (≥8 chars), displayName }`  
**Returns:** `{ success: true, uid }`  
**Firestore doc shape:** `{ id, email, displayName, createdAt }` — no `role` field

### `POST /api/auth/logout`
Clears session cookie.  
**Returns:** `{ success: true }`

---

## Device API Routes

All routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/devices` | List all devices |
| `POST` | `/api/devices` | Create new device |
| `GET` | `/api/devices/:id` | Get single device |
| `PUT` | `/api/devices/:id` | Update name/description/config |
| `DELETE` | `/api/devices/:id` | Delete device |
| `GET` | `/api/devices/:id/status` | Get status + lastSeen |

---

## Actuator API Routes

All routes require `Authorization: Bearer <token>`. Returns `401` if unauthenticated.

| Method | Path | MQTT topic | Payload |
|---|---|---|---|
| `POST` | `/api/actuators/pump` | `toilet/commands/pump` | `{ command: 'ON'\|'OFF' }` |
| `POST` | `/api/actuators/uv` | `toilet/commands/uv` | `{ command: 'ON'\|'OFF' }` |
| `POST` | `/api/actuators/lid/open` | `toilet/commands/lid` | `OPEN` |
| `POST` | `/api/actuators/lid/close` | `toilet/commands/lid` | `CLOSE` |

---

## Sensor API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sensors/:id/readings?from=&to=` | Readings for date range |
| `GET` | `/api/sensors/:id/stats` | min/max/avg/count today |
| `PUT` | `/api/sensors/:id/config` | Update config → publishes to `toilet/commands/config` |

---

## Analytics API Routes

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/analytics/dashboard` | `{ totalFlushes, totalWaterLiters, uvCompletionRate, avgFlushesPerDay, uptimePercent }` |
| `GET` | `/api/analytics/water-usage?from=&to=` | `[{ date, totalVolume, avgVolume, flushCount }]` |
| `GET` | `/api/analytics/flush-patterns` | `{ byDay: [...], byHour: [...] }` |
| `GET` | `/api/analytics/system-performance` | `{ uptimePercent, onlineCount, totalCount, devices }` |

---

## Alerts API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/alerts` | List all alerts (optional `?acknowledged=false`) |
| `POST` | `/api/alerts` | Create alert `{ type, message, severity, deviceId }` |
| `POST` | `/api/alerts/:id/acknowledge` | Set `acknowledged: true` |
| `POST` | `/api/alerts/acknowledge-all` | Bulk acknowledge all unacknowledged |

---

## Alert Engine (`lib/alert-engine.ts`)

Called after every MQTT message. Evaluates `automationRules` where `group == 'system_alert'`.

| Trigger | Condition |
|---|---|
| `uv_cycle_failed` | `toilet/events/uv` with `completed === false` |
| `water_overuse` | `toilet/sensors/waterflow` with `volume > threshold` |
| `flush_count_exceeded` | today's flushEvents count > threshold |

**Debounce:** don't fire again until user acknowledges AND resets counter.
> `device_offline` — TODO: requires a cron/polling route (MQTT is push-only).

---

## Automation Rules API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/automation-rules` | List all rules |
| `POST` | `/api/automation-rules` | Create rule |
| `PUT` | `/api/automation-rules/:id` | Update (enable/disable, threshold, etc.) |
| `DELETE` | `/api/automation-rules/:id` | Delete rule |
| `POST` | `/api/automation-rules/:id/reset-counter` | Reset maintenance counter to 0 |

---

## Reports API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/reports/generate` | Generate CSV/JSON/PDF report |
| `GET` | `/api/reports/:id/download` | Re-stream report by ID |

**Body for generate:**
```json
{ "type": "daily|weekly|monthly|custom", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "format": "csv|json|pdf" }
```

---

## Quick Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register user |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/devices` | List devices |
| `POST` | `/api/devices` | Create device |
| `GET` | `/api/analytics/dashboard` | Dashboard KPIs |
| `GET` | `/api/analytics/water-usage` | Water usage by date |
| `GET` | `/api/alerts` | List alerts |
| `POST` | `/api/alerts` | Create alert |
| `POST` | `/api/alerts/acknowledge-all` | Bulk acknowledge |
| `POST` | `/api/actuators/pump` | Control pump |
| `POST` | `/api/actuators/lid/open` | Open lid |
| `POST` | `/api/automation-rules` | Create rule |
| `POST` | `/api/automation-rules/:id/reset-counter` | Reset maintenance counter |
| `POST` | `/api/reports/generate` | Generate report |
