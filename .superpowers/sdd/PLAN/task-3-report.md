# Task 3 Report — Anonymous public QR report intake

## Status

Complete. Added anonymous, server-validated public issue reporting with durable transactional abuse controls and aggregate locking, private optional evidence, administrator-only continuous-leak notifications, legacy-compatible device enablement, and a mobile-first `/report/[deviceId]` experience.

## Files changed

### Shared contracts and server services

- `lib/public-issue-reports.ts` — issue categories/statuses, safe public device projection, form/photo validation, IP HMAC fingerprinting, Firestore transaction intake, rate/cooldown/open-key documents, aggregate/submission persistence, retention metadata, evidence-state handling, and leak-notification cadence.
- `lib/firebase-admin-config.ts`, `lib/firebase-admin.ts` — reusable Admin SDK environment resolution, `FIREBASE_STORAGE_BUCKET` configuration, and exported Admin Storage client.
- `lib/fcm.ts` — reusable exact-admin-role FCM notification function.
- `types/index.ts` — device public-reporting flag contract.

### API and public UI

- `app/api/public/issue-reports/route.ts` — anonymous multipart endpoint, trusted-header IP extraction/HMAC, fail-closed secret requirement, validation, private Storage upload, and minimal public receipt.
- `app/report/[deviceId]/page.tsx` — dynamic server-side device validation with safe unavailable state.
- `app/report/[deviceId]/PublicIssueReportForm.tsx` — mobile-first anonymous form and reference-only success state.
- `app/api/devices/route.ts`, `app/api/devices/[id]/route.ts` — create/update/read support, legacy default-to-enabled normalization, and admin authorization for flag changes.

### Security and configuration

- `.env.example` — documented server-only storage bucket and fingerprint secret variables without real secrets.
- `firestore.rules` — explicit direct-client denial for reports, submissions, rate limits, cooldowns, and open keys.
- `storage.rules` — explicit direct-client denial for anonymous report evidence.

### Tests

- `__tests__/unit/public-issue-report-validation.test.ts`
- `__tests__/unit/public-issue-report-service.test.ts`
- `__tests__/unit/public-issue-report-form.test.tsx`
- `__tests__/unit/fcm-admin-notification.test.ts`
- `__tests__/unit/firebase-admin-config.test.ts`
- `__tests__/integration/public-issue-reports-api.test.ts`
- `__tests__/integration/device-public-reporting-flag.test.ts`

## TDD RED/GREEN evidence

- RED: the validation suite failed because `lib/public-issue-reports.ts` did not exist. GREEN: 13 validation tests passed for category/description rules, honeypot/timing, legacy/disabled devices, HMAC behavior, and JPEG/PNG/WebP MIME/size/magic-byte checks.
- RED: transactional intake tests failed because `submitPublicIssueReport` did not exist. GREEN: create/merge, concurrent open-key serialization, durable five-per-15-minute and one-per-device/category-per-10-minute limits, new aggregate after terminal status, anonymous persistence, evidence success/failure, retention metadata, and leak cadence passed.
- RED: the public multipart route and anonymous form modules did not exist. GREEN: endpoint and UI tests passed with minimal receipts, no identity collection, no public status link, server-side validation, and photo handling.
- RED: device create/read/update tests showed no flag persistence/default/normalization and rejected valid flag-only updates. GREEN: explicit false and missing-as-true behavior passed, including administrator authorization for flag mutation.
- RED: the admin FCM export and Admin Storage config helper were absent. GREEN: exact-admin token targeting and storage-bucket configuration tests passed.
- Self-review RED: malformed device IDs reached persistence, a corrupt open key could cross-merge another device/category, and device flag mutation did not require admin. GREEN: all three focused regression tests passed after validation/authorization checks were added.

## Verification

- Full root Jest: `npx jest --runInBand --watchAll=false` — PASS, 25 suites and 188/188 tests.
- Production build: `npm run build` — PASS, including TypeScript validation and dynamic generation of `/api/public/issue-reports` and `/report/[deviceId]`.
- Scoped ESLint over every changed/new TypeScript or TSX source/test — PASS with zero errors (the generated `next-env.d.ts` ignore warning was excluded from the final scoped command).
- `git diff --check` / staged diff check — PASS; only repository line-ending conversion notices were emitted before staging.
- Standalone `npx tsc --noEmit` still reports unrelated pre-existing test typing errors in automation-rule, open-graph, and task-lifecycle tests; no Task 3 path was reported, and the production build typecheck passed.

## Commit

- `feat: add anonymous public issue reporting` — current Task 3 implementation commit.

## Self-review

- Public clients use only the Next.js page/API and cannot directly read or write Firestore report internals or Storage evidence.
- The raw client address exists only transiently in the route and is HMAC-SHA256 fingerprinted before the persistence service is called; no request headers or raw addresses are logged or stored.
- Firestore transaction reads the device, fingerprint rate document, cooldown document, and deterministic open key before writes. Aggregate count/submission/rate/cooldown/open-key writes commit atomically; concurrent different-fingerprint confirmations merge into one pending aggregate.
- Only `pending_review` aggregates with matching device/category may be reused. Confirmed, dismissed, missing, or corrupt open-key targets lead to a fresh aggregate and lock replacement.
- Evidence metadata contains a private non-guessable object path, content type, byte size, and state, never a public download URL. Upload failure leaves the accepted text submission intact with `upload_failed/storage_unavailable`.
- Continuous-leak notification eligibility is persisted inside the report transaction and delivery occurs after commit. FCM selects only users whose authoritative stored role equals `admin`; failures cannot undo report persistence.
- Intake never creates a maintenance task. Aggregates remain pending and carry active retention metadata for later dismissal/linked-task terminal handling.

## Concerns

- Production must set strong `PUBLIC_REPORT_FINGERPRINT_SECRET` and correct `FIREBASE_STORAGE_BUCKET` server variables before enabling the route, then deploy the updated Firestore and Storage rules.
- The Firestore transaction and private upload boundaries are covered with deterministic in-memory/mocked tests and a production build, but no live Firebase project was mutated during this task.
- Deployments outside Cloudflare/Vercel must ensure the front proxy strips and overwrites forwarded-IP headers before requests reach the app so the selected address remains trustworthy.
