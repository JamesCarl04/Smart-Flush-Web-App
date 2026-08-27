# Sensor, Water, and Routine Toilet Maintenance Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver reliable automation for ultrasonic sensor faults, calibrated water overuse, and completed-cycle maintenance checks, with immediate idle-tech dispatch, supervisor-only unassigned handling, and safe retry assignment.

**Architecture:** Railway's `mqtt-listener` is the sole telemetry evaluator and task dispatcher. It writes normalized tasks to Firestore using a contract shared with the Vercel dashboard and React Native app. The dashboard configures and validates rules, while supervisor APIs approve, assign, and reset the routine counter. Mobile subscriptions render only the tasks each role is allowed to act on.

**Tech Stack:** TypeScript, Next.js App Router, Firebase Admin/Firestore/FCM, Railway Node MQTT listener, React Native/Expo, Jest.

**Spec:** `docs/superpowers/specs/2026-08-26-sensor-water-routine-maintenance-design.md`

## Implementation status (2026-08-27)

- [x] Task 1: Remove the current Vercel production-build blocker
- [x] Task 2: Create one canonical automation-rule model and make the dashboard contextual
- [x] Task 3: Establish the listener task/assignment/notification contract
- [x] Task 4: Make MQTT telemetry distinguish valid flushes and evaluate all three rules
- [x] Task 5: Retry unassigned work and reset routine counters only on supervisor approval
- [x] Task 6: Align dashboard task controls and mobile role visibility
- [x] Task 7: Add Firestore indexes, security review, and deployment configuration checks
- [ ] Task 8: Verify production-equivalent behavior and perform the controlled rollout

## Global constraints

- Do not dispatch on idle `waterflow: 0`; only a finite, positive-volume, positive-duration completed-flow event is a flush/cycle.
- Do not deploy Water Overuse or Routine Toilet Check until the ESP32 packet contract is manually confirmed as one completed-flow event per flush.
- One active automated task per `deviceId + automationTrigger`; update an existing unassigned task during retry rather than creating a second task.
- Unassigned automation tasks have `isBroadcast: false`; notify supervisors/admins only and hide them from technician inboxes.
- Preserve `Create Maintenance Ticket` as a legacy action alias.
- Use 60 seconds as the configurable initial unassigned retry (`AUTOMATION_UNASSIGNED_RETRY_MS`); repeated scans must be bounded and idempotent.

---

### Task 1: Remove the current Vercel production-build blocker

**Files:**
- Modify: `lib/task-types.ts`
- Modify: `__tests__/task-service.test.ts`

1. Add the optional `additionalPhotos` API field to `TaskApiData` with the same JSON-safe array shape returned by `serializeTaskSnapshot`.
2. Add a serializer regression test using a Firestore-like snapshot containing `additionalPhotos`; assert the returned API object preserves it.
3. Run `npm run build` from the web root. This task is complete only when the Next production build exits 0; `tsc --noEmit` alone is not sufficient.

### Task 2: Create one canonical automation-rule model and make the dashboard contextual

**Files:**
- Create: `lib/automation-rule-config.ts`
- Modify: `app/(dashboard)/configuration/page.tsx`
- Modify: `app/api/automation-rules/route.ts`
- Modify: `app/api/automation-rules/[id]/route.ts`
- Create: `__tests__/automation-rule-config.test.ts`
- Create: `__tests__/automation-rules-route.test.ts`

1. Define a typed configuration map for exactly `ultrasonic_sensor_fault`, `water_overuse`, and `maintenance_due`: label, backend group, task trigger type, unit, default, range, decimal/integer behavior, and helper text.
2. Map the legacy stored `flush_count_exceeded` record to the existing/read-only legacy presentation; do not reinterpret it as routine maintenance automatically. Map legacy `Create Maintenance Ticket` to the new task action label and evaluator behavior.
3. Drive the modal trigger options, initial group/action, threshold label, input type/step/min/max, help copy, and submit validation from that map. Use defaults of 10 seconds and 200 cycles; Water Overuse begins empty and requires a positive calibrated litre value.
4. Restrict the focused create flow to the three production configurations. Existing other rules remain listed and editable only where their present behavior is still supported.
5. Validate `group`, `trigger`, `action`, threshold type/range, and cross-field combination in POST/PATCH routes before writing Firestore. Return a 400 with a precise field error for unknown or incompatible values.
6. Unit-test UI-independent validation: valid boundaries, rejected zero/negative water limits, rejected non-integer duration/cycle values, legacy action normalization, and incompatible group/trigger/action requests.

