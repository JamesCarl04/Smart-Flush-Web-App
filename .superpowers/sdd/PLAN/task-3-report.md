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

---

## Fix round 1 — review findings

### Status

Complete. The trusted-IP boundary, evidence durability, leak-notification delivery, and request-size handling were redesigned and verified while preserving the anonymous intake contract.

### Files changed

- `.env.example`, `docs/public-issue-reporting-deployment.md` — define the single trusted proxy-header setting, Vercel production default, proxy overwrite assumption, 6 MiB application ceiling, and deployment requirements.
- `lib/public-issue-reports.ts` — validate one allowlisted authoritative IP header; stage evidence privately before acceptance; atomically persist exact temporary/final paths plus a recoverable finalization job; provide idempotent evidence finalization; create/claim/retry/deliver a transactional notification outbox; and validate durable image MIME values.
- `app/api/public/issue-reports/route.ts` — reject oversized declared bodies before `formData()`, retain post-parse enforcement, use private temporary/final Storage operations, and supply stable notification IDs.
- `lib/fcm.ts` — surface multicast delivery failures to the outbox and use the outbox ID as Android/APNS collapse metadata.
- `firestore.rules`, `storage.rules` — explicitly deny direct-client access to both durable job collections and temporary/final evidence paths.
- `__tests__/integration/public-issue-reports-api.test.ts` — trusted-header spoofing/fail-closed and early/post-parse body-ceiling coverage.
- `__tests__/unit/public-issue-report-service.test.ts` — evidence cleanup/interruption/retry/idempotence/fallback-failure coverage and transactional outbox cadence/retry/interruption coverage.
- `__tests__/unit/fcm-admin-notification.test.ts`, `__tests__/unit/public-issue-report-validation.test.ts` — delivery-error propagation/collapse IDs and durable MIME type-guard coverage.

### TDD RED/GREEN evidence

- RED: five new route tests failed because spoofed forwarding headers could influence the fingerprint, invalid/missing authoritative values were not rejected, unsupported header configuration was accepted, and `formData()` was called before an oversized `Content-Length` could be rejected. GREEN: all route tests pass with exact-header selection, IP validation, production Vercel default behavior, pre-parse 413 rejection, and post-parse fallback validation.
- RED: evidence recovery tests exposed post-upload metadata failure, process interruption, duplicate finalization, acceptance-transaction cleanup, and fallback-write failure gaps. GREEN: private staging plus a transactionally recorded finalization job keeps accepted evidence tracked; pre-commit failure cleans the temporary object; finalization is retryable and idempotent; failure-state write errors leave the original pending job durable.
- RED: notification tests showed direct post-commit sends could be suppressed by cadence after failure or interruption. GREEN: acceptance now persists one outbox record transactionally, claims it after commit, retries failures, records delivery separately, reuses an undelivered outbox after the cadence window, and avoids concurrent duplicate attempts with a lease.
- RED: the FCM failure test resolved despite a failed multicast result. GREEN: delivery failure now rejects back to the outbox, while stable collapse IDs mitigate a retry after an ambiguous delivery acknowledgment.
- RED: the production build found that a generic Firestore string could not safely populate the evidence MIME union; the focused type-guard test initially failed because the guard did not exist. GREEN: the allowlist guard passes 14 validation tests and the production TypeScript build succeeds without an unsafe cast.

### Verification

- Focused MIME/service Jest: `npx jest __tests__/unit/public-issue-report-validation.test.ts __tests__/unit/public-issue-report-service.test.ts --runInBand --watchAll=false` — PASS, 2 suites and 35/35 tests.
- Full root Jest: `npx jest --runInBand --watchAll=false` — PASS, 25 suites and 204/204 tests.
- Production build: `npm run build` — PASS, including TypeScript, static generation, and the public report route/page.
- Scoped ESLint over all changed TypeScript source/tests — PASS with exit code 0 and no findings.
- `git diff --check` — PASS; only repository line-ending conversion notices were emitted.

### Commit

- Planned focused commit: `fix: make public report intake recoverable`.

### Self-review

- Only the configured allowlisted proxy-owned header is read. Generic `x-forwarded-for`, `x-real-ip`, and unrelated platform headers are ignored; a missing or invalid selected address cannot produce a fingerprint.
- Evidence is first written to a private temporary prefix. The accepted submission and durable job atomically record its exact temporary and final private paths; finalization copies only when needed, deletes the temporary object idempotently, and commits stored metadata with job completion in one Firestore transaction. No public URL is persisted.
- A continuous-leak acceptance creates at most one pending outbox per aggregate/cadence interval. Sending happens only after commit, failed transport attempts return to pending, delivered state is separate, and a stable notification ID is carried to FCM collapse metadata.
- Declared request sizes over 6 MiB are rejected before parsing. Missing, malformed, chunked, or dishonest declarations still face field/photo validation and the post-parse total ceiling.

### Concerns

- Production must deploy a scheduled/queued invoker for the exported durable evidence and notification processors so jobs left by a process exit are retried without waiting for a later matching report. The records and processors are recoverable and idempotent; this task does not provision deployment infrastructure.
- Exactly-once push delivery cannot be guaranteed across a transport-success/metadata-write crash. The outbox lease and stable Android/APNS collapse ID prevent concurrent sends and reduce visible duplicates on retry.
- No live Firebase project was mutated. Deploy the updated rules and validate the trusted edge strips/overwrites the configured authoritative header before enabling anonymous intake.
