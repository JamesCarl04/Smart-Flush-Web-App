# Sensor Automation Deployment Checklist

## Required services and credentials

Use the same Firebase project in Vercel, Railway, the mobile app, and the ESP32 test environment.

- Vercel server variables: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`.
- Vercel client variables: all `NEXT_PUBLIC_FIREBASE_*` values and `NEXT_PUBLIC_APP_URL`.
- Railway variables: the three Firebase Admin variables, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_PORT`, and `MQTT_DEVICE_ID`.
- Railway optional timing controls: `AUTOMATION_UNASSIGNED_SWEEP_MS=15000`, `AUTOMATION_UNASSIGNED_RETRY_MS=60000`, and the throttling values documented in `mqtt-listener/.env.example`.
- Mobile: all `EXPO_PUBLIC_FIREBASE_*` values, `EXPO_PUBLIC_BACKEND_API_BASE_URL`, a valid `google-services.json`, and the Expo project ID.
- Firestore user records: at least one online, active maintenance technician and one supervisor/admin. Both devices must have valid `fcmToken` fields before notification testing.

Never place Firebase Admin credentials in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.

## Firestore rules and indexes

From the web repository, authenticate the Firebase CLI and explicitly select the same project used by Vercel and Railway:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <firebase-project-id>
```

`firestore.rules` permits supervisors/admins to read all tasks. Maintenance users can read only tasks assigned to their UID/email, containing their UID in `assignedToIds`, or explicitly marked `isBroadcast:true`. The mobile client uses matching role-safe queries; supervisor-only unassigned automation tasks are not sent to technician subscriptions.

The Firestore emulator requires Java. Install a supported JDK before running local rule-unit tests; do not treat client-side filtering as a substitute for deploying the rules.

## Vercel project and logs

Confirm the repository is linked to the intended Vercel project, not a similarly named preview project:

```powershell
npx vercel link
npx vercel env ls
npx vercel inspect <deployment-url-or-id> --logs
```

All three Firebase Admin variables must be present in Production and whichever Preview environment is being tested. Redeploy after changing secrets. A build can succeed without credentials, but server routes will log a specific missing-variable error and cannot access Firebase Admin until configured.

## Production-equivalent verification

Run before rollout:

```powershell
# Web
npm run lint
npx jest --runInBand --silent
npm run build

# Railway listener
npm --prefix mqtt-listener test
npm --prefix mqtt-listener run build

# Mobile repository
npx jest --maxWorkers=2
npm run typecheck
```

Test one device with one rule enabled at a time:

1. Publish sustained invalid ultrasonic readings while fresh MQTT traffic keeps the device online. Confirm one `sensor_fault` task.
2. Publish a positive completed-flow packet above the configured litre threshold. Confirm one `water_overuse` task.
3. Publish `pump.status = "active"` without a later positive completed-flow packet for the configured wait. Repeat until the dry-cycle threshold. Confirm one `water_no_flow` task. Idle zero-flow packets must create neither a flush event nor a task.
4. Publish valid completed-flow packets until `maintenance_due` reaches its threshold. Confirm one routine task. Complete it, then approve it as supervisor and confirm the counter resets once.
5. With an idle technician, confirm direct assignment and targeted technician FCM. With all technicians busy, confirm one `unassigned`, `isBroadcast:false` task, supervisor/admin FCM only, no technician inbox entry, and assignment after a technician is idle at the next retry.

## Rollout and rollback

1. Deploy Railway first and confirm its startup validator, MQTT connection, Firestore writes, retry sweeper, and FCM results.
2. Deploy Firestore rules/indexes and Vercel, then verify the linked deployment logs and mobile subscriptions.
3. Enable only one rule on the hardware test device. Do not enable water/routine rules broadly until the ESP32 proves it emits exactly one positive completed-flow packet per physical flush.
4. Roll back safely by disabling the affected `automationRules` documents. This stops new automation tasks without deleting task history. If runtime rollback is required, redeploy the previous Railway/Vercel versions; do not delete Firestore tasks or counters.