### Task 3: Establish the listener task/assignment/notification contract

**Files:**
- Modify: `mqtt-listener/package.json`
- Create: `mqtt-listener/jest.config.cjs`
- Modify: `mqtt-listener/src/task-types.ts`
- Create: `mqtt-listener/src/task-assignment.ts`
- Modify: `mqtt-listener/src/task-service.ts`
- Modify: `mqtt-listener/src/fcm.ts`
- Create: `mqtt-listener/src/__tests__/task-assignment.test.ts`
- Create: `mqtt-listener/src/__tests__/task-service.test.ts`
- Create: `mqtt-listener/src/__tests__/fcm.test.ts`

1. Add a listener-local Jest/TypeScript test command (`jest --runInBand`) and test transforms consistent with its CommonJS TypeScript build.
2. Extend listener task types to the web/mobile contract: statuses `unassigned`, `assigned`, `acknowledged`, `pending`, `rechecking`, `completed`; trigger types `sensor_fault`, `water_overuse`, and `maintenance`; assignment arrays; `isBroadcast`; automation provenance; retry due time; timestamps.
3. Implement `findAvailableMaintenancePersonnel()` in the listener. Read active maintenance users, reject offline/inactive users, fetch active task assignees using the stated statuses, and return candidates sorted by `lastAutoAssignedAt` then uid.
4. Implement `createAutomationTaskAndNotify()` as one path for initial and retry assignment. It writes `assigned`/targeted notification for a selected technician, otherwise writes `unassigned`, `isBroadcast: false`, `requiresSupervisorAssignment: true`, and an `autoAssignmentEligibleAt` 60 seconds later.
5. Update FCM targeting: assigned tasks notify only their assignee; unassigned automation tasks notify only all valid supervisor/admin tokens. Do not use the existing maintenance-team multicast fallback for this case. Include `taskId`, `deviceId`, `automationTrigger`, and `status` in data payloads.
6. Unit-test: idle technician chosen; busy/offline/inactive users excluded; deterministic least-recent assignment; assigned document and targeted token path; no-idle supervisor-only document/token path; FCM failures logged without rolling back the Firestore task.

### Task 4: Make MQTT telemetry distinguish valid flushes and evaluate all three rules

**Files:**
- Modify: `mqtt-listener/src/mqtt-client.ts`
- Modify: `mqtt-listener/src/firestore-writers.ts`
- Modify: `mqtt-listener/src/hardware-counters.ts`
- Modify: `mqtt-listener/src/alert-engine.ts`
- Create: `mqtt-listener/src/automation-engine.ts`
- Create: `mqtt-listener/src/__tests__/automation-engine.test.ts`
- Create: `mqtt-listener/src/__tests__/firestore-writers.test.ts`

