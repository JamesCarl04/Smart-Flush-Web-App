# Smart-Flush (Klir) — System Architecture, End-to-End Flow & Implementation Overview

> **Audience Note:** This document is written in plain business language for non-technical reviewers, school administrators, and facility stakeholders evaluating how the Smart-Flush (Klir) ecosystem operates when deployed at **St. Dominic College of Asia (SDCA) — Annex Building**.

---

## Document Control

| Field | Detail |
| :--- | :--- |
| **Document Title** | Smart-Flush (Klir) — Overall System Flow & Implementation Overview |
| **Target Audience** | Campus Executives, Facility Managers, Supervisors, and Non-Technical Reviewers |
| **Covered Systems** | Smart Stall Hardware, 24/7 Cloud Relay & Database, Administrator Web Portal, Staff Mobile App, Visitor QR Reporting |
| **Campus Deployment Model** | SDCA Annex Building (1st to 4th Floors): 1 Smart Pilot Unit + 118 Campus Batch QR Locations (22 Rooms) |
| **Companion Manuals** | Document 1: Administrator Web Portal User Manual; Document 2: Maintenance & Supervisor Mobile App User Manual |
| **Document Status** | Baseline Implementation Review (Plain-Language Architecture & Pre-Rollout Audit) |

---

## Table of Contents

