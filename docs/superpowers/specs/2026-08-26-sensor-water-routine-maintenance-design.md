# Sensor, Water, and Routine Toilet Maintenance Automation Design

**Status:** proposed for approval
**Date:** 2026-08-26

## Objective

Make three trustworthy automation rules create a Firestore task for the mobile workflow:

1. **Ultrasonic Sensor Fault** — the ESP32 remains online while an invalid ultrasonic value persists for the configured number of seconds.
2. **Water Overuse** — a completed flush reports more water than the configured litres-per-flush limit.
3. **Routine Toilet Check** — the number of completed, valid toilet cycles reaches the configured limit.

These rules dispatch an available maintenance technician immediately. When none is available, they create a supervisor-only unassigned task; they do not broadcast that task to the maintenance team. A short retry subsequently assigns it if a technician becomes available.

## Production ownership

The Railway `mqtt-listener` is the single owner of telemetry-triggered automation. It receives MQTT packets continuously and writes tasks, alerts, counters, and FCM notifications using Firebase Admin. The Vercel Next.js app owns the rule configuration UI/API, task approval, and dashboard presentation. The mobile app only consumes Firestore task state in real time.

The existing root Next.js `lib/alert-engine.ts` must not be treated as a live MQTT execution path. The listener has its own `src/alert-engine.ts`; the implementation must either move the production logic there or extract a tested shared module. This release uses the listener as the source of truth to avoid a Vercel/Railway split-brain implementation.

## Telemetry contract and safeguards

| Rule | Input accepted as a trigger | Threshold unit | Must never trigger from |
| --- | --- | --- | --- |
| Ultrasonic Sensor Fault | Consecutive ultrasonic MQTT readings `<= 0` or `> 400 cm` while the device heartbeat is fresh | continuous invalid seconds | a device that has no fresh heartbeat, a one-off bad sample, or persistence throttling |
| Water Overuse | A valid completed-flow event with finite `volume > 0`, finite `duration > 0`, and a supported unit | litres per completed flush | `0` waterflow while idle, malformed packets, and periodic sensor samples that are not a completed flush |
| Routine Toilet Check | The same valid completed-flow event increments `flushCycleCount` once | completed cycles | `0` flow, malformed flow, and raw MQTT messages that are merely samples |

The current documented waterflow payload is interpreted as one completed flush. Before enabling Water Overuse or Routine Toilet Check in production, the ESP32 contract must be verified to send exactly one valid completed-flow packet per flush. If the device instead sends periodic/cumulative samples, the firmware must publish a distinct completed-cycle event or event id first; otherwise cycle counts and tasks would be incorrect.

Water Overuse has no unsafe default: the dashboard requires a calibrated positive litres-per-flush value and warns that calibration must occur after the pump repair. A zero water reading is stored for observability but is not a flush event and does not increment counters.

## Rule configuration

Only the following trigger/action combinations can create automated maintenance tasks:

| Dashboard label | Stored trigger | Group | Threshold label | Validation | Action |
| --- | --- | --- | --- | --- | --- |
| Ultrasonic Sensor Fault | `ultrasonic_sensor_fault` | `system_alert` | Invalid reading duration (seconds) | integer 5–60; default 10 | Send Task to Available Maintenance |
| Water Overuse | `water_overuse` | `system_alert` | Maximum water per flush (L) | positive decimal; required, no default | Send Task to Available Maintenance |
| Routine Toilet Check | `maintenance_due` | `maintenance` | Completed toilet cycles | integer 1–100000; default 200 | Send Task to Available Maintenance |

The UI retains the stored legacy action `Create Maintenance Ticket` as an alias of `Send Task to Available Maintenance`; it is displayed with the new label and evaluated identically. Unsupported legacy rules continue to display but are not silently repurposed. Server-side validation uses the same canonical configuration as the UI.

## Dispatch state machine

```text
valid telemetry + enabled rule + threshold met
  -> same-device/same-trigger active-task check
  -> available technician?
       yes -> assigned task + targeted FCM
       no  -> unassigned supervisor-only task + supervisor FCM
                    -> after 60 s, re-check availability
                         -> available: assigned task + targeted FCM
                         -> none: remain unassigned; repeat at a bounded interval
```

The initial retry delay is **60 seconds** and is configurable by `AUTOMATION_UNASSIGNED_RETRY_MS`. This is intentionally longer than 20 seconds so a supervisor has a realistic opportunity to assign it first, while still resolving forgotten tasks quickly. A supervisor assignment cancels automatic retries.

Availability means a `users` document with `role === 'maintenance'`, `isOnline !== false`, `isActive !== false`, and `status` not equal to `offline` or `inactive`, with no active task in `assigned`, `acknowledged`, `pending`, or `rechecking`. Among idle users, select the least recently auto-assigned technician; break ties by stable user id. The listener and dashboard must use this one definition.

## Task document contract

Automated tasks retain the shared `tasks` schema and add explicit automation metadata:

```ts
{
  triggerType: 'sensor_fault' | 'water_overuse' | 'maintenance',
  automationRuleId: string,
  automationTrigger: 'ultrasonic_sensor_fault' | 'water_overuse' | 'maintenance_due',
  status: 'assigned' | 'unassigned',
  assignedTo: string | null,
  assignedToIds: string[],
  isBroadcast: false,
  requiresSupervisorAssignment: boolean,
  assignmentSource: 'initial_auto' | 'supervisor' | 'retry_auto',
  autoAssignmentEligibleAt: Timestamp | null,
  cycleCountAtTrigger?: number,
  createdBy: 'system:mqtt',
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

For every `(deviceId, automationTrigger)`, the listener allows at most one active task. This active-task guard is authoritative; the 10-minute alert/task debounce is an additional safety net keyed by both device and trigger, never trigger-only across different devices.

When no technician is available, only supervisor/admin FCM tokens receive the notification. The task has `isBroadcast: false`, and maintenance inbox queries/filtering must exclude it. The supervisor may assign it manually. The delayed reassignment worker updates the existing document rather than creating a second task.

## Routine-counter lifecycle

`devices/{deviceId}/maintenanceCounters/current.flushCycleCount` is the canonical routine-maintenance counter. It increments once only after a valid completed-flow event has been persisted. A Routine Toilet Check task records the counter value that caused it. The counter is reset to zero in the supervisor approval transaction for a completed, approved `maintenance_due` task; technician completion alone never resets it. The existing reset-counter API uses the same field for a deliberate manual reset.

## User experience

The dashboard's Threshold / Limit field becomes contextual, with the exact labels, helper text, units, defaults, and validation above. The selector exposes these three production rules for the focused automation flow. Existing action text is shown as **Send Task to Available Maintenance**.

On mobile, `sensor_fault` is labelled **Ultrasonic Sensor Fault**, `water_overuse` is **Water Overuse**, and `maintenance` is **Routine Toilet Check**. Assigned tasks appear immediately through the existing Firestore subscription. Supervisor-only unassigned tasks appear in the supervisor queue but never in a technician inbox unless the supervisor or retry worker assigns them.

## Non-goals and rollout gates

- ESP32 firmware changes are not part of this release; the deployment gate is validating its completed-flow packet semantics.
- ESP32 offline detection is not a dispatch rule in this release.
- UV, generic flush-count, pump, and hardware-counter automations remain outside this focused three-rule UI; existing records remain readable.
- The known Vercel build error (`additionalPhotos` is serialized but absent from `TaskApiData`) must be fixed before deployment validation.
- Vercel project linkage/log access and Firebase Admin environment variables must be verified by the project owner before production rollout.