1. Add `isValidCompletedFlowEvent(payload)` that accepts only finite positive `volume` and `duration` with a supported unit. Persist every raw water sensor reading for observability, but call `writeFlushEvent`, increment `flushCycleCount`, and evaluate water/routine rules only after that predicate succeeds.
2. Update `writeFlushEvent` to return the persisted event result and perform the counter increment synchronously enough that rule evaluation cannot race ahead of the new event. Replace current fire-and-forget calls in the MQTT handler with an awaited per-message pipeline and error isolation per packet.
3. Add `flushCycleCount` to `MaintenanceCounters`; increment it once for each accepted completed flow event. Preserve existing lifetime volume/pump/relay counters only for valid flow events.
4. On every ultrasonic MQTT packet, record device heartbeat first and call the automation engine even if persistence is throttled. Track invalid-start time per device in memory. Trigger only when the heartbeat is fresh and invalid readings have persisted for the configured seconds; clear state on a valid reading.
5. Evaluate enabled Firestore rules from both `system_alert` and `maintenance` groups. Implement only the three named configurations: ultrasonic duration, positive-flow water volume, and `flushCycleCount >= threshold`.
6. Before creating a task, query for an active matching `(deviceId, automationTrigger)` task. Add a 10-minute device-and-trigger debounce for alert/task delivery, not a global trigger-only debounce. Emit one alert alongside a task only when it aids dashboard observability; alerts never replace task creation.
7. Remove the current automatic `uv_complete` task creation from the MQTT path or gate it behind an existing non-focused rule so the new three-rule release has no hidden hard-coded dispatch behavior.
8. Test each rule at boundary and above threshold; a `0` water packet creates no flush event/cycle/task; a malformed packet creates no task; a single ultrasonic zero does not trigger; sustained zeros do; offline/stale devices do not; existing active task and debounce prevent duplicates; two devices with the same trigger remain independent.

### Task 5: Retry unassigned work and reset routine counters only on supervisor approval

**Files:**
- Create: `mqtt-listener/src/unassigned-task-sweeper.ts`
- Modify: `mqtt-listener/src/index.ts`
- Modify: `mqtt-listener/src/task-service.ts`
- Modify: `app/api/supervisor/reassign-task/route.ts`
- Modify: `app/api/supervisor/approve-task/route.ts`
- Create: `mqtt-listener/src/__tests__/unassigned-task-sweeper.test.ts`
- Create: `__tests__/supervisor-approve-task-route.test.ts`

1. Start an idempotent listener-side sweep at a conservative interval (default 15 seconds, configurable). Query due `unassigned` automation tasks, re-read each task in a transaction, and skip if it has been manually assigned, completed, or its due time changed.
2. For each due task, run the same availability function. If someone is idle, update the existing document to `assigned`, set assignment arrays/timestamps/source `retry_auto`, clear `requiresSupervisorAssignment` and `autoAssignmentEligibleAt`, update the selected user’s `lastAutoAssignedAt`, then send one targeted FCM notification. If no one is idle, move the due time forward by the retry delay without sending a technician multicast.
3. In supervisor reassignment, mark `assignmentSource: 'supervisor'`, clear retry fields, set `isBroadcast: false`, and update all assignment representations atomically so the sweeper cannot overwrite a manual decision.
4. In the approval route, fetch the task and use a Firestore transaction. For a completed task with `automationTrigger === 'maintenance_due'`, set inspection approval fields and reset `devices/{deviceId}/maintenanceCounters/current.flushCycleCount` to 0 in the same transaction/batch. Reject/reset neither non-routine tasks nor unfinished routine tasks. Keep the existing explicit reset-counter endpoint aligned with this canonical field.
5. Test task transitions: manual assignment wins over a concurrent retry, a still-busy task remains unassigned, retry selects a newly idle technician once, technician completion does not reset cycles, and eligible supervisor approval does reset exactly once.

### Task 6: Align dashboard task controls and mobile role visibility

**Files:**
- Modify: `components/dashboard/MaintenanceTaskPanel.tsx`
- Modify: `lib/task-types.ts`
- Modify: `lib/task-service.ts`
- Modify: `C:/Users/justi/Development/Smart-Flush-Mobile-App/context/TasksContext.tsx`
- Modify: `C:/Users/justi/Development/Smart-Flush-Mobile-App/lib/tasks.ts`
- Modify: `C:/Users/justi/Development/Smart-Flush-Mobile-App/components/MaintenanceUI.tsx`
- Modify: `C:/Users/justi/Development/Smart-Flush-Mobile-App/types/index.ts`
- Add/modify: relevant mobile Jest tests for task parsing and inbox filtering