- [1. Executive Summary & What Is Being Implemented](#1-executive-summary--what-is-being-implemented)
- [2. Campus Scope & Who Uses the System](#2-campus-scope--who-uses-the-system)
  - [2.1 Smart Pilot Hardware vs. Campus-Wide QR Coverage](#21-smart-pilot-hardware-vs-campus-wide-qr-coverage)
  - [2.2 The Three Human User Groups](#22-the-three-human-user-groups)
- [3. How the Four Parts Connect (Plain-Language Architecture)](#3-how-the-four-parts-connect-plain-language-architecture)
  - [3.1 Closed-Loop Connected System Diagram](#31-closed-loop-connected-system-diagram)
  - [3.2 Part 1 — Smart Restroom Hardware (In-Stall Unit)](#32-part-1--smart-restroom-hardware-in-stall-unit)
  - [3.3 Part 2 — 24/7 Cloud Bridge & Automation Engine](#33-part-2--247-cloud-bridge--automation-engine)
  - [3.4 Part 3 — Shared Cloud Records & Push Notification Service](#34-part-3--shared-cloud-records--push-notification-service)
  - [3.5 Part 4 — Connected User Interfaces (Web, Mobile, and QR)](#35-part-4--connected-user-interfaces-web-mobile-and-qr)
- [4. How It All Works Together When Implemented (Step-by-Step Flows)](#4-how-it-all-works-together-when-implemented-step-by-step-flows)
  - [4.1 Flow 1 — Normal Everyday Restroom Visit (Fully Autonomous)](#41-flow-1--normal-everyday-restroom-visit-fully-autonomous)
  - [4.2 Flow 2 — Hardware Detects a Leak or Routine Service Threshold (Closed-Loop Automation)](#42-flow-2--hardware-detects-a-leak-or-routine-service-threshold-closed-loop-automation)
  - [4.3 Flow 3 — Campus Visitor Reports a Problem via QR Code](#43-flow-3--campus-visitor-reports-a-problem-via-qr-code)
  - [4.4 Flow 4 — Administrator Remote Command & Built-In Safety Interlock](#44-flow-4--administrator-remote-command--built-in-safety-interlock)
  - [4.5 Flow 5 — Offline Basement / Dead-Zone Work & Auto-Sync](#45-flow-5--offline-basement--dead-zone-work--auto-sync)
- [5. Quality Control, Accountability & Task Lifecycle](#5-quality-control-accountability--task-lifecycle)
  - [5.1 End-to-End Maintenance Task Status Journey](#51-end-to-end-maintenance-task-status-journey)
  - [5.2 Proof Standards, SDCA 10-Point Checklist & Record Integrity](#52-proof-standards-sdca-10-point-checklist--record-integrity)
- [6. Implementation Readiness & Honest Pre-Rollout Review Notes](#6-implementation-readiness--honest-pre-rollout-review-notes)
  - [6.1 Capabilities Ready for Daily Operation Today](#61-capabilities-ready-for-daily-operation-today)
  - [6.2 Pilot Boundaries & Items Identified During Pre-Rollout Audit](#62-pilot-boundaries--items-identified-during-pre-rollout-audit)

---

## 1. Executive Summary & What Is Being Implemented

Smart-Flush (branded **Klir**) connects physical restroom automation with real-time campus facility operations. Instead of relying solely on scheduled rounds or word-of-mouth complaints, the system links **smart stall hardware**, **automated cloud monitoring**, **visitor QR reporting**, an **Administrator Web Portal**, and a **Staff Mobile App** into one continuous workflow.

When fully implemented, everyday hygiene cycles run automatically inside the stall without staff intervention, while leaks, wear limits, and visitor complaints automatically turn into tracked work orders with watermarked photo proof and supervisor sign-off.

**What this system delivers for decision-makers:**

- **Touchless, safe restroom operation:** Automatic lid opening, post-visit flushing, water flow measurement, and post-closure UV-C surface sanitization—governed by built-in occupancy safety locks so mechanical or UV cycles never run while a person is inside.
- **Zero-app visitor reporting:** Students, faculty, and guests scan a laminated QR code sticker on any stall door or sink wall to report clogged toilets, missing water, leaks, or broken locks in seconds.
- **Closed-loop maintenance accountability:** Every problem—whether detected by sensors, triggered by usage counters, or submitted by a visitor—follows a verifiable chain from dispatch to technician photo proof to supervisor approval.
- **Transparent rollout posture:** Full hardware automation currently runs on **one Smart Pilot Unit** (equipped with its own dedicated single-stall QR placard), while campus-wide QR issue reporting and mobile maintenance accountability already cover **all 118 Campus Batch QR locations** across 22 rooms in the Annex Building. Section 6 clearly details what is live today and what remains scoped for follow-up.

---

## 2. Campus Scope & Who Uses the System

### 2.1 Smart Pilot Hardware vs. Campus-Wide QR Coverage

The SDCA Annex Building deployment combines one hardware-instrumented Smart Pilot Unit with campus-wide QR tracking across four floors:

| Floor Level | Restroom Rooms Covered | Individual Stalls | Shared Room Common Areas (Sinks / Floors) | Campus Batch QR Locations | Hardware Automation Installed |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1st Floor** | 4 Rooms (Canteen Male/Female, Faculty Male/Female) | 18 Stalls | 4 Common Areas | **22** | QR Reporting + Mobile Task Tracking |
| **2nd Floor** | 6 Rooms (Left/Right Male, Female, PWD) | 26 Stalls | 6 Common Areas | **32** | QR Reporting + Mobile Task Tracking |
| **3rd Floor** | 6 Rooms (Left/Right Male, Female, PWD) | 26 Stalls | 6 Common Areas | **32** | QR Reporting + Mobile Task Tracking |
| **4th Floor** | 6 Rooms (Left/Right Male, Female, PWD) | 26 Stalls | 6 Common Areas | **32** | QR Reporting + Mobile Task Tracking |
| **Building Batch Total** | **22 Rooms** | **96 Stalls** | **22 Common Areas** | **118 QR Locations** | **118 Batch QR Locations Across 22 Rooms** |
| **Smart Pilot Unit (Separate)** | **1 Assignable Pilot Stall** | **1 Dedicated Stall** | *(Dedicated single-stall placard)* | **+1 Pilot Placard** | **1 Full Smart Pilot Unit (Sensors, Lid, Flush, Flow, UV-C)** |

- **Campus Batch QR coverage & consolidated reporting:** The **QR Code Batch Print** tool in Web Configuration generates printable sticker sheets for all **118 exact Campus Batch QR locations** (**96 individual stalls** plus **22 shared room common areas** across **22 restroom rooms** on Floors 1–4). For quick daily oversight, the Administrator Web Reports directory groups entries into **20 clean facility rows** (consolidating Left/Right PWD rooms per floor alongside the pilot unit row).
- **Dedicated Smart Pilot Unit placard & assignable location:** The **1 Smart Pilot Unit** uses its own dedicated single-stall QR placard generated in Web Configuration (outside the 118 Campus Batch stickers). Its assigned floor and restroom zone are configurable in Web Configuration (with **4th Floor / 4th Floor Restroom Zone** as the unconfigured fallback default and **1st Floor Testing Lab** selectable on the 1st Floor), listed under **1st Floor (Testing Lab / Pilot Bench)** in Web Reports, and pre-labeled **Main Building — Floor 2, Stall 1** in the controller firmware.
- **Pilot hardware distinction:** Only the **Smart Pilot Unit** actively sends ultrasonic distance, water flow, flush volume, lid state, and UV-C cycle telemetry. All **118 Campus Batch QR locations** operate smoothly through visitor QR reports and staff work orders until additional hardware kits are installed.

### 2.2 The Three Human User Groups

Each person interacts only with the tools tailored to their role, preventing unauthorized access to hardware controls or management functions:

| User Group | Interface Used | Sign-In & Role Access | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Campus Visitors** (Students, Faculty, Guests) | Mobile Web Browser (via QR Sticker) | **None required** (Open instant form) | Scan stall or sink QR code, select issue category, optionally take a live or gallery photo, and submit for review. |
| **Facility Administrators** | Desktop / Tablet Web Portal | Email & password (Administrator role only) | Monitor live smart stall readings, adjust hardware timers/rules, print QR stickers, manage staff accounts, send safe remote commands, review visitor QR reports, and create tasks. |
| **Maintenance Technicians** | Staff Mobile App | Email & password (Maintenance or Technician role) | Receive instant push alerts, accept tasks, capture watermarked Before/After/Area proof photos, complete the 10-point SDCA checklist (online or offline), and submit for inspection. |
| **Maintenance Supervisors** | Staff Mobile App | Email & password (Supervisor role) | Monitor team availability, assign or reassign unassigned tasks, review submitted proof photos and checklist scores, approve clean work or flag rework, and export audit reports. |

> **Security Separation:** Administrator accounts cannot sign in to the Staff Mobile App, and Maintenance or Supervisor accounts cannot access the Administrator Web Portal.

---

## 3. How the Four Parts Connect (Plain-Language Architecture)

Every action in Smart-Flush passes through four connected layers. Telemetry and issue reports flow into the cloud for monitoring and dispatch, while Administrator commands, updated timers, and Supervisor approvals flow back out to keep hardware and field staff synchronized.

### 3.1 Closed-Loop Connected System Diagram

```
+---------------------------------------------------------------------------------------------------+
|                   PART 1: SMART RESTROOM HARDWARE (Assignable Smart Pilot Unit)                   |
|                                                                                                   |
|   [Ultrasonic Visitor Sensor]   [Motorized Lid]   [Flush Pump & Water Flow Meter]   [UV-C Lamp]   |
|                          \             |                 |                 /                      |
|                           +-------> [Smart Stall Controller Unit] <-------+                       |
|                                     (Built-In Occupancy Safety Locks)                             |
+-----------------------------------------+-------------------------------+-------------------------+
                                          |                               ^
               Live Telemetry & Cycles    |                               | Remote Commands
               (Occupancy, Water, UV)     v                               | & Timer Settings
+-----------------------------------------+-------------------------------+-------------------------+
|                   PART 2: 24/7 CLOUD BRIDGE & AUTOMATION ENGINE (Background Server)               |
|                                                                                                   |
|  - Relays stall readings to cloud & sends Admin Web commands/settings back to stall controller    |
|  - Runs 60-second offline hardware watchdog (creates alert if stall stops reporting)              |
|  - Tracks flush/UV wear counters & triggers automated maintenance tasks for active rules          |
|  - Recovers interrupted visitor evidence jobs & queues push notifications via midnight routine    |
+-----------------------------------------+-------------------------------+-------------------------+
                                          |                               ^
               Telemetry, Alerts & Auto   |                               | Settings, Rule Updates &
               Assigned Tasks             v                               | Safe Command Signals
+-----------------------------------------+-------------------------------+-------------------------+
|             PART 3: SHARED CLOUD RECORDS & PUSH NOTIFICATION SERVICE (Single Source of Truth)     |
|                                                                                                   |
|  - Stores live sensor history, tasks, Before/After/Area proof photos, checklists & alert logs     |
|  - Tracks staff online/available status (2-minute inactivity timeout) & sends mobile push alerts  |
|  - Holds Campus Visitor QR submissions securely for Administrator moderation                      |
+--------+-----------------------------+------------------------------+-----------------------------+
         |                             ^                              |                             ^
         | Dashboards, Analytics       | Commands, Timers, Staff,     | Assigned Work Orders        | Proof Photos,
         | & Visitor QR Triage         | QR Approvals & New Tasks     | & Instant Push Alerts       | 10-Pt Checklist,
         v                             |                              v                             | Approvals & Presence
+--------+-----------------------------+--------+   +-----------------+-----------------------------+--------+
| PART 4A: FACILITY ADMINISTRATOR WEB PORTAL    |   | PART 4B: MAINTENANCE & SUPERVISOR MOBILE APP           |
|                                               |   |                                                        |
| - Live Hardware Monitor & Safe Remote Actions |   | - Technician: Push Alerts, Watermarked Photos,         |
| - Analytics, Audit History & CSV/PDF Exports  |   |   10-Point SDCA Checklist & Offline Basement Queue     |
| - Rule Setup, Staff Creation & QR Printing    |   | - Supervisor: Live Team Availability, Reassignment,    |
| - Visitor QR Review ("Confirm & Create Task") |   |   Photo Inspection (Approve/Flag) & Audit Exports      |
+-----------------------------------------------+   +--------------------------------------------------------+
                                       ^
                                       | Visitor Reports (Anti-Spam Protected & Prioritized)
+--------------------------------------+---------------------------------------------------------------------+
| PART 4C: CAMPUS VISITOR QR REPORTING WEB FORM (118 Batch Stickers + 1 Pilot Placard)                       |
|                                                                                                            |
| - Phone camera opens browser form immediately (no login or app download required)                          |
| - Tailored categories (Smart Stall adds UV issue option; continuous leaks raise urgent admin notice)       |
+------------------------------------------------------------------------------------------------------------+
```

### 3.2 Part 1 — Smart Restroom Hardware (In-Stall Unit)

Inside the pilot stall, physical components operate under strict built-in safety rules so the restroom never behaves unpredictably—even if campus Wi-Fi drops briefly:

- **Ultrasonic Visitor Sensor:** Continuously measures distance inside the stall using a 5-reading smoothing filter so brief shadows do not cause false detections. Default presence distance is **30 cm** (adjustable from **10 to 100 cm** in the Web Portal).
- **Motorized Toilet Lid:** Smoothly opens over **2 seconds** when a visitor is detected and closes over **2 seconds** once the stall clears.
- **Flush Water Pump & Water Flow Sensor:** Activates after the lid closes to deliver a timed flush (controller factory default is **3 seconds** until updated from the Web Portal, adjustable from **1 to 30 seconds**). Meanwhile, the water flow sensor counts pulses to calculate exact **liters used**, warns of low water pressure (**under 0.80 liters**) or a failed flush (**under 0.30 liters**), and measures unexpected flow when idle.
- **UV-C Sanitizing Lamp:** Turns on only after the lid has fully closed and the flush finishes (controller factory default is **5 seconds** until updated from the Web Portal, adjustable from **10 to 120 seconds**), then enters a **2-second** mechanical settle pause before returning to Standby (plus a **5-second** sensor stabilization grace window right after the lid opens for the next visitor).
- **Built-In Safety Interlocks:**
  - **Zero-harm vacancy rule:** Neither an automatic flush, a UV-C cycle, nor a remote Administrator command will activate pump, UV, or open/close motor commands while a visitor is inside or another cycle is running (only an emergency **Turn Off** stop or closing an already open manual lid override is permitted).
  - **Departure confirmation pause:** Waits **3 seconds** after the sensor stops seeing a person before closing the lid, preventing premature closure if a visitor shifts slightly.
  - **15-minute prolonged-occupancy & manual-lid safety timeouts:** If a stall remains occupied beyond 15 minutes (or an item blocks the ultrasonic lens), the controller keeps the stall safely active and raises a prolonged-occupancy warning alert so staff can inspect; separately, any manual Administrator lid-open override automatically closes back to Standby after 15 minutes.
  - **Fail-safe startup:** Immediately forces pump and UV relays off whenever power turns on or restarts.

### 3.3 Part 2 — 24/7 Cloud Bridge & Automation Engine

An always-running background server connects the physical stall to campus cloud systems:

- **Two-Way Live Relay:** Receives sensor readings and cycle completion records from the stall over Wi-Fi, attaches official server timestamps, filters noise, and updates cloud dashboards within seconds. Going the other direction, it delivers Administrator remote commands and timer/distance settings back to the stall controller.
- **Hardware Silence Watchdog:** Checks every **30 seconds** whether the smart stall has reported recently. If no heartbeat arrives for **60 seconds**, it automatically marks the stall offline and raises an Administrator alert.
- **Usage & Wear Tracking:** Maintains cumulative counters for total flushes, liters consumed, UV-C cycles completed, and time elapsed since the last sanitization.
- **Rule-Based Auto-Dispatch:** Evaluates enabled rules whenever new telemetry arrives (such as continuous water flow during standby, ultrasonic sensor timeouts, or routine flush/UV service limits). When triggered, it selects an online, available technician and creates an assigned work order—or places the task into the Supervisor holding queue and automatically retries every **60 seconds** if all technicians are busy or offline.
- **Scheduled Daily Maintenance Routine:** A midnight background task sweeps interrupted visitor photo uploads and pending notification outbox items so no report gets stuck after temporary network hiccups.

### 3.4 Part 3 — Shared Cloud Records & Push Notification Service

A unified cloud database and storage vault ensures all users view consistent, tamper-resistant data:

- **Single Source of Truth:** Houses device status, analytics logs, user directory profiles, work orders, checklists, alert records, and visitor issue reports.
- **Live Team Presence:** Technicians and supervisors register as **Online** when opening the mobile app and **Offline** immediately upon closing or backgrounding it, backed by a **2-minute** inactivity safeguard.
- **Instant Push Alerts:** Immediately wakes technicians' phones when a task is assigned (supporting single assignees or team tasks of up to **10 technicians**), and alerts Supervisors and Administrators whenever an urgent report arrives or a task sits unassigned waiting for human dispatch.
- **Protected Evidence Vault:** Visitor report photos and technician Before/After/Area proof photos are stored in protected cloud folders where client apps cannot overwrite or delete historical proof records.

### 3.5 Part 4 — Connected User Interfaces (Web, Mobile, and QR)

- **Facility Administrator Web Portal:** The central command console. Administrators inspect live hardware status, review usage and water analytics, adjust configuration sliders and automation rules, print the Smart Pilot Unit's dedicated QR placard plus batch QR stickers for all 118 Campus Batch locations, add staff accounts, issue safe manual controls, moderate visitor QR complaints, and export audit/operations reports (PDF, CSV, and structured data exports).
- **Maintenance & Supervisor Mobile App:** Built for field work. Technicians receive work orders on the move, follow a guided **10-point SDCA F-TGS 203 checklist** with camera-stamped photo proof (including offline capture in weak-signal zones), and submit completed jobs. Supervisors monitor live staff status, assign or reassign team members, visually inspect Before/After/Area photos, approve compliant jobs or flag incomplete work for re-inspection, and export official operations reports.
- **Campus Visitor QR Reporting Web Form:** Requires **zero login and zero app installation**. Scanning any Campus Batch sticker or the Smart Pilot Unit's dedicated placard opens a mobile page pre-filled with that exact floor, room, and stall—offering stall categories (plus UV-C light reporting exclusively on the Smart Pilot Unit) or sink/common-area categories at entrance zones.

---

## 4. How It All Works Together When Implemented (Step-by-Step Flows)

### 4.1 Flow 1 — Normal Everyday Restroom Visit (Fully Autonomous)

During routine campus traffic, the entire hygiene cycle happens automatically without human touch or staff dispatch:

```
  [1. Visitor Enters] ---> [2. Lid Opens] ---> [3. Visitor Leaves] ---> [4. 3s Confirm & Close]
                                                                                  |
  [7. Live Web Dashboard] <--- [6. Cloud Records & Analytics] <--- [5. Auto Flush -> Flow Check -> UV-C]
```

1. **Arrival Detection:** A visitor steps into the smart stall; the ultrasonic sensor detects presence within the configured distance (default **30 cm**) using 5-reading smoothing.
2. **Automatic Opening:** The motorized lid smoothly opens (**2 seconds**) while the controller marks the stall as **Occupied**.
3. **Departure Confirmation:** When the visitor exits, the controller waits **3 seconds** to confirm the stall is genuinely empty before moving any hardware.
4. **Safe Closure:** The motorized lid closes securely (**2 seconds**), sealing the bowl area before water or UV light activates.
5. **Timed Flush & Water Measurement:** The flush pump runs for its configured duration (**3 seconds** hardware default, or Administrator-configured **1–30 seconds**). Simultaneously, the flow meter calculates **liters used** and verifies adequate water pressure.
6. **Automatic UV-C Sanitization:** Once flushing finishes and the lid remains closed, the UV-C lamp runs (**5 seconds** hardware default, or Administrator-configured **10–120 seconds**), followed by a brief settle pause before returning to **Standby / Ready**.
7. **Live Cloud Visibility:** Total flush count, water volume, UV-C completion, and room readiness appear within seconds on the Administrator Web Dashboard and feed daily/monthly usage charts.

### 4.2 Flow 2 — Hardware Detects a Leak or Routine Service Threshold (Closed-Loop Automation)

When sensors spot abnormal continuous water flow or cumulative usage reaches a preventive maintenance limit, automation drives the repair cycle end to end:

```
  [1. Flow Leak / Usage Limit] ---> [2. Cloud Rule Fires] ---> [3. Tech Free?]
                                                                 /          \
                                                           Yes  /            \ No
                                                               v              v
  [7. Admin Analytics] <--- [6. Supervisor Approves/Flags] <--- [5. Tech Proof]   [4. Supervisor Queue + 60s Retry]
                                   |                                                      |
                                   +---(If Flagged: Back to Tech for Rework) <------------+
```

1. **Threshold Detection:** Either the smart stall reports sustained water flow during standby (a leaking valve or continuous run), or the cloud wear counter reaches a configured flush/UV maintenance threshold (or an offline silence alert fires).
2. **Rule Evaluation:** The 24/7 Cloud Automation Engine matches the active rule (**Send Task to Available Maintenance**) and avoids creating duplicate tickets during the rule's repeat cooldown interval.
3. **Smart Staffing Decision:**
   - **If an online, available technician is free:** The system immediately assigns the work order to that technician and sends a direct mobile push alert.
   - **If all technicians are busy or offline:** The task enters the **Supervisor Assignment Queue**, notifies all Supervisors and Administrators, and automatically re-checks every **60 seconds** for newly free staff until either auto-assigned or manually dispatched.
4. **Field Resolution & Proof Capture:** The assigned technician receives the alert, taps **Acknowledge**, completes the physical repair or cleaning, captures watermarked **Before**, **After**, and optional **Area** photos (up to 3 extra areas), completes the **10-point SDCA checklist**, and submits.
5. **Supervisor Quality Inspection:** A Supervisor receives a **Pending Review** notification, compares the Before/After photos and remarks on mobile, and selects **Approve** (closing the job and resetting routine wear counters on preventive tasks) or **Flag for Re-Inspection** (returning it directly to the technician with mandatory correction instructions).
6. **Management Audit Trail:** Response times, total work duration, technician workload, and hardware recovery appear immediately in Web Analytics and downloadable reports.

### 4.3 Flow 3 — Campus Visitor Reports a Problem via QR Code

Across the 118 Campus Batch QR locations—as well as visible issues (like clogged bowls, missing soap, or broken door locks) on the Smart Pilot Unit—campus visitors act as real-time eyes:

```
  [1. Scan Sticker] ---> [2. Pick Issue & Photo] ---> [3. Anti-Spam & Merge Duplicates]
                                                                 |
  [7. Closed Loop] <--- [6. Mobile Fix & Approval] <--- [5. Admin Confirm & Task] <--- [4. Admin Triage Inbox]
                                                          (Instant Urgent Banner if Continuous Leak)
```

1. **Zero-App Scan:** A student or staff member scans the stall door or sink-wall QR sticker with any smartphone camera. A mobile web form opens pre-labeled with the exact floor, room, and stall.
2. **Tailored Issue Selection:** The visitor chooses from location-appropriate issues (for instance, common sink areas show leaking faucets or flooded floors; only the Smart Pilot Unit displays the UV light failure option), writes a short description, and may attach one photo (up to **5 MB**).
3. **Automated Anti-Spam & Duplicate Merging:** Before saving, the cloud enforces a minimum **3-second** human fill delay, hidden bot traps, image file verification, and submission limits (**5 reports per 15 minutes** per visitor; **10-minute** per-location cooldown). If another visitor already reported an active issue at the same location, the system merges them into the existing report and raises its **confirmation count** and urgency rather than flooding the inbox.
4. **Urgent Leak Fast-Track vs. Admin Triage:** Reports appear in the Web Portal **Issue Reports** inbox. If a visitor selects **Continuous Leak**, the system immediately writes a high-priority outbox alert for Administrators so active water waste is never missed.
5. **One-Click Task Dispatch:** An Administrator reviews the report and optional photo and clicks **Confirm and Create Task**, which automatically dispatches the least-recently-assigned available online technician (or places the ticket into the Supervisor queue with 60-second automatic retry if none are free).
6. **Technician Execution & Supervisor Sign-Off:** The task flows through the exact same mobile execution, watermarked Before/After proof, 10-point checklist, and Supervisor approval loop.
7. **Closed Loop:** Once verified and approved on Mobile, both the work order and linked visitor report move to completed status on the Web Portal.

### 4.4 Flow 4 — Administrator Remote Command & Built-In Safety Interlock

When testing equipment or responding to a facility need remotely, Web Portal controls protect both visitors and motors:

```
  [1. Live Connection Check] ---> [2. Confirmation Popup] ---> [3. Cloud Bridge Relay] ---> [4. Stall Safety Check]
           (<= 90 sec)                                                                          /             \
                                                                                         Safe  /               \ Visitor Inside / Busy
                                                                                              v                 v
                                                                                     [5a. Execute Action]  [5b. Safely Blocked]
```

1. **90-Second Connection Verification:** The Web Portal checks whether the smart stall has communicated within the past **90 seconds**; if offline or stale, remote buttons remain disabled so Administrators cannot queue blind commands.
2. **Intentional Confirmation Modal:** Clicking **Open Lid**, **Close Lid**, **Manual Flush**, **Start UV-C**, or **Emergency Stop** asks the Administrator to confirm the action first.
3. **Relay to Hardware:** The portal sends the request through the 24/7 Cloud Bridge to the Smart Pilot Unit controller.
4. **Hardware Safety Decision:** Before powering any motor, pump, or UV-C lamp, the stall unit verifies that **no visitor is inside** and **no conflicting cycle is active**:
   - **If vacant and ready:** The command executes safely (for example, triggering a remote flush automatically ensures the lid closes first, then pumps water while temporarily skipping UV during manual-flush testing; opening the lid manually applies a **15-minute** safety auto-close timer).
   - **If occupied or busy:** The stall blocks the command (except **Emergency Turn Off** or closing an already open manual lid override) and reports safely back without harming an occupant.

### 4.5 Flow 5 — Offline Basement / Dead-Zone Work & Auto-Sync

Campus basements, concrete stairwells, and utility rooms often lose cellular or Wi-Fi bars. The mobile app keeps field work moving cleanly without losing proof records:

```
  [1. Signal Lost] ---> [2. Photo & Checklist Saved Locally] ---> [3. Tagged to Logged-In Tech ID]
                                                                               |
  [5. Supervisor Notified] <--- [4. Auto-Upload on Signal Return (Shared Phone Safe)] <--- [Wi-Fi / Data Back]
```

1. **Offline Execution Allowed:** When a technician finishes repairs in a zero-signal zone, the app detects no internet connection and lets them complete the full **10-point SDCA checklist**, watermarked **Before/After/Area** photos, and remarks normally.
2. **Local Secure Queue:** Photos and checklist answers are bundled and saved in protected local phone storage rather than failing with a network error.
3. **Shared-Device Ownership Guard:** Every offline bundle is stamped with the exact user ID of the technician who captured it. If another technician signs in on a shared department phone, the app deliberately keeps the first technician's pending uploads locked until that original technician logs back in—preventing misattributed proof.
4. **Automatic Background Upload:** As soon as reliable Wi-Fi or cellular service returns while the owner is signed in, the app uploads every watermarked image to the cloud, marks the submission as **Offline Synced**, and frees the technician as **Available**.
5. **Supervisor Review Notification:** The completed job immediately enters the Supervisor's **Pending Review** queue with the original offline capture timestamps preserved.

---

## 5. Quality Control, Accountability & Task Lifecycle

### 5.1 End-to-End Maintenance Task Status Journey

Every maintenance work order—whether triggered automatically by sensors, escalated from a visitor QR report, or manually created by an Administrator—passes through clearly defined statuses:

```
  [Unassigned]  --->  [Pending / Assigned]  --->  [Acknowledged]  --->  [Completed (Pending Review)]
   (If no tech         (Up to 10 techs or          (Timer starts;          (Photos + 10-pt checklist
    free; 60s retry)    specific tech notified)     "Work In Progress")     submitted to Supervisor)
                                                                                  /            \
                                                                       Approved  /              \ Flagged
                                                                                v                v
                                                                        [Approved & Closed]   [Re-Inspection Loop]
                                                                        (Locked; Resets wear   (Tech locked out of close
                                                                         counter if routine)    until Supervisor remarks fixed)
```

| Status Stage | What Happens in the System | Who Takes Action Next |
| :--- | :--- | :--- |
| **Unassigned** | No technician was online and available; queued for dispatch and retried automatically every **60 seconds**. | Supervisor assigns manually on Mobile, or 24/7 Cloud assigns automatically once a technician comes free. |
| **Pending / Assigned** | Ticket assigned to **1–10 technicians** (or broadcast when created without a specific person); push alert delivered. | Assigned technician opens the task on Mobile and taps **Acknowledge**. |
| **Acknowledged (In Progress)** | Response time clock is recorded; active repair/cleaning work begins (marked for reassignment if a team member drops or escalates). | Technician repairs issue, captures watermarked proof photos, and submits the 10-point checklist. |
| **Completed (Pending Review)** | Task awaits quality inspection; technician returns to **Available** status (on single-assignee jobs, or once all team members submit). | Supervisor inspects Before/After/Area photos and checklist answers on Mobile. |
| **Approved (Closed)** | Record is permanently signed off with timestamps; any associated preventive flush/UV wear counter resets automatically. | Facility Admins & Supervisors can view metrics and export official reports. |
| **Flagged for Re-Inspection** | Supervisor writes mandatory rework remarks; ticket becomes locked for re-cleaning with a required **Recheck** audit cycle. | Original (or reassigned) technician corrects the issue and re-submits fresh Before/After proof. |

### 5.2 Proof Standards, SDCA 10-Point Checklist & Record Integrity

To ensure every closed task meets institutional hygiene and ISO-aligned quality documentation standards:

- **Guided Proof Capture & Optional Area Photos:** Technicians complete the required **Before photo**, **10-point checklist**, and **After photo** either directly inside a task or through the guided capture sheet (which also supports up to **3 additional tagged Area photos**, using selectable tags such as Stall 1, Stall 2, Urinals, Sink & Counter, Mirror, Floor Drain, Supplies & Dispensers, or Other Area).
- **Tamper-Resistant Photo Watermarks:** Every captured image is automatically resized and compressed to save campus bandwidth, then burned directly with the **local Philippine capture timestamp, restroom location label, stall ID, and task ID tag**.
- **Optional Identity Verification Prompt:** Before photo capture, the app can prompt for phone fingerprint or face unlock, gracefully allowing a skip if the device lacks enrolled biometrics while recording verification status honestly in the submission.
- **Evidence Preservation Rules:** Cloud storage permissions strictly forbid technicians or client apps from deleting submitted task photos (**Before**, **After**, or **Area** proof) or visitor evidence images. Approved tasks are also locked against technician re-editing on mobile.
- **Official SDCA F-TGS 203 10-Point Checklist:** Every mobile submission covers all 10 standard items below (technician remarks are optional upon completion, while Supervisors must provide remarks of at least 5 characters—and may attach up to 5 reference photos—whenever flagging a job for re-inspection):

| # | SDCA Checklist Inspection Area | Official SDCA F-TGS 203 Checklist Item |
| :---: | :--- | :--- |
| **1** | **Ceilings** | Remove dust/cobwebs on ceilings |
| **2** | **Walls** | Remove dust/cobwebs on walls |
| **3** | **Light Bulbs** | Remove dust/cobwebs in light bulbs |
| **4** | **Windows *(Optional)*** | Clean windows (if any) |
| **5** | **Fixtures *(Optional)*** | Wipe down fixtures (armchairs, etc.) |
| **6** | **Floors** | Sweep and dry floors |
| **7** | **Fixture Arrangement *(Optional)*** | Arrange fixtures (if any) |
| **8** | **High-Touch Surfaces** | Disinfect often touched surfaces |
| **9** | **Trash Bins** | Empty and re-line trash bins |
| **10** | **UV Sanitation** | Disinfect using UV lights, etc. |

---

## 6. Implementation Readiness & Honest Pre-Rollout Review Notes

### 6.1 Capabilities Ready for Daily Operation Today

Based on complete inspection of the hardware controller, cloud automation server, security rules, Web Portal, and Mobile App:

- **End-to-End Pilot Hardware Cycle:** Autonomous lid control, safety-interlocked flushing, flow-volume logging, UV-C sanitization, remote Web actuator controls (Open/Close Lid, Flush, UV-C, Emergency Stop), and live Web dashboard telemetry all function cohesively on the Smart Pilot Unit.
- **Automated Leak & Preventive Maintenance Loop:** The 24/7 Cloud Bridge accurately watches for **60-second hardware offline periods**, tracks flush/UV wear counters, triggers tasks for **continuous water flow** and enabled task rules, dispatches free maintenance technicians (or holds for Supervisor queue with 60-second automatic retry), and resets preventive counters upon Supervisor mobile approval.
- **Campus-Wide Visitor QR Moderation (118 Batch Locations + 1 Pilot Placard):** Public QR reporting works without login across all 4 floors, blocks spam bursts, consolidates duplicate reports into rising confirmation counts, highlights urgent continuous-leak complaints for Administrators, and turns verified reports into tracked mobile tasks with one click.
- **Offline-Resilient Mobile Field Proof & Supervisor QA:** Watermarked Before/After/Area photos, the 10-point SDCA F-TGS 203 checklist, shared-device-safe offline queuing, live team availability tracking, Supervisor Approve/Flag workflows, and Operations/Audit PDF & CSV exports are fully operational.

### 6.2 Pilot Boundaries & Items Identified During Pre-Rollout Audit

For transparent leadership review before campus-wide scaling, reviewers should note the following verified scope limits and minor technical gaps currently present in the build:

| # | Area | What Reviewers Should Know Today | Practical Operational Impact & Recommended Next Step |
| :---: | :--- | :--- | :--- |
| **1** | **Hardware Scope vs. QR Scope** | Automated sensors, motorized lid, water pump, flow sensor, and UV-C lamp exist on **1 Smart Pilot Unit** (assigned flexibly via Web Configuration—with 4th Floor Restroom Zone as unconfigured default—listed under 1st Floor Testing Lab / Pilot Bench in Web Reports, and labeled Floor 2, Stall 1 in controller firmware, with its own dedicated QR placard). All **118 Campus Batch QR locations** (**96 stalls and 22 common areas** across 22 rooms) use QR stickers and mobile maintenance workflows only. | Campus stakeholders should treat the Smart Pilot Unit as the live smart hardware pilot bench while rolling out all 118 Campus Batch QR stickers and staff accountability campus-wide immediately. |
| **2** | **Remote Hardware Restart Button** | The Web Portal's **Restart Restroom Unit** confirmation dialog dispatches a restart signal, but the current stall controller software does not listen for remote restart commands. | Pressing **Restart Restroom Unit** on Web will not reboot the physical stall hardware; if a controller ever freezes, facility staff must briefly power-cycle the unit at the stall. |
| **3** | **Inactive Rule Actions & Standalone Hardware Alerts** | Under Automation Rules, **Send Task to Available Maintenance** executes automatically, while menu options **Send Warning Email** and **Disable Subsystem** have no outbound email or subsystem-shutoff handler yet. Additionally, standalone non-rule threshold alerts (UV failure or generic flush threshold without an active Maintenance Rule) are not triggered automatically, and low-level hardware standby leak flags only escalate into work orders when configured through the Cloud **Continuous Water Flow** rule. | Configure all operational rules with **Send Task to Available Maintenance**, enable a **Continuous Water Flow** maintenance rule for leak detection, and avoid relying on email/disable-subsystem actions until wired. |
| **4** | **Settings Synchronization Nuances** | Three minor timing/display settings differ slightly between screens: (a) the stall ships at **3 s flush / 5 s UV** until saved from Web Configuration (whose screen defaults open at **8 s flush / 45 s UV**, while the quick Manual Flush dialog displays **6.0 s**); (b) the stall controller keeps its **3-second departure confirmation pause** fixed rather than reading Web slider edits; and (c) the Dashboard's **Occupancy status card** always displays Occupied at **within 30 cm** even if the Configuration slider is adjusted elsewhere. | After connecting the pilot stall, click **Save Settings** once in Configuration so Web and hardware share the intended flush/UV times; treat 30 cm and 3 s departure pause as standard baseline behavior during pilot review. |
| **5** | **Mobile Audit Trail Cloud Sync** | When staff log in/out or submit actions on the Mobile App, the cloud audit security rule requires each log entry to stamp a matching user-ID field that the mobile logger does not yet include. As a result, mobile-generated audit entries fall back cleanly to the phone's local cache (**300 saved locally / 500 in memory**) and clear on logout rather than appearing centrally on Web. | Supervisor PDF/CSV exports generated directly on the Mobile App still show that device's recent audit history; adding the user-ID stamp to the mobile audit helper will restore seamless cloud syncing across all devices. |
| **6** | **Web Portal Task Editing vs. Mobile Reassignment** | On the Web Portal's **Maintenance Tasks** screen, an **Edit** button appears on Assigned, Unassigned, and Reassignment Needed cards, but clicking Edit triggers a screen restriction unless the task is strictly **Pending** or flagged for supervisor escalation. | Administrators use Web to create, edit pending drafts, or delete mistaken tasks; once a task is assigned to staff, **Supervisors handle all live reassignments on the Mobile App**. |
| **7** | **Auto-Dispatch Role Tagging & Midnight Photo Retention** | The 24/7 Cloud auto-dispatcher searches staff accounts tagged with the standard **Maintenance** role using their online/available status flag (without checking the strict 2-minute activity cutoff), whereas Admin QR issue confirmation checks both Maintenance and Technician role labels and the 2-minute window. Meanwhile, the scheduled midnight background job recovers stalled visitor evidence uploads and alert notifications, but does **not** automatically purge 90-day-old rejected/resolved visitor images. | Standardize all new technician accounts under the **Maintenance** role in Admin Staff setup so auto-dispatch always finds them, and schedule periodic storage housekeeping until automated 90-day image deletion is enabled. |
| **8** | **Browser-Local Overdue Reminders & Pilot Analytics Scope** | Administrator overdue-task popup alerts are tracked in each individual web browser rather than shared across different Admin computers, and Web Sensor History / Water Analytics currently reflect telemetry from the instrumented Smart Pilot Unit alongside campus-wide maintenance task metrics. | Expect overdue popup reminders to stay per browser, and interpret hardware water/UV charts as pilot-unit performance alongside building-wide task response statistics. |
