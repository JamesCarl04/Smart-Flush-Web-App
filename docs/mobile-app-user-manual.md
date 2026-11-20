# Klir Mobile Application User Manual

**Standard Operating Procedures for Facility Maintenance Technicians and Supervisors**  
**System:** SDCA Smart-Flush Facility Operations Platform  
**Application:** Klir Mobile (`klir-mobile`, Android Package `com.james.klir`)

---

## Document Control

| Attribute | Specification |
| :--- | :--- |
| **Document ID** | SF-MAN-MOB-002 |
| **Document Title** | Klir Mobile Application User Manual (Document 2 of 3) |
| **Application Version** | v1.24.4 (`Klir Facility Ops`) |
| **Target Platform** | Android (`com.james.klir`) |
| **Authorized Roles** | Facility Technicians (`maintenance`, `technician`) and Facility Supervisors (`supervisor`) |
| **Restricted Roles** | Facility Administrators (`admin`) -- blocked at login; redirected to the Smart-Flush Web Portal |
| **Classification** | Internal Facility Operations Documentation |

---

## Table of Contents

1. [Overview, Platform Architecture, and Role Scope](#1-overview-platform-architecture-and-role-scope)
   - [1.1 Purpose of Klir Mobile](#11-purpose-of-klir-mobile)
   - [1.2 Role-Based Access Matrix](#12-role-based-access-matrix)
   - [1.3 Data Synchronization and Connectivity Model](#13-data-synchronization-and-connectivity-model)
2. [Authentication, Security, Presence, and Shift Controls](#2-authentication-security-presence-and-shift-controls)
   - [2.1 Standard Email and Password Sign-In](#21-standard-email-and-password-sign-in)
   - [2.2 Biometric Quick-Unlock Security Behavior](#22-biometric-quick-unlock-security-behavior)
   - [2.3 Password Reset Procedure](#23-password-reset-procedure)
   - [2.4 Push Notifications and Alert Banners](#24-push-notifications-and-alert-banners)
   - [2.5 Live Shift Presence and Heartbeat Rules](#25-live-shift-presence-and-heartbeat-rules)
   - [2.6 Profile Sheet and End-of-Shift Logout](#26-profile-sheet-and-end-of-shift-logout)
3. [Facility Technician Operating Guide](#3-facility-technician-operating-guide)
   - [3.1 Technician Navigation Overview](#31-technician-navigation-overview)
   - [3.2 Inbox (Today's Tasks)](#32-inbox-todays-tasks)
   - [3.3 Choosing a Completion Path: Path A vs. Path B](#33-choosing-a-completion-path-path-a-vs-path-b)
   - [3.4 Path A: Full Guided Workflow via Active Task (Recommended)](#34-path-a-full-guided-workflow-via-active-task-recommended)
   - [3.5 Path B: Quick Inline Workflow via Task Detail Screen](#35-path-b-quick-inline-workflow-via-task-detail-screen)
   - [3.6 Photo Rules, Multi-Technician Team Tasks, and Offline Sync](#36-photo-rules-multi-technician-team-tasks-and-offline-sync)
   - [3.7 History (Completed Work)](#37-history-completed-work)
4. [Facility Supervisor Operating Guide](#4-facility-supervisor-operating-guide)
   - [4.1 Supervisor Navigation Architecture](#41-supervisor-navigation-architecture)
   - [4.2 Overview Dashboard](#42-overview-dashboard)
   - [4.3 Team Availability Monitor](#43-team-availability-monitor)
   - [4.4 Tasks Queue and Reassignment Controls](#44-tasks-queue-and-reassignment-controls)
   - [4.5 Completed Tasks and Quality Assurance Review](#45-completed-tasks-and-quality-assurance-review)
   - [4.6 Reports & Export](#46-reports-export)
5. [Quick Troubleshooting and Operational Reference](#5-quick-troubleshooting-and-operational-reference)
   - [5.1 Technician and Authentication Troubleshooting](#51-technician-and-authentication-troubleshooting)
   - [5.2 Supervisor and Audit Log Troubleshooting](#52-supervisor-and-audit-log-troubleshooting)
   - [5.3 System Limits, Thresholds, and Timers](#53-system-limits-thresholds-and-timers)

---

## 1. Overview, Platform Architecture, and Role Scope

### 1.1 Purpose of Klir Mobile

Klir Mobile (`Klir Facility Ops • v1.24.4`) is the dedicated Android field-operations application for the SDCA Smart-Flush Facility Operations Platform. It connects maintenance staff and shift supervisors to real-time restroom telemetry triggers, public issue reports, routine maintenance schedules, photographic proof-of-work verification, and Quality Assurance (QA) inspection workflows.

Klir Mobile enforces strict separation of duties between web administration and field execution:

- **Field Technicians** (`maintenance` or `technician` role) receive dispatches, capture watermarked before-and-after photographic evidence, execute the standardized 10-point `SDCA F-TGS 203 Checklist`, work offline when cellular/Wi-Fi signal drops inside campus restrooms, and submit completed work for inspection.
- **Facility Supervisors** (`supervisor` role) monitor live staff availability by building, assign or reassign unassigned and stalled work, audit photographic proofs and checklist compliance, approve finished jobs (resetting routine maintenance counters), flag substandard work for re-inspection, and export operational PDF and CSV reports.

### 1.2 Role-Based Access Matrix

Upon sign-in, Klir Mobile verifies the user's account profile and role against the backend endpoint (`/api/auth/me?platform=mobile`). Access is routed strictly by role:

| Account Role | Mobile Access Permitted | Initial Landing Screen | Primary Operational Capabilities |
| :--- | :--- | :--- | :--- |
| `maintenance` | Yes | `Inbox` (`Today's Tasks`) | View assigned/broadcast tasks, accept rechecks, execute guided or inline checklists, capture watermarked proofs, review personal `History`. |
| `technician` | Yes (role alias for `maintenance`) | `Inbox` (`Today's Tasks`) | Identical operational scope and tab layout as `maintenance`. |
| `supervisor` | Yes | `Overview` (`SupervisorDashboard`) | Monitor building-scoped team presence, assign/reassign up to 10 technicians, approve or flag completed tasks, export PDF/CSV reports. |
| `admin` | **No (Blocked)** | Rejected at Login Screen | Displays: `"Access denied. This app is for maintenance and supervisor accounts only."` Administrators must use the Smart-Flush Web Portal. |

### 1.3 Data Synchronization and Connectivity Model

Klir Mobile combines real-time cloud synchronization with local resilience caches:

1. **Real-Time Listeners + Polling Fallback**: Active task lists and supervisor personnel lists listen to Firestore (`onSnapshot`) and run a 10-second polling fallback to prevent stale UI states on unstable networks.
2. **Scoped Local Caches**: Active profiles, role-scoped tasks, and supervisor personnel lists are cached locally in `AsyncStorage` so interfaces populate immediately on launch.
3. **Offline Completion Queue**: Technicians can complete tasks without network coverage. Submissions are stored locally per user ID (`offline_tasks`) and uploaded automatically upon reconnection.
4. **Cloud Storage & Backend APIs**: Proof photos upload directly to Firebase Storage (`tasks/{taskId}/...`), while supervisor actions (approval, flagging, reassignment) invoke authenticated Next.js API routes (`/api/supervisor/*`) on the central web backend.

---

## 2. Authentication, Security, Presence, and Shift Controls

### 2.1 Standard Email and Password Sign-In

1. Open **Klir Mobile**. The login screen displays the **KLIR / Facility Operations** header.
2. Enter your assigned facility email address in the **Email** field (example format: `tech@smartflush.com`).
3. Enter your password in the **Password** field.
4. Tap **Login**.
5. The app authenticates with Firebase Authentication and validates your role through `/api/auth/me?platform=mobile` (subject to a **10-second validation timeout**).
6. If validation succeeds for `maintenance`, `technician`, or `supervisor`, the app registers your device push notification token and routes directly to your role workspace.

> **Important:** If an `admin` account attempts to sign in on Klir Mobile, authentication is immediately rejected with the message `"Access denied. This app is for maintenance and supervisor accounts only."`

### 2.2 Biometric Quick-Unlock Security Behavior

When the Android device has biometric hardware available and at least one biometric credential (fingerprint or face recognition) enrolled, the login screen displays the **Unlock with biometrics** button below **Login**.

Understanding how **Unlock with biometrics** works prevents confusion on shared or personal devices:

- **Email-Only Secure Vault**: For security compliance, Klir Mobile stores **only your saved email address** in the local biometric vault (`@klir:biometric_vault`) and never stores plaintext passwords (any legacy saved password field is automatically scrubbed).
- **Behavior When Password Field Is Empty**: Tapping **Unlock with biometrics** verifies your device fingerprint or face identity, automatically fills in your saved email address, and prompts: `"Biometric identity verified. Please enter your password to sign in."` You must still type your password to complete Firebase sign-in.
- **Behavior When Password Is Already Entered**: If you type your password first and then tap **Unlock with biometrics**, passing the biometric challenge submits sign-in immediately.
- **After Logout vs. App Reopen**: Signing out via **End Shift & Log Out** clears `@klir:biometric_vault`. As a result, biometric quick-unlock is available when reopening the app from an existing login session, whereas tapping **Unlock with biometrics** after an explicit logout prompts `"Please log in with your email and password first to enable biometric login."` until you complete one manual email/password sign-in. Excessive failed biometric challenges display `"Too many failed biometric attempts. Please log in with your password."`

### 2.3 Password Reset Procedure

1. On the Login screen, tap **Forgot password**.
2. On the **Reset Password** screen, enter your registered account email address.
3. Tap **Send Reset Link** to dispatch a Firebase password recovery email.
4. Follow the email link to set a new password, then tap **Back to Login** to sign in.
5. If you cannot access your email account, follow the on-screen footer instruction: *"Need assistance? Contact your facility supervisor."*

### 2.4 Push Notifications and Alert Banners

Klir Mobile uses Firebase Cloud Messaging (FCM) to dispatch immediate notifications when tasks are assigned, reassigned, or flagged for re-inspection:

- **Token Lifecycle**: Your device's FCM token is registered automatically upon successful login and unregistered automatically when you tap **End Shift & Log Out**.
- **Missing Permission Warning**: If Android notifications are disabled for Klir Mobile, a persistent banner warns **"Notifications disabled"** with the explanation **"Notifications are required to receive cleaning task alerts."**
- **Foreground Alert Snackbar**: When a push alert arrives while the app is open, a notification bar displays for **7 seconds** with a **View** action button.
- **Deep-Link Navigation**: Tapping **View** on the foreground alert (or tapping an OS notification outside the app) navigates directly to the target task (`SupervisorTaskDetail` for supervisors; `InboxTab` -> `TaskDetail` for technicians).

### 2.5 Live Shift Presence and Heartbeat Rules

Klir Mobile tracks staff operational presence so supervisors and automated dispatch sweeps know which technicians are actively on duty:

- **Foreground Heartbeat (`60 seconds`)**: While the app stays open in the foreground, Klir Mobile updates your live timestamp every **60 seconds**.
- **Backgrounding (`offline` Transition)**: Moving Klir Mobile to the background or locking the device screen immediately updates your user record to `isOnline: false` and status `offline`. Returning the app to the active foreground automatically restores your operational state (`available` or `on_task`).
- **2-Minute Staleness Timeout (`PRESENCE_TIMEOUT_MS = 120_000`)**: On the supervisor dashboard and team monitor, any staff member whose last recorded heartbeat is older than **2 minutes** is automatically classified as **Offline**, regardless of prior availability status.

### 2.6 Profile Sheet and End-of-Shift Logout

The top-right **Profile Avatar Button** is displayed exclusively on the two root workspace screens: **Inbox (`InboxHome`)** for technicians and **Overview (`SupervisorDashboard`)** for supervisors. While local or offline synchronization is actively running, the avatar button displays a loading spinner.

Tapping the top-right avatar opens the **Profile Sheet** (`ProfileSheetModal`), which presents:

- **Role Pill**: `Facility Supervisor` or `Facility Technician`
- **FACILITY / Assigned Facility**: Your assigned campus building (`user.building`), or `Main Campus / All Buildings` if unassigned to a specific building
- **Application Footer**: `Klir Facility Ops • v1.24.4` / `SDCA Smart Flush System`
- **End Shift & Log Out**:
  1. Tap **End Shift & Log Out**.
  2. Confirm in the **"End Shift & Log Out?"** dialog.
  3. Klir Mobile logs `AUTH_LOGOUT`, notifies `/api/auth/logout` (up to 1.5s timeout), marks your profile offline, unregisters your FCM push token, purges session caches (`@klir:cached_user_profile`, `@klir:tasks*`, legacy `@klir:offline_completions`, `@klir:biometric_vault`, `@klir:supervisor_tasks`, `@klir:supervisor_people`, `@klir:audit_logs_cache`), and signs out of Firebase.

> **Shift Handoff Warning:** Always verify that any pending offline completions in `offline_tasks` have finished uploading before ending your shift or clearing device app storage. Keep Klir Mobile open with internet connectivity until `"Offline sync complete."` appears; otherwise queued completions wait on the device until your exact UID signs back in, and local audit log caches are purged on logout.

---

## 3. Facility Technician Operating Guide

### 3.1 Technician Navigation Overview

After sign-in, technicians (`maintenance` or `technician`) see a **3-tab bottom navigation bar**:

| Bottom Tab | Screen Title | Primary Function |
| :--- | :--- | :--- |
| **Inbox** (`InboxTab`) | `Today's Tasks` | View Urgent Priority Card, filter `All` / `Active` / `Flagged` dispatches, accept rechecks, or open task details. |
| **Active Task** (`TaskTab`) | Active Task Workspace | Switch across active/assigned tasks and launch the **Recommended Path A** guided 3-step `TaskExecutionModal`. |
| **History** (`HistoryTab`) | `Completed Work` | Review completed jobs, KPI duration/compliance metrics, audit badges, and read-only proof records. |

> **Navigation Note:** When you open `TaskDetail` from an Inbox card or Urgent Priority Card, the bottom tab bar is hidden to maximize screen workspace. Use the top-left Back control to return to `Inbox`.

### 3.2 Inbox (`Today's Tasks`)

The **Inbox** (`Today's Tasks`) screen displays two top KPI summary cards—**Pending** and **In Progress**—followed by an optional **Urgent Priority Card** and three segmented filter tabs.

#### Priority Classification Tiers

Tasks are prioritized automatically by their trigger type or reassignment state:

| Priority Level | Trigger Types / Task Conditions |
| :--- | :--- |
| **Critical** | `hardware_failure`, `sensor_fault`, `water_no_flow`, `maintenance`, or tasks with `status: reassignment_needed` |
| **High** | `flush_count`, `water_overuse`, `uv_complete` |
| **Standard** | `manual`, `student_report` |

#### Urgent Priority Card Hoisting Behavior (Important UI Quirk)

To ensure urgent faults receive immediate visibility, Klir Mobile applies the following hoisting rule on the **Inbox** screen:

1. The system selects the **first `critical` task** in your inbox (or, if none are critical, the **first `high` priority task**) and elevates it into the top **Urgent Priority Card**.
2. Tapping **Open Priority Task** on this card opens **TaskDetail** (Path B inline screen)—it does **not** launch the guided `Active Task` modal automatically.
3. To prevent duplicate cards, the hoisted priority task is **excluded** from the **All** and **Active** card lists below—**however, the numeric badge `(N)` inside the `All (N)` and `Active (N)` tab labels still counts the hoisted priority task**. (For example, if `All (1)` shows 1 critical task hoisted at the top, the card list below displays empty until a second non-hoisted task arrives.)
4. **Exception for Flagged Filter**: If the hoisted priority task is currently `flagged`, switching to the **Flagged** tab **does** still include it so flagged items are never hidden under that filter.

#### Segmented Inbox Tabs & Card Actions

- **All (`N`)**: Displays all inbox tasks except the hoisted priority task (`N` counts total inbox tasks including the hoisted task).
- **Active (`N`)**: Displays tasks currently `acknowledged`, `rechecking`, or directly `assigned` to you except the hoisted priority task (`N` includes the hoisted task if active).
- **Flagged (`N`)**: Displays tasks returned by a supervisor for re-inspection.

Depending on task state, inbox cards display specific action buttons:

| Task State | Action Button Label | Resulting Behavior |
| :--- | :--- | :--- |
| `assigned` / broadcast / `reassignment_needed` | **Acknowledge & Start** | Marks task `acknowledged` and opens the guided **Active Task** workspace. |
| `acknowledged` | **Resume Task & Open Camera** | Continues active work inside the guided **Active Task** workspace. |
| `flagged` | **Review Remarks & Accept Recheck** | Opens `FlaggedRemarksModal` showing supervisor notes and reference photos. |
| `rechecking` | **Resume Recheck & Open Camera** | Opens the guided **Active Task** workspace in re-inspection mode *(where the Hero Card CTA reads **Resume Task & Open Camera**)*. |

#### Reviewing Supervisor Flag Remarks (`FlaggedRemarksModal`)

When a supervisor flags a submission, tap **Review Remarks & Accept Recheck** to inspect the **`Flagged for Re-inspection`** modal:

1. Review the supervisor's name, relative timestamp, and **`Recheck #N`** badge (shown when the task has been flagged more than once).
2. Read the **Supervisor Remarks** section detailing the specific deficiency.
3. Inspect **Supervisor Reference Photos (`N`)**—tap any thumbnail to open the zoomable full-screen viewer.
4. Tap **Close** to return without starting yet, or tap **Accept Recheck** to transition the task to `rechecking` and begin rectification.

### 3.3 Choosing a Completion Path: Path A vs. Path B

Klir Mobile provides two distinct ways to complete and submit a task. **Path A is strongly recommended for all routine, team, and detailed maintenance completions.**

| Feature / Behavior | Path A: Guided Workflow (`Active Task` via `TaskExecutionModal`) | Path B: Quick Inline Flow (Inbox Card via `TaskDetailScreen`) |
| :--- | :--- | :--- |
| **How to Enter** | Bottom tab **Active Task**, then tap **Acknowledge & Start Task** / **Resume Task & Open Camera** | Tap an Inbox card or **Open Priority Task** on the Urgent Priority Card |
| **Workflow Style** | Dedicated 3-step guided modal (`Before Photo` -> `Checklist & After Photo` -> `Summary & Verification`) | Single scrollable screen with linear progress stepper (`Reported` -> `Accepted` -> `Proof & Check` -> `Completed`/`Submitted`) |
| **Optional Biometric Gate** | Yes (before Step 1 photo; **Skip** is permitted) | Yes (integrated during start/completion prompt; skip permitted) |
| **Photo Resizing & Compression** | Resizes all photos to **`1080px` width** at **`0.75` JPEG quality** (low upload size) | **Does NOT resize** (`[]` transforms) at **`0.8` JPEG quality** (higher risk of exceeding 10 MB limit) |
| **`Additional Area Photos (0/3)`** | **Supported** (up to 3 tagged area photos in Step 3) | **NOT Available** (can only view previously captured area proofs) |
| **Multi-Task Switcher** | Horizontal **`Active Tasks (N):`** pill switcher at top | Single task view |
| **Multi-Tech Re-submission** | Checks personal `submissions.{uid}` cleanly | Blocks inline controls once `isUserSubmitted` is true; shows teammate status callouts |

### 3.4 Path A: Full Guided Workflow via Active Task (Recommended)

Open the **Active Task** tab at the bottom of the screen:

1. **Select Active Job**: If multiple tasks are assigned or in progress, tap a job pill in the horizontal **`Active Tasks (N):`** switcher bar. Review the Hero Card and its **INSTRUCTION** callout.
2. **Launch Guided Modal**: Tap **Acknowledge & Start Task** (for unstarted jobs) or **Resume Task & Open Camera** (displayed for both `acknowledged` and `rechecking` jobs).

#### Step 1: Before Photo & Optional Biometric Check

1. **Biometric Verification (Optional)**: When prompted, verify your fingerprint/face to attach a `Biometric Verified` trust indicator to the job record, or tap **Skip** if biometric verification is unavailable.
2. **Capture Before Photo**: Use the back camera to photograph the initial restroom condition.
3. **Automatic Watermarking & Optimization**: Klir Mobile automatically resizes the photo to `1080px` width (`0.75` JPEG compression) and burns an audit watermark bar across the image in 24-hour Philippine format (`en-PH`):
   `{DD MMM YYYY, HH:mm:ss} | {Restroom Label} ({deviceId}) | Task {last 6 characters of Task ID}`

> **Recheck Mode Step-Header Quirk:** When executing a **flagged recheck** where a prior `beforePhoto` already exists, `TaskExecutionModal` automatically skips Step 1 photo capture and opens directly on the checklist while displaying **"Step 1 of 3 • Review Checklist"** in the header, then advancing directly to **"Step 3 of 3 • Resubmit Re-inspection"** (no `"Step 2"` header is shown in this recheck branch).

#### Step 2: Maintenance Checklist (`SDCA F-TGS 203 Checklist`) & After Photo

Complete all applicable items in the **`SDCA F-TGS 203 Checklist`** (`{count}/10`). Each item cycles cleanly between **Unchecked**, **Done**, and **N/A**. Use **Check All as Done** to mark all 10 items at once or **Reset All Items** to clear them.

| Category | # | Exact Checklist Item Label | Requirement Note |
| :--- | :--- | :--- | :--- |
| **Dusting & Prep** | 1 | `Remove dust/cobwebs on ceilings` | Standard |
| **Dusting & Prep** | 2 | `Remove dust/cobwebs on walls` | Standard |
| **Dusting & Prep** | 3 | `Remove dust/cobwebs in light bulbs` | Standard |
| **Dusting & Prep** | 4 | `Clean windows (if any)` | Marked optional in checklist metadata |
| **Fixtures & Floors** | 5 | `Wipe down fixtures (armchairs, etc.)` | Marked optional in checklist metadata |
| **Fixtures & Floors** | 6 | `Sweep and dry floors` | Standard |
| **Fixtures & Floors** | 7 | `Arrange fixtures (if any)` | Marked optional in checklist metadata |
| **Disinfection & Waste** | 8 | `Disinfect often touched surfaces` | Standard |
| **Disinfection & Waste** | 9 | `Empty and re-line trash bins` | Standard |
| **Disinfection & Waste** | 10 | `Disinfect using UV lights, etc.` | Standard |

After completing all **10** checklist items (`Done` or `N/A`):
1. Enter optional maintenance remarks (`Technician Remarks (Optional)`). In recheck mode, the field is labeled **Rectification Remarks / Actions Taken** and pre-fills `"[Rectification] "`.
2. Tap to capture your watermarked **After Photo** (labeled **Take Rectified Proof Photo** in recheck mode). If any item remains `Unchecked`, Klir Mobile blocks camera launch with `"Checklist Incomplete — Please mark all 10 checklist items as Done or N/A before taking the after photo."`

#### Step 3: Summary, Additional Area Photos (0/3), and Verification

1. **Side-by-Side Comparison**: Inspect your Before and After watermarked images side by side.
2. **Additional Area Photos (`0/3`)**: To document specific stalls or fixtures (up to 3 extra photos):
   - Tap **+ Add Area**.
   - In the **Select Restroom Area** picker, choose one of the 8 standardized area tags:
     - `Stall 1`
     - `Stall 2`
     - `Urinals`
     - `Sink & Counter`
     - `Mirror`
     - `Floor Drain`
     - `Supplies & Dispensers`
     - `Other Area`
   - Capture the watermarked area photo. Repeat for up to 3 areas total.
3. **Final Remarks & Submit**: Review or edit your remarks, then tap **Submit Completion** (or **Submit Re-inspection** for rechecks).
4. **Closing Warning**: Dismissing the modal mid-workflow triggers a **Discard Progress** confirmation prompt so unsaved progress is not lost unintentionally.

### 3.5 Path B: Quick Inline Workflow via Task Detail Screen

Tapping a card in **Inbox** or tapping **Open Priority Task** opens `TaskDetailScreen`:

1. Monitor the top linear stepper: `Reported` -> `Accepted` -> `Proof & Check` -> `Completed` (or `Submitted` for multi-tech jobs pending teammates).
2. Tap **Accept Recheck** (if `flagged`) or **Acknowledge Task** (if unstarted); if already `acknowledged` or `rechecking`, skip directly to Step 3.
3. Tap **Take Proof Photo** to capture your Before photo. Once captured, the inline screen advances automatically to the checklist step.
4. Complete all 10 items in the inline **SDCA F-TGS 203 Checklist** (using **Check All as Done** or **Reset All Items** as needed) and enter optional **Remarks**.
5. Tap **Take After Photo** in the sticky bottom bar *(blocked with `"Set every checklist item to Done or N/A before proceeding."` until all 10 items are marked `Done` or `N/A`)* to proceed to the summary step, then tap **Submit Completion**.

> **Important Limitations of Path B (`TaskDetailScreen`):**
> 1. **No Additional Area Photo Capture**: Path B does **not** include the **`Additional Area Photos (0/3)`** capture flow. Use Path A (`Active Task`) whenever extra area proofs are needed.
> 2. **No Image Resizing**: Path B saves captured images without resizing to `1080px` width (uses `compress: 0.8` only). On high-megapixel Android cameras, raw photos are larger and carry higher risk of hitting the strict **10 MB** storage upload limit.
> 3. **Team Re-Submission Lock**: Once your personal submission (`isUserSubmitted`) is saved in a multi-technician task, Path B locks inline submission controls and displays **`CHECKLIST SUBMITTED`** or **`TEAMMATE SUBMITTED`** callouts while waiting for teammates.

### 3.6 Photo Rules, Multi-Technician Team Tasks, and Offline Sync

#### Storage & File Constraints

Enforced across both client validation and Firebase Storage security rules (`storage.rules`):

- **Maximum File Size**: Strictly **under 10 MB** (`10 * 1024 * 1024` bytes). Oversized images are rejected.
- **Allowed Formats**: JPEG, PNG, and WebP (`image/jpeg`, `image/jpg`, `image/png`, `image/webp`).
- **Cloud Path & Immutability**: Photos are stored under `tasks/{taskId}/{kind}_{timestamp}.jpg` (where `{kind}` is `before`, `after`, `flag`, `extra`, or `proof`). Deletion of uploaded proof photos is disabled at the storage-rule level (`allow delete: if false`) to preserve audit integrity.

#### Multi-Technician Team Task Behavior

When a supervisor assigns multiple technicians (up to 10) to a single task:

- Each technician's submission (photos, checklist, remarks, timestamp) is recorded independently under `submissions.{uid}`.
- Once you submit your work, your individual availability status resets to `available`, and the detail screen displays **`CHECKLIST SUBMITTED`** alongside teammate status indicators (**`TEAMMATE SUBMITTED`**).
- The overall task status **does not** transition to `completed` (awaiting supervisor QA / `pending_review`) until **every UID** listed in `assignedToIds` has submitted their completion.

#### Offline Synchronization (`offline_tasks`)

If cellular or Wi-Fi connectivity drops—or if an online upload encounters a network error—Klir Mobile queues your work automatically:

1. **UID-Scoped Queue**: Completions and local photo URIs are saved into `offline_tasks`, tagged with your `completedBy` UID. If multiple technicians share the same Android tablet/phone, the sync worker only uploads queued bundles matching the currently signed-in technician's UID.
2. **Automatic Upload**: `OfflineSyncContext` listens continuously for connectivity (`isConnected && isInternetReachable !== false`) and runs automatic sync on login and network restoration, displaying: `"Offline sync complete. N task(s) uploaded."`
3. **Device Care Rule**: Pending completions are persisted under `AsyncStorage` key `offline_tasks` (distinct from the legacy `@klir:offline_completions` key cleared on logout), so queued submissions survive logout tied to your `completedBy` UID. However, logging out suspends auto-sync until that exact UID signs back in (and clears `@klir:tasks*` and `@klir:audit_logs_cache`), and clearing Android app cache/storage or uninstalling destroys the local photo URIs referenced by pending bundles. Always wait for `"Offline sync complete."` before ending your shift or resetting the device.

### 3.7 `History` (`Completed Work`)

The **History** tab provides an auditable record of finished maintenance jobs:

- **Top KPI Summary**: Shows **Tasks Completed**, **Avg Duration**, and **Compliance**.
- **Search & Time Filters**: Filter via **Search completed jobs** or segmented tabs (**Today**, **7 days**, **All**) above **Completed Log (`N`)**.
- **Record Indicators & Thumbnails**: Cards display Before/After thumbnails along with verification badges (**Approved**, **Completed**, **Biometric Verified**, **Offline synced**, `+N areas`, and reassignment provenance **Reassigned by ...**).
- **Read-Only Inspection View**: Tap any History card to open `TaskDetail` in read-only mode, switch between teammate submission tabs in team jobs, and inspect **Additional Area Proofs**.
- **Scope Note**: Although `HistoryScreen` contains badge styles for `Flagged` and `Rechecking`, `TasksContext` excludes active `flagged`, `rechecking`, and `inspectionStatus === 'flagged'` tasks from `History` until re-inspection is completed and resubmitted.

## 4. Facility Supervisor Operating Guide

### 4.1 Supervisor Navigation Architecture

Unlike the Technician interface, the Supervisor workspace uses **stack-based navigation with no bottom tab bar**:

- Your root screen is **Overview** (`SupervisorDashboardScreen`).
- The top-right **Profile Avatar Button** appears only on **Overview**.
- Navigating into **Tasks**, **Team**, **Completed Tasks**, or **Reports & Export** pushes a sub-screen onto the navigation stack with a standard top-left Back button.

### 4.2 `Overview` Dashboard

The supervisor **Overview** screen displays real-time operational health for your facility:

1. **KPI Counters**: Live counts for **Active Tasks** and **Unassigned** tasks requiring dispatch.
2. **Team Availability Pill Bar**: Live breakdown across **Available**, **On Task**, and **Offline** staff counts, filtered to match the supervisor's assigned building.
3. **Navigation Menu**:
   - **Tasks** -> Unassigned, Assigned, and All task dispatch & reassignment queue
   - **Team** -> Live technician availability and current-task monitor
   - **Completed Tasks** -> Protected QA inspection queue *(requires biometric or password verification)*
   - **Reports & Export** -> Compliance KPI reports, PDF print/share, and CSV exports

### 4.3 `Team` Availability Monitor

Tap **Team** from the Overview menu to inspect `TeamAvailabilityScreen`:

- **Filter Chips**: **All**, **Available**, and **On Task**. *(There is no dedicated **Offline** filter chip on this screen; offline staff appear under **All** with an `Offline` status pill, while the **Overview** screen displays live `Offline` counts in the Team Availability pill bar.)*
- **Staff Cards**: Show each technician's name, shift details, assigned building, live operational status (`Available`, `On Task`, or `Offline`), and an active task callout showing what job an `On Task` technician is currently handling.
- **Status Precedence & Presence Accuracy**: `getPersonOperationalStatus` checks active non-completed tasks first (`On Task`) before checking explicit `offline` state or the **2-minute** heartbeat staleness timeout (`60-second` foreground refresh).

### 4.4 `Tasks` Queue and Reassignment Controls

Tap **Tasks** from the Overview menu to manage assignments (`SupervisorTasksScreen` -> `SupervisorTaskDetailScreen`):

#### Filter Tabs & Important `flagged` / `rechecking` Caveat

- **All**: Shows all **active (non-completed)** tasks—including `unassigned`, `reassignment_needed`, `assigned`, `acknowledged`, broadcast, `flagged`, and `rechecking` items. *(Tasks with `status: completed` are excluded here and reviewed under **Completed Tasks**.)*
- **Unassigned**: Shows directly unassigned non-broadcast tasks (`unassigned`) and tasks marked `reassignment_needed`.
- **Assigned**: Shows tasks actively `assigned`, `acknowledged`, or marked as team broadcast.

> **Important `flagged` and `rechecking` Filter Caveat:** Tasks in `flagged` or `rechecking` status appear under the **All** tab (and inside **Completed Tasks**), but they are **NOT** listed under **Unassigned** or **Assigned**. Always check **All** or **Completed Tasks** when tracking open re-inspections.

#### Assignment, Reassignment & Safety Locks

Open any task in `SupervisorTaskDetailScreen` to view details and assign/reassign staff:

1. **Multi-Technician Assignment (Max 10)**: Select one or more active `maintenance`/`technician` accounts using the technician checkboxes. The backend enforces a strict maximum of **10 technicians per task**. Confirming immediately updates squad availability and sends FCM push notifications to every newly assigned technician.
2. **In-Progress Lock (`Reassignment Locked`)**: When a task is actively in progress (`acknowledged` or `rechecking`)—or already `completed`—reassignment is locked. Attempting to submit returns: `"Cannot reassign task: Work is currently in progress on-site by the technician."`
3. **Flagged Task Accountability Lock (`Direct Accountability (ISO 9001 / CAPA)`)**: When a task is `flagged`, reassignment is locked by default so the original technician(s) remain directly accountable for correcting deficiencies.
4. **Supervisor Override for Flagged Tasks**: If the original technician is off-shift or unavailable, toggle **Override & Reassign (Shift Handoff / Technician Unavailable)** and enter a documented reason of at least **5 characters** to unlock reassignment.

### 4.5 `Completed Tasks` and Quality Assurance Review

#### Supervisor Security Gate

Accessing **Completed Tasks** from the Overview menu requires re-authentication to protect QA approvals and audit accountability:

- Devices with enrolled biometrics prompt OS biometric authentication first.
- Fallback or non-biometric devices prompt the **Supervisor Authentication** password modal.

#### Inspection Queue & Detail Review

1. Scan the newest-first submission feed in `CompletedReviewsScreen`, where each card displays a read-only status badge (**Approved**, **Flagged**, **Rechecking**, or **Completed** for submissions pending QA review). *(These labels are display status badges on each card rather than interactive filter tabs.)*
2. Tap a submission to open `CompletedReviewDetailScreen`:
   - **Team Submissions (`N`):** Switch across individual technician tabs when reviewing a multi-technician job.
   - **Zoomable Photo Audit**: Tap any **Before**, **After**, or **Additional Area Proofs** photo to open `ImageViewerModal` (pinch/scroll zoom up to **4x**).
   - **Checklist & Metrics**: Verify all 10 `SDCA F-TGS 203 Checklist` answers, optional remarks, response time, work duration, and the **Biometric Verified** status badge.

#### Action 1: `Approve Task`

Tap **Approve Task** when cleaning quality meets facility standards:

- Sets `inspectionStatus` to `approved` with supervisor attribution and server timestamp.
- Releases any remaining assignee locks and schedules linked public issue report retention cleanup.
- **Routine Maintenance Counter Reset**: If the task is a routine flush-cycle job (`automationTrigger === 'maintenance_due'`), approval atomically resets the restroom device's `devices/{deviceId}/maintenanceCounters/current` (`flushCycleCount` back to `0`) inside the same Firestore transaction.

#### Action 2: `Flag for Re-inspection` / `Update Flag Reason`

Tap **Flag for Re-inspection** (or **Update Flag Reason** if updating an existing flag) when deficiencies remain:

1. Enter a clear deficiency **Flag Reason** of at least **5 characters**.
2. Attach up to **5 optional reference photos** using Camera or Gallery (must comply with the `< 10 MB` image rule).
3. Submit the flag:
   - Sets task status and inspection status to `flagged` and deletes `completedAt`.
   - Clears prior technician `submissions.{uid}` entries so the technician must perform a fresh re-inspection.
   - Dispatches an immediate FCM alert to all assigned technicians (`"Task Flagged for Re-inspection"`).

### 4.6 `Reports & Export`

Open **Reports & Export** (`SupervisorReportsScreen`) to generate management summaries and audit trails:

- **Report Modes**: Switch between **Operations Tasks** and **System Audit Trail**.
- **Time Range Selectors**: **Today**, **This Week**, **This Month**, **This Year**, **All Time**.
- **PDF Export**: Generates an A4/letter operational & compliance KPI PDF report and opens the Android native share/print sheet (`expo-print` + `expo-sharing`).
- **CSV Export**: Generates spreadsheet-safe CSV files (automatically neutralizes CSV formula injection prefixes) and opens the native share sheet.

#### Operations Tasks CSV Schema (20 Columns)

| Col # | Column Header | Col # | Column Header |
| :--- | :--- | :--- | :--- |
| 1 | `Task ID` | 11 | `Biometric Verified` |
| 2 | `Restroom / Location` | 12 | `Inspection Status` |
| 3 | `Floor` | 13 | `Inspected By` |
| 4 | `Building` | 14 | `Inspected At` |
| 5 | `Component` | 15 | `Flag Reason` |
| 6 | `Trigger Type` | 16 | `Recheck Count` |
| 7 | `Technician(s)` | 17 | `Reassign Count` |
| 8 | `Created At` | 18 | `Reassigned By` |
| 9 | `Completed At` | 19 | `Reassignment Reason` |
| 10 | `Work Duration (Seconds)` | 20 | `Remarks` |

#### System Audit Trail CSV Schema (15 Columns)

| Col # | Column Header | Col # | Column Header |
| :--- | :--- | :--- | :--- |
| 1 | `Event ID` | 9 | `Target Entity ID` |
| 2 | `Timestamp (UTC)` | 10 | `Location (Building / Floor / Room)` |
| 3 | `Local Date` | 11 | `Details / Change Summary` |
| 4 | `Local Time` | 12 | `Justification / Reason` |
| 5 | `Actor Name` | 13 | `Response Time (s)` |
| 6 | `Actor Role` | 14 | `Work Duration (s)` |
| 7 | `Event Category` | 15 | `Biometric Verified` |
| 8 | `Action Type` | | |

> **Verified Technical Note on Mobile `auditLogs` Persistence (`v1.24.4`):**  
> Firestore security rules (`firestore.rules`) require client-created `auditLogs` records to include `userUid == request.auth.uid`. Currently, the mobile `audit-logger.ts` utility writes `actorId` without `userUid`, causing client-originated mobile writes to `auditLogs` to be rejected by Firestore rules and fall back to device-local `AsyncStorage` (`@klir:audit_logs_cache`, capped at **300** stored entries and **500** in-memory entries). Furthermore, logging out clears `@klir:audit_logs_cache`. Consequently, mobile **System Audit Trail** exports include server-persisted Firestore `auditLogs` plus only the active device session's local fallback logs until a subsequent patch adds `userUid` alignment.

---

## 5. Quick Troubleshooting and Operational Reference

### 5.1 Technician and Authentication Troubleshooting

| Symptom / Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| **"Access denied. This app is for maintenance and supervisor accounts only."** | Signed in with an `admin` account. | Use the Smart-Flush Web Portal for admin tasks, or sign in with a `maintenance`, `technician`, or `supervisor` account. |
| **Biometrics prompt asks for password instead of logging straight in, or rejects first tap after logout.** | Expected security behavior: `@klir:biometric_vault` stores only email (never passwords) and is wiped on **End Shift & Log Out**. | Type your password once before or immediately after tapping **Unlock with biometrics** (or sign in manually once after an explicit logout to repopulate the vault). |
| **"Open Priority Task" opens `TaskDetail` instead of `Active Task`, and the job is missing from `All`/`Active` lists (while tab counts still include it).** | The first `critical` (or `high`) inbox task is hoisted into the Urgent Priority Card and suppressed from `All` and `Active` card lists to avoid duplicates, while `(N)` badge counts reflect total items. | Tap **Active Task** in the bottom tab bar to run Path A (`TaskExecutionModal`), or continue inline in `TaskDetail` (remembering Path B checklist-before-After-photo flow and limitations). |
| **`Additional Area Photos (0/3)` option is missing.** | You opened the task via Path B (`TaskDetailScreen`) instead of Path A (`Active Task` -> `TaskExecutionModal`). | Switch to the **Active Task** bottom tab and open the guided modal to reach Step 3 (`Additional Area Photos (0/3)`). |
| **Photo upload fails with file-size / upload error.** | Image exceeds the strict **10 MB** Storage limit (more common in Path B, which does not resize to `1080px`). | Always capture photos through Path A (**Active Task** -> `TaskExecutionModal`), which automatically resizes to `1080px` at `0.75` quality. |
| **Multi-technician task stays active after I submitted.** | Another assigned technician in `assignedToIds` has not submitted their individual completion yet. | Check **`CHECKLIST SUBMITTED`** / teammate badges; status transitions to `completed` only once all assigned technicians submit. |
| **Queued offline task did not upload after reconnecting on a shared tablet.** | `offline_tasks` sync is scoped per `completedBy` UID for multi-tech device safety. | Have the technician whose UID submitted the offline task sign in while online so `OfflineSyncContext` can flush their bundle. |

### 5.2 Supervisor and Audit Log Troubleshooting

| Symptom / Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Staff member shows `Offline` even though they signed in earlier.** | App was backgrounded (marking `offline`) or no foreground heartbeat occurred for > **2 minutes**. | Have the technician open Klir Mobile in the foreground; the 60-second heartbeat restores live presence. |
| **Supervisor cannot find a `flagged` or `rechecking` task under `Unassigned` or `Assigned`.** | `SupervisorTasksScreen` intentionally omits `flagged` and `rechecking` tasks from `Unassigned` and `Assigned`. | Check the **All** tab in **Tasks**, or open **Completed Tasks** and locate the card bearing the **Flagged** or **Rechecking** status badge. |
| **Supervisor sees `Reassignment Locked` on a task.** | Either the technician is actively working (`acknowledged` / `rechecking`), or the task is `flagged` under ISO 9001 / CAPA accountability. | Wait if work is actively in progress on-site; for `flagged` tasks requiring handoff, enable **Override & Reassign (Shift Handoff / Technician Unavailable)** with a >=5-character reason. |
| **Mobile-only audit events disappeared from `System Audit Trail` export after logging out.** | Client `auditLogs` writes omit `userUid` required by `firestore.rules`, falling back to `@klir:audit_logs_cache`, which is wiped on logout. | Export the **System Audit Trail** before ending shift if device-only local events are needed, or check server-originated events via the Web Portal. |

### 5.3 System Limits, Thresholds, and Timers

| Parameter / Rule | Verified Limit / Value | Source / Context |
| :--- | :--- | :--- |
| **Role Validation Timeout** | `10 seconds` | `/api/auth/me?platform=mobile` check on sign-in |
| **Logout API Timeout** | `1.5 seconds` (`1500 ms`) | `/api/auth/logout` request before local cache wipe |
| **Foreground Presence Heartbeat** | `60 seconds` (`60,000 ms`) | Active foreground presence refresh interval |
| **Supervisor Offline Threshold** | `> 2 minutes` (`120,000 ms`) | `PRESENCE_TIMEOUT_MS` staleness threshold |
| **Foreground Notification Snackbar** | `7 seconds` (`7,000 ms`) | In-app alert banner with **View** deep link |
| **Checklist Standard** | `10 items` (`SDCA F-TGS 203 Checklist`) | Grouped across Dusting & Prep, Fixtures & Floors, Disinfection & Waste |
| **Additional Area Photos Cap** | `3 photos` (`0/3`) | Path A (`TaskExecutionModal`) Step 3 only, using 8 area tags |
| **Task Photo Storage Limit** | `< 10 MB` (`10 * 1024 * 1024` bytes) | JPEG/PNG/WebP (`storage.rules`), deletion disabled |
| **Path A Photo Optimization** | `1080px` width, `0.75` JPEG quality | Applied to Before, After, and Additional Area photos |
| **Path B Photo Optimization** | Unresized (`[]`), `0.8` JPEG quality | `TaskDetailScreen` inline camera flow |
| **Max Assignees per Task** | `10 technicians` | Enforced server-side by `/api/supervisor/reassign-task` |
| **Minimum Flag / Override Reason** | `5 characters` (trimmed) | Required for supervisor flagging and CAPA reassignment override |
| **Supervisor Flag Reference Photos** | `Up to 5 photos` | Camera or Gallery attachments in `CompletedReviewDetailScreen` |
| **Local Audit Log Cache Cap** | `300` stored / `500` in-memory entries | `@klir:audit_logs_cache` (cleared upon logout) |
