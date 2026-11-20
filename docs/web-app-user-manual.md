# Smart-Flush Web Application User Manual

## Document Control

| Field | Value |
| :--- | :--- |
| Document Title | Smart-Flush Web Application User Manual |
| Application / Version | Smart-Flush Administrator Web Portal (`Klir Admin Web v1.61.0`) |
| Target Audience | Authorized Facility Administrators (`admin` role) |
| Facility Scope | SDCA Annex Building (Pilot Smart Unit `toilet-01` and Campus QR Inventory) |
| Platform Separation | Web Portal: Facility Administration only; Mobile App: Supervisors and Technicians |
| Effective Date | 2026-11-13 |
| Document Status | Operational Release Baseline |

---

## Table of Contents

1. [System Overview and Role Scope](#1-system-overview-and-role-scope)
2. [Access, Authentication, and Session Lifecycle](#2-access-authentication-and-session-lifecycle)
3. [Portal Layout and Sidebar Navigation Map](#3-portal-layout-and-sidebar-navigation-map)
4. [Live Dashboard (`/dashboard`)](#4-live-dashboard-dashboard)
5. [Analytics (`/analytics`)](#5-analytics-analytics)
6. [Alerts Center (`/alerts`)](#6-alerts-center-alerts)
7. [Task Dispatch and Management (`/tasks`)](#7-task-dispatch-and-management-tasks)
8. [Public Issue Report Triage (`/issue-reports`)](#8-public-issue-report-triage-issue-reports)
9. [Configuration, QR Labels, and Automation (`/configuration`)](#9-configuration-qr-labels-and-automation-configuration)
10. [Staff Management (`/staff`)](#10-staff-management-staff)
11. [Exports (`/reports`) and Profile (`/profile`)](#11-exports-reports-and-profile-profile)
12. [Quick Troubleshooting and Reference Table](#12-quick-troubleshooting-and-reference-table)

---

## 1. System Overview and Role Scope

The **Smart-Flush Web Application** (`v1.61.0`) is the centralized facility administration portal for the Smart-Flush automated restroom monitoring, public QR issue intake, maintenance dispatch, and compliance reporting platform at **SDCA Annex Building**.

### 1.1 Platform Role Separation

Access across Smart-Flush software interfaces is strictly partitioned by role:

| Role | Software Platform | Primary Responsibilities |
| :--- | :--- | :--- |
| **Administrator (`admin`)** | **Web Application** (this portal) | Monitor live telemetry and alerts; override lid, pump, and UV actuators; configure hardware thresholds and automation rules; print stall QR labels; review and triage public issue reports; dispatch tasks; provision staff accounts; export operational and QA reports. |
| **Supervisor (`supervisor`)** | Mobile Application | Review submitted field completions; reassign active or flagged tasks; approve or flag completed maintenance work orders. |
| **Technician (`maintenance` / `technician`)** | Mobile Application | Receive push notifications and task assignments; acknowledge tasks; execute physical maintenance on-site; submit completion remarks and photo proof. |
| **Restroom Visitors (Public)** | Public QR Form (`/report/[deviceId]`) | Scan stall or common-area QR codes using any mobile browser (no login required) to submit issue reports with optional live camera photos. |

> **Note:** Supervisors and Technicians cannot sign in to the Web Portal. If a non-administrator account attempts to authenticate through the Web Portal login screen, the system signs the session out immediately and directs the user to the Mobile Application.

### 1.2 Hardware and Facility Coverage

- **Smart Telemetry Unit (`toilet-01`)**: An ESP32-WROOM-32D pilot controller equipped with an HC-SR04 ultrasonic occupancy sensor, YF-S201 hall-effect water flow sensor, servo-actuated toilet lid, flush pump/valve relay, and UV-C sanitation strip relay. Telemetry and remote actuator commands flow over TLS-encrypted MQTT (`HiveMQ`) through the backend `mqtt-listener` service into Firebase Firestore.
- **Campus QR Reporting Inventory**: Across 1st Floor through 4th Floor of the SDCA Annex Building, the facility inventory supports **118 printable QR code labels** (**96** individual toilet stalls across **22** restroom common areas). Report exports consolidate these into **20** facility rows (pilot unit `toilet-01` plus 19 room-level rows).

---

## 2. Access, Authentication, and Session Lifecycle

### 2.1 Entry Routes and Authentication Rules

| Route | Purpose | Key Rules and Behavior |
| :--- | :--- | :--- |
| `/` | Root Landing Route | Automatically redirects authenticated sessions (`auth-token` cookie) to `/dashboard`. Unauthenticated visitors see restroom QR reporting instructions only—there is **no** Administrator login link or button on `/`; Administrators must navigate directly to `/portal-admin/login`. |
| `/portal-admin/login` | Administrator Sign-In | Requires institutional email and password. Client validation checks for at least **8 characters** before submission. After Firebase Authentication succeeds, `/api/auth/me` verifies `role === 'admin'`. Successful login sets a 7-day `auth-token` cookie and routes to `/dashboard`. Generic error wording prevents account enumeration. |
| `/portal-admin/register` | Public Registration (Decommissioned) | Displays **Registration Restricted**. Public self-registration has been retired; new staff accounts are created exclusively by Administrators under **Staff** (`/staff`). Provides **Return to Login**. |
| `/portal-admin/forgot-password` | Password Reset Request | Accepts the user's institutional email and submits a reset request through `/api/auth/password-reset/request` to dispatch a recovery email. |
| `/portal-admin/reset-password` | Password Reset Confirmation | Opened via recovery email containing an `oobCode` query parameter. Enforces a **minimum 12-character** new password and confirmation match before submitting to `/api/auth/password-reset/confirm`. |

> **Password Policy Note:** While `/portal-admin/login` checks for 8 characters to support legacy login entries, `/portal-admin/reset-password` (and backend password validation) enforces a minimum of **12 characters** plus **Have I Been Pwned (HIBP)** k-anonymity breached-password screening (fail-open if HIBP is unreachable), rather than character-class complexity rules. Note also that the `/staff` Web UI modal does **not** include a manual password input field—if the welcome/setup email checkbox is cleared, the server generates a random credential automatically and **Send Password Reset** must be used later so the user can set their own password.

### 2.2 Presence Heartbeat and Signing Out

1. **Automatic 60-Second Presence Heartbeat:** While signed in as an Administrator with an active visible browser tab, the portal automatically transmits a presence heartbeat to `/api/staff/presence` every **60 seconds** and immediately upon returning focus to the browser tab. This keeps your account marked online in Staff Management.
2. **Signing Out:** Click **Sign Out** at the bottom of the left navigation sidebar. Signing out sends an explicit offline status update (`isOnline: false, status: 'offline'`) to `/api/staff/presence`, terminates the Firebase session, removes the `auth-token` cookie, and redirects to `/portal-admin/login`.

---

## 3. Portal Layout and Sidebar Navigation Map

Every authenticated page shares a persistent **left navigation sidebar** (collapsible into a drawer on smaller viewports) and a **top utility bar**.

### 3.1 Sidebar Navigation Map

| Section | Menu Label | Route | Live Badges / Notes |
| :--- | :--- | :--- | :--- |
| **Monitoring** | `Dashboard` | `/dashboard` | Default landing page after sign-in. |
| **Monitoring** | `Analytics` | `/analytics` | Usage, water volume, UV rate, and uptime charts. |
| **Monitoring** | `Alerts` | `/alerts` | Numeric badge displays current `unreadCount` of unacknowledged alerts. |
| **Operations** | `Tasks` | `/tasks` | Numeric badge displays `pendingTasksCount` across pending/unassigned tasks. |
| **Operations** | `Configuration` | `/configuration` | Unit profile, QR generator, sensor/timer tuning, and automation rules. |
| **Operations** | `Staff` | `/staff` | Admin-only staff roster, shifts, and account lifecycle controls. |
| **Operations** | `Issue Reports` | `/issue-reports` | Admin-only queue; badge displays count of `pending_review` reports (polled every 30 seconds). |
| **Operations** | `Exports` | `/reports` | Operational CSV/JSON/PDF report downloads and printouts. |
| **Footer** | Profile Card | `/profile` | Displays administrator name/role; opens Account and Profile Settings. |
| **Footer** | `Sign Out` | Action button | Ends session and sets presence to `offline`. |

### 3.2 Top Utility Header Controls

- **Active Alerts Pill (`{unreadCount} Active Alert(s)`):** Click to navigate directly to `/alerts`.
- **Theme Toggle (`Light` / `Dark`):** Switches interface appearance between light and dark display modes.
- **Notifications Bell Dropdown:** Displays up to the **5 most recent alerts** with quick preview details and a **View All System Alerts** link to `/alerts`.

---

## 4. Live Dashboard (`/dashboard`)

The **System Overview** screen (`/dashboard`) provides real-time telemetry for the pilot hardware unit (`toilet-01`), recent event history, and direct actuator override controls.

### 4.1 Priority Alert Callout Banner

When one or more unacknowledged alerts with **critical** or **high** severity exist in Firestore, a Priority Alert Callout banner appears at the top of the Dashboard. Click **Review Alert** to jump immediately to `/alerts`.

### 4.2 Four Live Metric Cards

| Metric Card | Value Displayed | Live Conditions and Threshold Logic |
| :--- | :--- | :--- |
| **Stall Occupancy** | Distance in `cm` (valid when `> 0`) | Shows badge **Occupied**, **Vacant**, or **Standby**, along with a `0 cm` to `100 cm+` visual scale. Note: the Dashboard visual card displays `Occupied` using a hardcoded UI threshold of `<= 30 cm` (`Detection Range: 30 cm`), even if a custom range is saved on `/configuration`. |
| **Water Flow** | Rate in `L/min` | Displays **Water Flowing** when flow rate exceeds `0.05 L/min`, otherwise **No Flow** (or **No Signal** when offline). Visual scale spans `0.0 L/min` to `10.0 L/min` (`Max Flow: 10.0 L/min`). |
| **Device Connection** | **Online** or **Offline** | Evaluates whether the ESP32 heartbeat arrived within the **90-second** API timeout window (`DEVICE_HEARTBEAT_TIMEOUT_MS = 90s`). Displays `Last signal: Xs ago` and `{percent}% Signal` (`100%` when `<= 3s`, tapering down to `15%` at `>= 20s`, `0%` when offline). |
| **Current Mode** | Operational state | Derives unit phase from live telemetry: **Standby** (`Ready`, 20%), **Lid Open** (`User Present`, 50%), **Flushing** (`Cleaning`, 80%), **UV Sanitizing** (`Disinfecting`, 100%), or **Offline** (`No Signal`). |

### 4.3 Activity Feed

Located in the left column on desktop (`Activity Feed` with `{events.length} events` pill), this scrollable stream logs the latest device events:
- **Flush Completed** (`Flush`)
- **UV Cleaning Completed** (`Disinfection`)
- **Restroom Activity Detected** (`Sensor`)
- **System Activity** (`Event`)

Each entry includes relative timing and an exact `HH:mm:ss` timestamp.

### 4.4 Restroom Device Controls (Manual Hardware Override)

Located in the right panel on desktop (`Restroom Device Controls`), displaying **Online/Offline** status, **Manual Override** status, and an **Offline Safety Lockout Banner** (`Controls Temporarily Locked`) whenever the unit is offline (except in non-production presentation mode).

| Control Button | Modal / Flow | Behavior and Firmware Safety Rules |
| :--- | :--- | :--- |
| **Open Lid** (`Lift Lid`) | Direct `POST /api/actuators/lid/open` | Opens servo lid (`0 deg`) and activates `manualLidOverride` in ESP32 firmware, temporarily suspending automatic departure flushing until the lid is closed. |
| **Close Lid** (`Lower Lid`) | Direct `POST /api/actuators/lid/close` | Closes servo lid (`180 deg`), clears `manualLidOverride`, and returns controller state to `STANDBY`. |
| **Run Flush (6s)** (`Manual Flush`) | Opens **Confirm Manual Flush** modal (`Flush Valve & Water Pump`, `6.0 seconds`, `~4.2 Liters`) | Dispatches `POST /api/actuators/pump` (`command: 'ON'`). During the cycle, the control changes to **Stop Flush Cycle** (`Stop Flush`), allowing an emergency halt (`command: 'OFF'`). **UI Timer Caveat:** The modal copy (`6.0 seconds` / `~4.2 Liters`) and the `6,000 ms` (`6-second`) button reset timer are hardcoded in the Web UI regardless of saved `/configuration` `pumpDuration` (`8s` UI default, `1–30s` range, `3s` ESP32 boot default). |
| **Start UV Clean (45s)** (`UV Disinfection`) | Direct toggle `POST /api/actuators/uv` (`ON` / `OFF`) | For eye and skin safety, the ESP32 firmware automatically closes the lid before turning ON the UV-C relay. While toggled on in the Web UI, the label changes to **Disinfection Active** / **Stop UV Clean**. **UI Toggle Caveat:** In the Web UI, this button is an un-timed toggle that remains active until clicked again or Reset, whereas ESP32 hardware shuts UV off automatically after the configured `uvDuration` (`45s` UI default, `10–120s` range, `5s` firmware boot default). |
| **Restart Restroom Unit** (`System Restart`) | Opens **Confirm Hardware Restart** modal | Requires checking the mandatory acknowledgment box (`"I understand all active cycles will stop and the unit will restart."`) and clicking **Restart System** (`POST /api/actuators/reset`), alerting that telemetry may drop for `5–10 seconds`. |

> **Important Firmware & Connectivity Caveats:**
> 1. **Heartbeat Requirement:** Manual controls unlock only when the unit heartbeat is fresh within **90 seconds** in the Web Portal (`60 seconds` in the MQTT listener offline watchdog).
> 2. **Remote Restart Limitation (`toilet/commands/reset`):** Verified inspection of the ESP32 firmware (`smart_flush_esp32.ino`) shows the controller currently subscribes to `toilet/commands/pump`, `toilet/commands/uv`, `toilet/commands/lid`, and `toilet/commands/config`, and does **not** yet subscribe to `toilet/commands/reset`. Consequently, if the ESP32 microcontroller becomes unresponsive or frozen, clicking **Restart Restroom Unit** will not reboot the board—an operator must physically power-cycle the unit.
> 3. **Firmware Safety Interlock:** The ESP32 firmware rejects remote `OPEN` / `ON` actuator commands—and emits a `warning` alert on `toilet/alerts/hardware`—whenever the stall state (`currentState`) is not `STANDBY` or a user is detected within `DETECTION_THRESHOLD_CM`.

---

## 5. Analytics (`/analytics`)

Navigate to **Analytics** (`/analytics`) to inspect usage, conservation, sanitation performance, and hardware uptime over selectable time windows.

### 5.1 Timeframe Selection

Use the segmented timeframe control at the top of **Restroom Analytics** to switch between:
- **Today** (current day only)
- **7 Days** (default rolling 7-day view)
- **30 Days** (rolling 30-day view)

Selections synchronize with the URL query parameters (`?from=...&to=...`) so filtered views can be bookmarked or shared.

### 5.2 Key Performance Indicators (5 Cards)

1. **Total Flushes:** Cumulative completed flush cycles within the timeframe.
2. **Water Used:** Cumulative water consumption in Liters (`L`).
3. **UV Cleaning Rate:** Percentage of UV cycles completed cleanly, with `completed/total cycles` subtext.
4. **Avg Flushes/Day:** Daily flush average across the active range.
5. **System Reliability:** Measured uptime percentage (`Online: X% · Target: 99.5%`).

### 5.3 Interactive Charts (5 Visualizations)

1. **Flush Count per Day** (Area Chart): Daily trend of completed flushes.
2. **Water Usage per Day** (Bar Chart): Daily total water volume in Liters (`L`).
3. **Hourly Activity Distribution** (Full-width Area Chart): Peak restroom hours by flush volume.
4. **UV Cleaning Performance** (Donut Chart): Completed versus failed/aborted UV disinfection cycles, centered on the overall Success Rate percentage.
5. **Daily System Reliability** (Bar Chart, `0–100%`): Daily online percentage plotted against a horizontal `Target (99.5%)` reference benchmark.

---

## 6. Alerts Center (`/alerts`)

The **System Alerts** page (`/alerts`) consolidates persistent hardware/automation alerts from Firestore alongside real-time overdue task warnings.

### 6.1 Alert Sources

1. **Firestore System Alerts (Persistent across sessions):**
   - **Device Offline Watchdog:** The `mqtt-listener` service checks device activity every **30 seconds**; if no MQTT messages arrive for **60 seconds**, it marks the device `offline` in Firestore and creates a `device_offline` alert.
   - **Hardware Maintenance Wear Counters:** Automatically generated when cumulative component counters reach preventive maintenance limits:
     - UV-C strip runtime: `1,080,000 seconds` (**300 hours**)
     - Lid servo actuations: **10,000 cycles**
     - Water flow sensor total volume: **500 Liters**
     - Flush pump total volume: **500 Liters**
     - Ultrasonic sensor consecutive failures: **10 consecutive fails**
     - Relay switching triggers: **10,000 triggers**
   - **Automation Rule Alerts:** The `mqtt-listener` automation engine writes a `medium`-severity Firestore alert **only** when an enabled rule configured to dispatch a task (**Send Task to Available Maintenance** or **Create Maintenance Ticket**) triggers and dispatches a work order. Standalone telemetry threshold alerts are not evaluated outside task-dispatching rules, and rules set to **Send Warning Email** or **Disable Subsystem** emit neither a task nor a Firestore alert.
2. **Overdue Task Alerts (Client-Generated):**
   - The portal checks up to the 50 most recent tasks every **60 seconds**. Any task remaining in `pending`, `unassigned`, `assigned`, or `reassignment_needed` status for longer than **30 minutes** (`OVERDUE_TASK_THRESHOLD_MS = 30 min`) generates an overdue task alert card.

### 6.2 Filtering and Alert Actions

| Control | Function |
| :--- | :--- |
| Filter Tabs | Switch between **All Alerts**, **Critical & High**, **Unread**, and **Tasks**. |
| Unread Badge / **Mark All as Read** | Shows active unread alert count; **Mark All as Read** bulk-acknowledges unread Firestore alerts and marks current task warnings viewed. |
| **Acknowledge** | Appears on unacknowledged Firestore system alerts; writes acknowledgment state to Firestore for all administrators. |
| **View Task** | Appears on overdue task alert cards; opens `/tasks?taskId=...` directly to that work order and records the alert as viewed. |
| **Dismiss Alert** (`X`) | On an unacknowledged **Firestore system alert**, runs `handleAcknowledge` and persists acknowledgment to Firestore for all administrators; on a client-generated **overdue task alert**, hides it locally in `localStorage`. |

> **Persistence Caveat:** Acknowledging—or clicking **Dismiss Alert (`X`)** on—a Firestore system alert persists across all administrator browsers and sessions. However, dismissing or viewing client-generated **overdue task alerts** is stored locally in the current browser's `localStorage` (`@smartflush` viewed-alerts storage); if you switch browsers or clear site data, overdue task alerts for still-open tasks over 30 minutes old will reappear.

---

## 7. Task Dispatch and Management (`/tasks`)

The **Maintenance Task Operations** console (`/tasks`) enables Administrators to create, monitor, filter, edit (within role rules), and delete restroom maintenance work orders.

### 7.1 Status Summary, Filters, and Search

- **Live Header Counts:** Displays `Pending`, `Ack` (acknowledged), `Done` (completed), and optional `Flagged` badges alongside a **Refresh tasks** button and **Dispatch Task** button.
- **Filter Tabs:**
  - **All:** Every task record.
  - **Pending:** Groups tasks awaiting technician completion, including `pending`, `unassigned`, `assigned`, and `reassignment_needed` statuses (excluding flagged records).
  - **Acknowledged:** Tasks actively acknowledged by a technician on mobile.
  - **Completed:** Finished tasks submitted from the field.
  - **Flagged:** Tasks marked `flagged`, `rechecking`, or `inspectionStatus === 'flagged'` by a Supervisor.
- **Search Input:** Filters visible tasks by location, device ID, ticket reference code, instructions, or assignee name.

### 7.2 Dispatching a New Task

1. Click **Dispatch Task** to open the **Dispatch Maintenance Task** slide-over drawer.
2. Select **Toilet Unit Target** (smart unit or campus stall/room).
3. Choose **Task Priority & Category**:
   - `Standard Request (Manual Dispatch)`
   - `Scheduled Maintenance (High Priority)`
   - `High Usage / Frequent Flush Check`
   - `Sanitation & UV Inspection`
4. Enter **Task Instructions** (maximum **500 characters**).
5. Under **Assign To Personnel**, choose either **All Maintenance Team (Broadcast)** or check specific maintenance technicians.
   - *Note:* Selecting every available technician automatically normalizes the task to a Broadcast (`[]`) assignment.
6. Click **Create & Dispatch** to send push notifications and create the work order.

### 7.3 Reviewing, Editing, and Deleting Tasks

Each task card shows the restroom location, trigger badge (manual, automation rule, or public report), status badge (including **Unassigned — supervisor action required** when `status === 'unassigned'` and `requiresSupervisorAssignment === true`), ticket code/category, flagged reason and inspector name (if flagged), assigned staff, and chronological lifecycle timeline.

- **Delete Task:** Removes the task record (for cleanup or duplicate removal).
- **Edit / Assign Rules (Important Caveat):**
  - The Web UI **Edit** / **Assign** action only opens and allows modification for tasks currently in **`pending`** status or supervisor-escalated **`unassigned`** tasks (`requiresSupervisorAssignment === true`).
  - If a task is already **`assigned`**, standard `unassigned`, or **`reassignment_needed`**, clicking **Edit** / **Assign** in the Web Portal is blocked with the message: *"Only pending tasks and supervisor-only unassigned tasks can be edited."* Those tasks must be reassigned by a **Supervisor** using the **Smart-Flush Mobile App**.

---

## 8. Public Issue Report Triage (`/issue-reports`)

The **Issue Reports** queue (`/issue-reports`) is an Administrator-only moderation board for reports submitted by restroom visitors who scan stall or common-area QR codes.

### 8.1 Queue Tabs and Real-Time Refresh

- **Three Status Tabs:** **Pending** (`pending_review`), **Confirmed** (`confirmed`), and **Dismissed** (`dismissed`).
- The queue prefetches tabs and **auto-refreshes every 10 seconds** while open.

### 8.2 Ticket Aggregation and Urgency Escalation

When multiple visitors report issues on the same stall or common area while a ticket is still in `pending_review`, submissions merge into the single open ticket (`Ticket #{ticketCode}`) rather than flooding the queue:

| Confirmation Count | Displayed Urgency | Queue Behavior |
| :--- | :--- | :--- |
| `1` confirmation | **Normal** | Initial report logged with reporter category and optional evidence. |
| `2` confirmations | **Medium** | Categories merge; latest timestamp updates; urgency escalates. |
| `3` or more confirmations | **High** | Escalated priority indicator for rapid administrator action. |

### 8.3 Reviewing Evidence and Taking Action

Each card summarizes:
- **Triad Metrics:** `Ticket #`, `Urgency`, and `Confirmations`.
- **Timeline:** `Reported` / `First report` and `Latest confirmation`.
- **User Description(s):** Concatenated visitor remarks.
- **Evidence & Submissions:** Indicates `Photo captured` or `Submitted without photo`. Clicking **View Photo (X KB)** fetches the image securely via a Bearer-authenticated proxy (`/api/issue-reports/{id}/evidence/{submissionId}` with `cache: 'no-store'`) and opens it in a new browser tab. Direct unauthenticated GCS/Storage access to evidence images is blocked by storage rules.

Available moderation actions on **Pending** tickets:
1. **Dismiss:** Marks the report as `dismissed` (`unable_to_verify`) and schedules stored evidence photos for retention expiration.
2. **Confirm and create task:** Transitions the ticket to `confirmed`, creates a linked maintenance task, and replaces the action bar with a **View Task** button linking to `/tasks?taskId=...`.

### 8.4 How Public QR Reporting (`/report/[deviceId]`) Interacts with Admin Triage

Administrators should understand the public intake behavior behind incoming tickets:
- **Supported Categories:**
  - *Toilet Stalls:* Categories (`blockage_or_dirty`, `continuous_leak`, `no_water`, `lid_malfunction`, `physical_damage`, `other`), where `continuous_leak` displays to visitors as **Continuous leak or bidet running**. For smart hardware unit **`toilet-01`** only, visitors also see **`uv_light_failure`** (**UV light failure**).
  - *Common Areas:* Room-appropriate issue categories for sinks, faucets (**Sink faucet leaking or running** for `continuous_leak`), floors, mirrors, dispensers, or general hazards (falling back to **Continuous leak** for generic `continuous_leak`).
- **Priority Leak Notification (`continuous_leak`):** Selecting **Continuous leak or bidet running** (stalls) or **Sink faucet leaking or running** (common areas) enqueues a priority administrator notification outbox alert immediately (throttled to a 10-minute cooldown per open ticket).
- **Anti-Spam and Rate Limits:** Public submissions enforce a hidden honeypot field (`website`), a minimum **3-second** completion timer (`startedAt`), magic-byte image validation (max **5 MB**; `JPEG`, `PNG`, or `WebP` only), at most **5 accepted reports per 15 minutes** per hashed client IP fingerprint, and a **10-minute (`600s`) per-device cooldown** (returning `HTTP 429` with `Retry-After: 600` if repeated too quickly).

---

## 9. Configuration, QR Labels, and Automation (`/configuration`)

The **Configuration** console (`/configuration`) governs unit metadata, public QR reporting, sensor/timer thresholds, and automated dispatch rules. Whenever any setting is edited without saving, a sticky **Unsaved Configuration Changes** banner reminds you to commit changes.

### 9.1 Restroom Unit Information

- Displays read-only hardware metadata: **Device ID** (`toilet-01`), **Cloud Connection** status, **Controller Model** (`ESP32-WROOM-32D`), and **Connected Sensors** (`Occupancy Sensor & Water Flow Meter`).
- Editable fields: **Unit Display Name** (default `"Men's Restroom - Stall 1"`) and **Assigned Facility Location**:
  - Building is fixed to `SDCA Annex Building`.
  - Select **Building Floor** (`1st Floor`–`4th Floor`) and **Restroom / Zone Location**.
- Click **Save Unit Profile** to apply.
- **Step-Up Authentication Caveat:** Changing **Building Floor** or **Restroom / Zone Location** triggers the **Confirm Location Reassignment** modal, requiring you to re-enter your current Administrator password (`reauthenticateWithCredential`) before Firestore is updated.

### 9.2 Public Issue Reporting and QR Label Printing

1. **Public issue reporting (`Enabled` checkbox):** Enables or disables `/report/toilet-01` acceptance globally for this smart unit.
2. **Download printable PNG label:** Generates and downloads a single **`900 x 1150` px** high-resolution printable PNG placard for the configured unit.
3. **Campus Batch Print (All Stalls):** Opens the **Campus Batch QR Generator (SDCA Annex)** modal covering all **118 QR cards** (**96 Stalls + 22 Common Areas** across `1F–4F`):
   - Filter by **Floor** (`All Floors`, `1st Floor (1F)`, `2nd Floor (2F)`, `3rd Floor (3F)`, `4th Floor (4F)`).
   - Filter by **Type** (`All Types`, `Stalls Only`, `Common Areas Only`).
   - Click **Print Sheet / Save PDF** to print formatted multi-card QR sheets or export them via browser PDF print.

### 9.3 User Detection Range

- Adjust the ultrasonic threshold slider between **`10 cm` and `100 cm`** (default **`30 cm`**).
- Compare against the **Live Sensor Reading** panel (`Person Detected`, `Stall Vacant`, or `Awaiting Signal`) before clicking **Save Detection Range**.
- Saving publishes the updated `threshold` to the ESP32 via MQTT `toilet/commands/config`. *(Reminder: Dashboard `StatCards` visually continues using `<= 30 cm` for its own occupancy badge display.)*

### 9.4 Flush and Cleaning Timers

| Timer Setting | Allowed UI Range | Default UI Value | Hardware / Firmware Behavior |
| :--- | :--- | :--- | :--- |
| **Flush Duration** | `1–30 seconds` | `8 s` | Published via MQTT `toilet/commands/config` as `pumpDuration`; applied immediately on the ESP32 controller. |
| **UV Cleaning Duration** | `10–120 seconds` | `45 s` | Published via MQTT `toilet/commands/config` as `uvDuration`; applied immediately on the ESP32 controller. |
| **Departure Delay** | `1–10 seconds` | `3 s` | **Verified Firmware Caveat:** `smart_flush_esp32.ino` currently processes `pumpDuration`, `uvDuration`, and `threshold` from `toilet/commands/config` only. `PERSON_GONE_CONFIRM_MS` (departure delay) remains fixed at **3 seconds (`3000 ms`)** inside the ESP32 firmware regardless of Web UI changes. |

Click **Save Timers** to store and broadcast configuration updates.

### 9.5 Automatic Alerts and Rules

Switch between the **System Alerts** tab and the **Maintenance Rules** tab, or click **Add Rule** to define automated thresholds.

| Trigger Condition | Group | Parameter Bounds & Defaults | Runtime Behavior |
| :--- | :--- | :--- | :--- |
| `ultrasonic_sensor_fault` | `system_alert` | Invalid reading duration: `5–60s` (default `10s`) | Fires when invalid distances (`<= 0` or `> 400 cm`) persist while device heartbeat is fresh (`<= 60s`). |
| `water_overuse` | `system_alert` | Water volume limit: `> 0 L` | Fires when a completed flush volume exceeds the configured liter threshold. |
| `no_water_after_flush` | `system_alert` | Consecutive dry cycles: `1–20` (default `2`) + **Water wait time**: `5–30s` (default `8s`) | Fires if consecutive pump cycles complete without positive flow within the wait window. |
| `maintenance_due` | `maintenance` | Completed flush cycles: `1–100,000` (default `200`) | Fires **Routine Toilet Check** after every N completed flush cycles; includes **Reset Trigger Counter** icon on rule row. |

Each rule modal configures:
- **Rule Name**, **Trigger Condition**, **Threshold** (plus **Water wait time** for dry-cycle rules), **Repeat interval** (`1 minute`, `10 minutes`, or `Custom` integer between `1` and `1440` minutes), and **Action to Trigger**.
- Row controls include **Reset Trigger Counter** (for `maintenance` rules), **Edit Rule**, **Active/Disabled** toggle switch, and **Delete Rule**.

> **Verified Action Execution Caveat:** Although the Action dropdown presents `'Send Warning Email'`, `'Disable Subsystem'`, and `'Send Task to Available Maintenance'`, the backend automation engine (`mqtt-listener/src/automation-engine.ts`) only dispatches actions matching `'Send Task to Available Maintenance'` (and its legacy alias `'Create Maintenance Ticket'`). Selecting `'Send Warning Email'` or `'Disable Subsystem'` saves the rule configuration in Firestore but is **non-operational** at runtime (no emails are sent and subsystems are not disabled).

---

## 10. Staff Management (`/staff`)

The **Facility Staff Management** screen (`/staff`) is restricted to Administrators. It displays live roster presence (silently refreshed every **30 seconds**, with a manual **Refresh Roster** button) and manages technician, supervisor, and administrator accounts.

### 10.1 Roster Overview and Filtering

- **4 KPI Cards:** `Total Staff`, `Supervisors`, `Technicians`, and `Currently Available`.
- **Filters:** Text search (name or email), Role filter (`All Roles`, `Supervisors`, `Technicians`, `Administrators`), and Activity tabs (`All Staff`, `Working on Tasks`, `Available`).
- **Staff Table Columns:** `Team Member` (shows online/offline presence dot), `Role`, `Facility & Shift`, `Current Activity` (`Deactivated`, `On Task #...`, `Available`, or `Off Duty / Offline`), and `Actions` (`...` menu).

### 10.2 Provisioning a New Staff Member (2-Step Workflow)

1. Click **Add Staff Member** to open **Provision New Staff Member** (Step 1).
2. Complete the required fields:
   - **Full Name:** Minimum **2 characters**.
   - **Institutional Email:** Valid email format.
   - **Role:** `Technician`, `Supervisor`, or `Administrator`.
   - **Assigned Facility:** Read-only (`SDCA Annex Building`).
   - **Assigned Shift:**
     - `1st Shift (06:00 - 14:00)`
     - `2nd Shift (14:00 - 22:00)`
     - `3rd Shift (22:00 - 06:00)`
   - **Password Setup:** By default, **Send Welcome & Password Setup Link to employee email upon provisioning** is checked. Note that the `/staff` Web UI modal does **not** render a manual password input field: if you uncheck this option, `POST /api/staff` skips the email and automatically assigns a strong random credential (`crypto.randomBytes` + `'!A9'`), requiring an Administrator to click **Send Password Reset** in the `...` row menu later so the user can choose a password. (User-entered passwords—such as on `/portal-admin/reset-password` or direct API calls—must be at least **12 characters** and pass HIBP breached-password verification, without character-class complexity rules.)
3. Click **Review & Continue** to open **Confirm New Team Member** (Step 2), then click **Confirm & Create Account** to finalize provisioning.

### 10.3 Editing, Password Resets, and Account Deactivation

Open the **`...`** row menu for any team member:
- **Edit Assignment:** Allows updating the **Assigned Shift** only (`1st`, `2nd`, or `3rd`). Both **Role** (immutable/locked after creation) and **Assigned Facility** (`SDCA Annex Building`) cannot be changed from this modal.
- **Send Password Reset:** Dispatches a Firebase password reset link to the member's email.
- **Deactivate Account / Reactivate Account:**
  - *Restrictions:* Administrators cannot deactivate their own account or any `admin`-role account.
  - **Deactivate Account** requires **Step-Up Authentication** (enter your current Administrator password to confirm) before disabling access.
  - **Reactivate Account** restores a deactivated supervisor or technician account directly.

---

## 11. Exports (`/reports`) and Profile (`/profile`)

### 11.1 Restroom Reports and Downloads (`/reports`)

The **Restroom Reports & Downloads** module provides compliance exports, formal print layouts, and a directory of reportable facility units.

#### Report Types and Date Controls

| Report Type | Key | Date Input Mode | Formats Supported |
| :--- | :--- | :--- | :--- |
| **Daily Restroom Activity** | `daily` | Single date selector | `PDF`, `CSV`, `JSON`, **Print report** |
| **Restroom Usage & Water Report** | `usage_summary` | Range preset or custom range | `PDF`, `CSV`, `JSON`, **Print report** |
| **Cleaning & Maintenance Tasks** | `maintenance_tasks` | Range preset or custom range | `PDF`, `CSV` *(client-generated)*, `JSON`, **Print report** |
| **Supervisor Inspections** | `supervisor_audit` | Range preset or custom range | `PDF`, `CSV` *(client-generated)*, `JSON`, **Print report** |

- **Date Range Presets (non-daily reports):** `Last 7 Days`, `Last 30 Days`, `This Month`, `Last Month`, or **Custom Date Range** (explicit start and end dates).
- **Generating Exports:** Click **Generate & Download** for the chosen format (`PDF`, `CSV`, or `JSON`), or click **Print report** to produce a formatted document containing the **Print Report Header** and a formal 3-column sign-off footer:
  1. `Prepared By (Operations / Tech)`
  2. `Inspected By (QA Supervisor)`
  3. `Approved By (Facility Director)`
- **Recent Downloads:** The **Recent Downloads** table tracks exports generated during the current browser session (`sessionStorage` key `@smartflush:recent_downloads`) with quick **Download Again** links. Closing the browser tab or session clears this history.
- **Facility Directory Count Note:** The `/reports` unit selector directory (`DEVICE_FACILITY_DIRECTORY`) lists **20 consolidated facility rows** (`toilet-01` `"SDCA Smart Flush Pilot Unit"` on `1st Floor (Testing Lab / Pilot Bench)` plus **19** room-level entries, where 2F, 3F, and 4F accessible restrooms are grouped into `SDCA-FL2-PWD`, `SDCA-FL3-PWD`, and `SDCA-FL4-PWD`), whereas **Campus Batch Print** on `/configuration` generates **118** individual stall and common-area QR labels (**96** stalls + **22** common areas across 22 rooms).

### 11.2 Account and Profile Settings (`/profile`)

Open `/profile` from the sidebar footer card to view:
- **Account Summary:** Initials avatar, display name, institutional email, `Admin` role badge, and application build version badge (`Klir Admin Web • v1.61.0`).
- **Notification Preferences:** Independent switches for **Critical System Alerts** and **High-Priority Dispatches** with immediate **Saved** confirmation feedback.

---

## 12. Quick Troubleshooting and Reference Table

| Symptom or Scenario | Verified Root Cause | Recommended Administrator Action |
| :--- | :--- | :--- |
| Dashboard controls locked (`Controls Temporarily Locked` / **Offline**) | ESP32 heartbeat older than **90 seconds** in Web API (or **60 seconds** in `mqtt-listener` watchdog). | Verify facility Wi-Fi/power on unit `toilet-01`, confirm `mqtt-listener` service is running, and wait for a fresh heartbeat. |
| **Restart Restroom Unit** modal completes, but ESP32 does not reboot | `smart_flush_esp32.ino` subscribes to `pump`, `uv`, `lid`, and `config` commands only—it does not yet subscribe to `toilet/commands/reset`. | Physically disconnect and restore power at the smart restroom control box if the ESP32 controller is frozen. |
| Clicking **Edit** / **Assign** on a task fails with *"Only pending tasks and supervisor-only unassigned tasks can be edited."* | Web Portal intentionally permits editing only for `pending` tasks or supervisor-escalated `unassigned` (`requiresSupervisorAssignment`) records. | Have a **Supervisor** open the **Smart-Flush Mobile App** to reassign `assigned`, standard `unassigned`, or `reassignment_needed` tasks. |
| Dismissed **overdue task alert** (> 30 min) reappears on a different PC/browser | Overdue task dismissals are stored per browser in `localStorage`, unlike Firestore system alert acknowledgments. | Acknowledge or resolve the underlying task in `/tasks`, or dismiss it locally on that workstation. |
| Saving **Departure Delay** (`1–10s`) on `/configuration` does not change physical wait time | `PERSON_GONE_CONFIRM_MS` is fixed at **`3000 ms` (3 seconds)** in `smart_flush_esp32.ino`. | Expect a 3-second departure confirmation delay on hardware unless firmware is updated and reflashed. |
| Automation rule set to **Send Warning Email** or **Disable Subsystem** takes no action | `mqtt-listener` automation engine only executes tasks (and emits `medium` alerts) for **Send Task to Available Maintenance** / **Create Maintenance Ticket**; other actions emit neither a task nor an alert. | Set automation rule actions to **Send Task to Available Maintenance** and rely on push/alerts for notifications. |
| **Confirm Manual Flush** always shows `6.0 seconds` / `~4.2 Liters`, or **Disinfection Active** never auto-clears in UI | `ControlPanel` hardcodes the manual flush modal text (`6.0s`) and `6,000 ms` button reset, while **Start UV Clean (45s)** is an un-timed UI toggle even though hardware obeys saved `pumpDuration` / `uvDuration`. | Allow hardware cycle to finish, or click **Stop UV Clean** manually to reset the UI toggle state if needed. |
| Remote **Open Lid**, **Run Flush**, or **Start UV Clean** command fails to actuate on hardware | ESP32 firmware safety interlock rejects `OPEN` / `ON` commands (sending a `warning` hardware alert) while `currentState != STANDBY` or a person is within `DETECTION_THRESHOLD_CM`. | Wait until the stall returns to `STANDBY` and is unoccupied before sending remote actuator commands. |
| Visitors receive `HTTP 429` error scanning/submitting public QR issue reports | Client exceeded **5 accepted reports per 15 minutes** or triggered the **10-minute (`600s`) per-device cooldown** from the same IP fingerprint. | Advise visitors to wait 10 minutes before resubmitting for the same stall, or add multiple observations to a single report (`max 500 chars` + 1 photo `<= 5 MB`). |
| Supervisor or Technician sees an access error at `/portal-admin/login` | Web Portal strictly requires `role === 'admin'`; staff credentials are rejected and signed out. | Instruct Supervisors and Technicians to sign in via the **Smart-Flush Mobile App**. |
| Session **Recent Downloads** list on `/reports` is empty after reopening browser | `Recent Downloads` is stored in tab `sessionStorage`, not permanent database storage. | Regenerate the needed `PDF`, `CSV`, or `JSON` export and save the file to your workstation or facility drive. |