1. Add the automation metadata to web task serializers/types without changing existing manual-task behavior. Show `Unassigned — supervisor action required` in the dashboard for `requiresSupervisorAssignment` tasks, include the retry deadline, and let a supervisor assign one through the existing task route.
2. Ensure every dashboard assignment mutation writes `assigned`, `assignedTo`, `assignedToIds`, `isBroadcast: false`, `assignmentSource: 'supervisor'`, and clears the retry fields as a single update.
3. Extend mobile task parsing for optional automation metadata with safe defaults for older documents.
4. Change technician inbox filtering so `unassigned` is included only when `isBroadcast === true`; supervisor/admin task views retain all unassigned work. This preserves existing broadcast/manual workflows while hiding the new supervisor-only queue.
5. Render explicit labels/tone for `sensor_fault` as Ultrasonic Sensor Fault, `water_overuse` as Water Overuse, and `maintenance` with `automationTrigger === maintenance_due` as Routine Toilet Check. Ensure supervisor and technician badges share those labels.
6. Run the mobile Jest suite and `npm run typecheck` after the changes.

### Task 7: Add Firestore indexes, security review, and deployment configuration checks

**Files:**
- Create: `firestore.indexes.json`
- Modify: `firestore.rules` only if the current authenticated task reads permit a technician to read supervisor-only unassigned tasks
- Modify: `README.md` or create: `docs/automation-deployment-checklist.md`

1. Add Firestore composite indexes required by the live queries: active task lookup by `deviceId`, `automationTrigger`, and `status`; due unassigned retry lookup by `status` and `autoAssignmentEligibleAt`; and alert dedupe lookup by `deviceId`, `type`, and timestamp/acknowledgement as used by the final query implementation.
2. Keep Firebase Admin writes server-side. Review mobile Firestore reads against the new privacy requirement. If current broad task reads cannot be safely narrowed without breaking subscriptions, retain authenticated reads only after the mobile client filters supervisor-only tasks and document the remaining client-read limitation for a later rules/auth-claims hardening task.
3. Document exact deployment prerequisites: Vercel Firebase Admin variables (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`); Railway equivalents plus MQTT variables; an FCM token for at least one supervisor and technician; Firestore index/rules deployment commands; and the correct Vercel project linkage needed to inspect logs.
4. Add a startup configuration validator in the listener that fails clearly when required Firebase/MQTT credentials are absent. In the web app, log an actionable server-side configuration error rather than constructing Firebase Admin with empty credentials.

### Task 8: Verify production-equivalent behavior and perform the controlled rollout

**Execution status (2026-08-27):** Local verification and mocked Firestore/FCM
coverage are complete. The physical ESP32 completed-flow test, Firestore emulator
run, and controlled Railway/Vercel rollout remain pending their required runtime
credentials, linked deployment targets, and hardware test device.

**Files:**
- Modify: `README.md` or `docs/automation-deployment-checklist.md` with the final runbook and rollback steps

1. Web verification: `npm run lint`, `npx jest --runInBand --silent`, `npm run build`.
2. Listener verification: `npm --prefix mqtt-listener test`, `npm --prefix mqtt-listener run build`.
3. Mobile verification: from `C:/Users/justi/Development/Smart-Flush-Mobile-App`, run `npx jest --maxWorkers=2` and `npm run typecheck`.
4. Emulator/integration test with mocked Firestore/FCM: create one idle technician and one supervisor, then publish (a) sustained invalid ultrasonic readings, (b) valid water flow above the calibrated threshold, and (c) valid flow events until the cycle threshold. Verify one assigned task each, targeted technician FCM, and mobile-visible Firestore task shape.
5. Repeat with all technicians busy. Verify a single `unassigned`, `isBroadcast:false` task, supervisor-only FCM, no technician inbox entry, manual supervisor assignment, and retry assignment after a technician becomes idle.
6. Verify water safety: publish idle `volume: 0` readings before and after a valid flush. Confirm no task/cycle increment for zero readings. Do not enable water/routine production rules until the physical ESP32 test demonstrates one completed-flow packet per actual flush.
7. Roll out Railway first, confirm listener startup/configuration and Firestore writes, then deploy Vercel and verify its production build/log linkage. Enable one rule at a time on a test device. Roll back by disabling the rule documents; this stops new tasks without deleting task history.
