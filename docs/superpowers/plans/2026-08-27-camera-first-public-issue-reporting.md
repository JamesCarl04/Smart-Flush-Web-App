# Camera-First Public Issue Reporting Implementation Plan

> **Status:** Implementation in progress. Remaining unchecked items require
> physical-browser validation, clean baseline checks, and deployment rollout.

**Goal:** Let students report restroom issues with a camera-first flow, while
still allowing a report without an image when camera access is denied,
unavailable, or fails. Give administrators trustworthy context about the
device location and when the report was captured and submitted.

**Scope:** Web public reporting page at `/report/[deviceId]`, its public issue
report API, private evidence storage, and the administrator Issue Reports
review page. The existing authenticated dashboard and mobile task workflow
remain unchanged except where they consume the added report metadata.

**Key decisions:**

- [x] Use the rear-facing camera through `getUserMedia` for the primary flow;
      do not rely on `capture="environment"` alone because some browsers still
      allow gallery selection with that attribute.
- [x] Keep the original image unmodified and store capture metadata separately;
      do not burn a timestamp into the image pixels.
- [x] Treat the server receipt time as authoritative. Display the client camera
      capture time only as an observed time and label it accurately.
- [x] Resolve the toilet location from the registered Firestore device record,
      not from student GPS.
- [x] Permit no-image submission only after camera initialization/capture fails
      or permission is denied; do not expose a gallery/file-upload fallback.

## Feature checklist

### 1. Camera-only capture UI

- [x] Replace the public form's file input with a camera capture component.
- [x] Request the rear camera with a mobile-friendly video constraint.
- [x] Show camera permission, loading, active preview, capture, retake, and
      confirm states.
- [x] Stop all camera tracks when the component unmounts, after capture, and
      after cancel/retake to prevent the camera indicator remaining active.
- [x] Convert the confirmed frame to an accepted JPEG/PNG/WebP upload while
      enforcing the existing 5 MiB limit and image validation rules.
- [x] Do not provide a file picker or gallery-selection control.
- [x] Preserve accessible labels, keyboard focus, and a non-camera path for
      users whose device has no usable camera.

### 2. Camera failure and no-image fallback

- [x] Detect denied permission, unavailable camera, insecure-context failure,
      unsupported browser APIs, and capture errors.
- [x] Explain that the report may continue without a photo when camera access
      fails.
- [x] Keep the issue category and description fields usable in the fallback
      state.
- [x] Allow submission without `photo` only after a camera failure state is
      reached; require a photo when the camera is available and the student has
      not explicitly chosen the fallback.
- [x] Record a non-sensitive `photoCaptureStatus` such as `captured` or
      `unavailable` so administrators can distinguish a missing photo caused by
      the fallback from a malformed request.
- [x] Ensure the API continues to reject arbitrary client-supplied fallback
      reasons, oversized payloads, invalid image types, and honeypot abuse.

### 3. Capture and submission timestamps

- [x] Capture the browser time immediately when the frame is taken.
- [x] Send the capture time as optional metadata and validate its type and
      reasonable bounds on the server.
- [x] Generate an authoritative Firestore server timestamp for report receipt.
- [x] Store both timestamps when available, with clear names such as
      `photoCapturedAt` and `submittedAt`.
- [x] Treat `submittedAt` as authoritative for audit ordering; never describe a
      client clock value as guaranteed event time.
- [x] Format the displayed date/time using the configured application timezone
      and include the timezone in accessible text or metadata.
- [x] Add tests for missing, malformed, future, and valid capture timestamps.

### 4. Toilet location metadata

- [x] Load the sanitized device name, building, floor, and location before
      rendering the public form.
- [x] Include a snapshot of the display location in the persisted report so a
      later device rename does not rewrite historical context.
- [x] Display the location below the submitted image when an image exists and
      in the report details when no image exists.
- [x] Handle missing location fields with a safe fallback such as the device
      name and ID; never expose private device configuration.
- [x] Add tests proving the public page uses the requested device ID and does
      not accept a student-supplied location.

### 5. Student confirmation receipt

- [x] After a successful submission, show the reference code and confirmation
      message already returned by the API.
- [x] When a photo was captured, show the image preview with location,
      capture date/time, and server submission date/time beneath it.
- [x] When no photo was submitted, show a clear “Submitted without photo”
      state and the same location/time metadata.
- [x] Prevent duplicate submissions while the first request is in flight.
- [x] Ensure the receipt does not reveal internal IDs, private storage paths,
      student IP data, or administrator notification details.

### 6. Administrator review and private evidence

- [x] Show the submitted image only to authorized administrators/supervisors in
      the Issue Reports review page.
- [x] Show location, capture status, capture time, and authoritative submission
      time beside the evidence.
- [x] Keep evidence objects private and continue serving them through the
      authenticated evidence endpoint.
- [x] Preserve the existing confirm-to-create-task and dismiss workflows.
- [x] Add an explicit no-photo indicator so reviewers do not mistake a
      camera-fallback report for a failed upload.
- [x] Verify unauthorized users cannot list reports or fetch evidence.

### 7. API, Firestore, and compatibility contract

- [x] Extend the public issue-report input and serialized document types with
      optional capture status/time and immutable location snapshot fields.
- [x] Keep older reports readable when these fields are absent.
- [x] Preserve idempotency, rate limiting, cooldowns, notification outbox
      processing, and evidence recovery behavior.
- [x] Ensure reports without photos still create a reviewable pending report
      and administrator notification.
- [x] Add migration-free serialization defaults for existing documents.
- [x] Update Firestore indexes/rules only if the final review queries require
      them, keeping all private evidence access server-side.

### 8. Automated verification

- [ ] Unit-test camera state transitions, capture/retake behavior, cleanup, and
      camera failure fallback with mocked media devices.
- [x] Test that no gallery/file input is rendered in the public form.
- [x] Test API acceptance with a valid camera image and with an explicitly
      allowed no-image fallback.
- [x] Test rejection of a no-image request that did not enter the fallback
      state, if that requirement remains enabled in the final UX.
- [x] Test timestamp validation, timezone formatting, and location snapshots.
- [x] Test administrator-only evidence access and no-photo review rendering.
- [ ] Run the web Jest suite, TypeScript check, lint, and production build.
- [ ] Perform a manual mobile-browser test on Android and iOS for permission
      denied, camera capture, retake, submit, and no-image fallback.

### 9. Deployment and rollout

- [ ] Add any new production environment variables to the Vercel checklist;
      never hard-code secrets or camera policy values.
- [ ] Deploy the web app to a preview environment first.
- [ ] Verify one image report and one no-image fallback report end-to-end in
      preview, including administrator review and private evidence access.
- [ ] Confirm the production Vercel domain serves `/report/toilet-01` and that
      the device's `publicReportingEnabled` flag is enabled for the test device.
- [ ] Roll out to production after preview verification and record rollback
      steps (revert the web commit and disable public reporting if necessary).
