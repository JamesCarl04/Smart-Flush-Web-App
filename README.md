# 🚽 Klir — Smart Flush Enterprise IoT & Custodial Dispatch Platform

> **Autonomous Restroom Intelligence, Real-Time Sensor Telemetry & Closed-Loop Workforce Dispatch**  
> *St. Dominic College of Asia (SDCA) Annex Campus Edition • 22 Facilities • 96 Stalls • 4 Floors*

[![Next.js](https://img.shields.io/badge/Next.js-16.1%20(Turbopack)-black.svg?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-4.12-5A0EF8.svg?logo=daisyui)](https://daisyui.com/)
[![Firebase](https://img.shields.io/badge/Firebase%20Admin-v13.7-orange.svg?logo=firebase)](https://firebase.google.com/)
[![MQTT](https://img.shields.io/badge/MQTT-HiveMQ%20Cloud%20TLS-red.svg?logo=mqtt)](https://www.hivemq.com/)
[![Jest Tests](https://img.shields.io/badge/Jest%20Tests-315%2F315%20Passing%20(39%20Suites)-brightgreen.svg?logo=jest)](https://jestjs.io/)
[![WCAG](https://img.shields.io/badge/WCAG-2.2%20Level%20AA-green.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 📖 Welcome to Klir

**Klir** is an end-to-end institutional hygiene and facility intelligence platform designed for high-traffic environments. Currently operational across the **St. Dominic College of Asia (SDCA) Annex Building**, Klir bridges physical microcontroller hardware (ESP32) with a modern cloud-native web dashboard and real-time mobile custodial dispatch.

Whether you are a **campus administrator**, a **facility supervisor**, a **custodial technician**, a **hardware engineer**, or a **software developer**, this document provides a comprehensive, structured walkthrough of all system features, application pages, architectural layers, and operational workflows.

---

## 📌 Table of Contents

1. [Platform Overview & Executive Summary](#-platform-overview--executive-summary)
2. [Master Campus Facility Directory (22 Restrooms & 96 Stalls)](#-master-campus-facility-directory-22-restrooms--96-stalls)
3. [End-to-End System Architecture](#-end-to-end-system-architecture)
4. [Hardware & Microcontroller Specification (ESP32)](#-hardware--microcontroller-specification-esp32)
   - [GPIO Pinout Mapping Table](#gpio-pinout-mapping-table)
   - [Electrical Schematics & Power Isolation](#electrical-schematics--power-isolation)
   - [7-State Finite State Machine (FSM)](#7-state-finite-state-machine-fsm)
5. [MQTT Protocol & Telemetry Schema](#-mqtt-protocol--telemetry-schema)
   - [Sensor Telemetry Topics](#sensor-telemetry-topics)
   - [Operational Event Topics](#operational-event-topics)
   - [Remote Actuation Command Topics](#remote-actuation-command-topics)
6. [Complete Web Application Pages Guide](#-complete-web-application-pages-guide)
   - [1. Public Institutional Landing (`/`)](#1-public-institutional-landing-)
   - [2. Public QR Stall Incident Reporting (`/report/[deviceId]`)](#2-public-qr-stall-incident-reporting-reportdeviceid)
   - [3. Staff & Administrative Portal (`/portal-admin/*`)](#3-staff--administrative-portal-portal-admin)
   - [4. Operations Command Center (`/dashboard`)](#4-operations-command-center-dashboard)
   - [5. Telemetry & Facility Intelligence Analytics (`/analytics`)](#5-telemetry--facility-intelligence-analytics-analytics)
   - [6. Incident Alarms & Alert Triage (`/alerts`)](#6-incident-alarms--alert-triage-alerts)
   - [7. Custodial Work Orders & Task Management (`/tasks`)](#7-custodial-work-orders--task-management-tasks)
   - [8. System Configuration & Automation Rules (`/configuration`)](#8-system-configuration--automation-rules-configuration)
   - [9. Community Issue Moderation (`/issue-reports`)](#9-community-issue-moderation-issue-reports)
   - [10. Multi-Format Compliance & Export Engine (`/reports`)](#10-multi-format-compliance--export-engine-reports)
   - [11. User Profile & Preferences (`/profile`)](#11-user-profile--preferences-profile)
7. [Core Platform Features Deep Dive](#-core-platform-features-deep-dive)
   - [Autonomous Touchless Operation](#1-autonomous-touchless-sanitation)
   - [Continuous Ingestion & Watchdog Monitor](#2-continuous-telemetry-ingestion--watchdog-monitor)
   - [Closed-Loop Supervisor QA Workflow](#3-closed-loop-supervisor-qa-audit-workflow)
   - [Automated Dispatch & Leak Anomaly Engine](#4-automated-dispatch--leak-anomaly-engine)
   - [Campus Batch QR Generator & Printable Sheets](#5-campus-batch-qr-generator--printable-sheets)
   - [Double-Action Safety Locks (Poka-Yoke)](#6-double-action-actuator-safety-locks-poka-yoke)
8. [Role-Based Access Control (RBAC) & Security Architecture](#-role-based-access-control-rbac--security-architecture)
9. [Comprehensive REST API Reference (48 Endpoints)](#-comprehensive-rest-api-reference-48-endpoints)
10. [Design System & Accessibility (WCAG 2.2 AA)](#-design-system--accessibility-wcag-22-aa)
11. [Local Installation & Development Setup](#-local-installation--development-setup)
12. [Production Deployment Architecture (Vercel + Railway)](#-production-deployment-architecture-vercel--railway)
13. [Testing, Diagnostics & Code Quality](#-testing-diagnostics--code-quality)
14. [Hardware & Windows Troubleshooting Guide](#-hardware--windows-troubleshooting-guide)
15. [Repository Directory & File Map](#-repository-directory--file-map)
16. [License & Attribution](#-license--attribution)

---

## 🏢 Platform Overview & Executive Summary

Traditional institutional sanitation relies on static janitorial cleaning logs taped to the back of restroom doors. This leads to unpredictable hygiene conditions, unaddressed plumbing leaks that waste thousands of liters of water, and poor staff accountability.

**Klir solves these challenges through three core pillars:**

```mermaid
flowchart LR
    A["📡 1. Edge IoT Sanitation\nTouchless Ultrasonic Triggering\nAutomated Solenoid Flush\nPost-Use 254nm UV-C Disinfection\nYF-S201 Water Flow Metering"] --> B["⚙️ 2. Cloud Intelligence\nContinuous MQTT Ingestion\nAnomaly & Leak Alarms\nAutomated Threshold Work Orders\nCross-Device FCM Push Alerts"]
    B --> C["📱 3. Closed-Loop Operations\nReal-Time Web Command Hub\nTechnician Photo Proof Submission\nSupervisor QA Audit Triage\nPublic Stall QR Feedback Loop"]
```

### Key Business & Environmental Benefits:
* **Zero Contact Cross-Contamination**: Restroom occupants never touch a flush handle or lid, dramatically curbing pathogen transmission on campus.
* **Significant Water Conservation**: Hall-effect flow sensors meter exact consumption per cycle, instantly flagging continuous leaks ($>0.5\text{ L/min}$ for $>45\text{s}$) to avoid plumbing waste.
* **Guaranteed Custodial Accountability**: Work orders require digital checklists, timestamps, and camera photo proof before entering the supervisor's QA inspection queue.
* **Student & Faculty Empowerment**: Anyone on campus can scan a stall's QR code on their smartphone to submit a verified issue report with live photo evidence in seconds without creating an account.

---

## 🗺️ Master Campus Facility Directory (22 Restrooms & 96 Stalls)

The SDCA Annex Building campus directory accounts for **22 physical restroom rooms** housing **96 individual stalls/fixtures**, plus the hardware testing bench. Every stall possesses a unique identifier, hardware mapping, floor designation, and dedicated reporting endpoint.

| Floor | Restroom Name | Device / Room ID | Stall Count | Stall ID Range | Room Code | Default Lead Custodian |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **1F** | **1F Canteen Male Restroom** | `SDCA-FL1-CANTEEN-M` | 7 | `S1` – `S7` | `SDCA-101-CM` | James Alvarez (`james@gmail.com`) |
| **1F** | **1F Canteen Female Restroom** | `SDCA-FL1-CANTEEN-F` | 3 | `S1` – `S3` | `SDCA-102-CF` | James Alvarez (`james@gmail.com`) |
| **1F** | **1F Faculty Male Restroom** | `SDCA-FL1-FACULTY-M` | 6 | `S1` – `S6` | `SDCA-103-FM` | James Alvarez (`james@gmail.com`) |
| **1F** | **1F Faculty Female Restroom** | `SDCA-FL1-FACULTY-F` | 2 | `S1` – `S2` | `SDCA-104-FF` | James Alvarez (`james@gmail.com`) |
| **2F** | **2F Male (Left Wing)** | `SDCA-FL2-M1` | 7 | `S1` – `S7` | `SDCA-201-M1` | Justine Lopez (`justine@gmail.com`) |
| **2F** | **2F Male (Right Wing)** | `SDCA-FL2-M2` | 7 | `S1` – `S7` | `SDCA-202-M2` | Justine Lopez (`justine@gmail.com`) |
| **2F** | **2F Female (Left Wing)** | `SDCA-FL2-F1` | 5 | `S1` – `S5` | `SDCA-203-F1` | Justine Lopez (`justine@gmail.com`) |
| **2F** | **2F Female (Right Wing)** | `SDCA-FL2-F2` | 5 | `S1` – `S5` | `SDCA-204-F2` | Justine Lopez (`justine@gmail.com`) |
| **2F** | **2F PWD (Left Wing)** | `SDCA-FL2-PWD1` | 1 | `PWD1` | `SDCA-205-PWD1` | Justine Lopez (`justine@gmail.com`) |
| **2F** | **2F PWD (Right Wing)** | `SDCA-FL2-PWD2` | 1 | `PWD2` | `SDCA-206-PWD2` | Justine Lopez (`justine@gmail.com`) |
| **3F** | **3F Male (Left Wing)** | `SDCA-FL3-M1` | 7 | `S1` – `S7` | `SDCA-301-M1` | Maria Lindog (`maria@gmail.com`) |
| **3F** | **3F Male (Right Wing)** | `SDCA-FL3-M2` | 7 | `S1` – `S7` | `SDCA-302-M2` | Maria Lindog (`maria@gmail.com`) |
| **3F** | **3F Female (Left Wing)** | `SDCA-FL3-F1` | 5 | `S1` – `S5` | `SDCA-303-F1` | Maria Lindog (`maria@gmail.com`) |
| **3F** | **3F Female (Right Wing)** | `SDCA-FL3-F2` | 5 | `S1` – `S5` | `SDCA-304-F2` | Maria Lindog (`maria@gmail.com`) |
| **3F** | **3F PWD (Left Wing)** | `SDCA-FL3-PWD1` | 1 | `PWD1` | `SDCA-305-PWD1` | Maria Lindog (`maria@gmail.com`) |
| **3F** | **3F PWD (Right Wing)** | `SDCA-FL3-PWD2` | 1 | `PWD2` | `SDCA-306-PWD2` | Maria Lindog (`maria@gmail.com`) |
| **4F** | **4F Male (Left Wing)** | `SDCA-FL4-M1` | 7 | `S1` – `S7` | `SDCA-401-M1` | Facilities Supervisor Team |
| **4F** | **4F Male (Right Wing)** | `SDCA-FL4-M2` | 7 | `S1` – `S7` | `SDCA-402-M2` | Facilities Supervisor Team |
| **4F** | **4F Female (Left Wing)** | `SDCA-FL4-F1` | 5 | `S1` – `S5` | `SDCA-403-F1` | Facilities Supervisor Team |
| **4F** | **4F Female (Right Wing)** | `SDCA-FL4-F2` | 5 | `S1` – `S5` | `SDCA-404-F2` | Facilities Supervisor Team |
| **4F** | **4F PWD (Left Wing)** | `SDCA-FL4-PWD1` | 1 | `PWD1` | `SDCA-405-PWD1` | Facilities Supervisor Team |
| **4F** | **4F PWD (Right Wing)** | `SDCA-FL4-PWD2` | 1 | `PWD2` | `SDCA-406-PWD2` | Facilities Supervisor Team |
| **LAB** | **SDCA Hardware Test Bench** | `toilet-01` | 1 | `BENCH-01` | `LAB-BENCH-01` | Lead Hardware Diagnostic Unit |

---

## 🛠️ End-to-End System Architecture

Klir avoids serverless timeout traps by deploying a decoupled three-tier architecture:

```mermaid
flowchart TB
    subgraph CampusEdge["🏫 Campus Restrooms Edge (Hardware)"]
        ESP32["🚽 ESP32 Microcontroller Node\n• Ultrasonic Sensor (HC-SR04)\n• Hall Flow Meter (YF-S201)\n• Motorized Lid Servo (MG995)\n• 12V Solenoid Flush Valve\n• 254nm UV-C Lamp Relay\n• WiFi TLS MQTT Client"]
        QRStickers["🏷️ Stall QR Code Stickers\n(Printable sheets for 96 stalls)"]
    end

    subgraph Broker["☁️ Cloud MQTT Broker"]
        HiveMQ["🌐 HiveMQ Cloud\n• Port 8883 (MQTTS / TLS)\n• QoS 1 Ingestion\n• Pub/Sub Event Topics"]
    end

    subgraph IngestionBridge["⚙️ 24/7 Ingestion Worker (Railway)"]
        Worker["⚡ mqtt-listener Service\n• Persistent Node.js Worker\n• Heartbeat Watchdog\n• Sensor Batch Writer\n• Rule Threshold Evaluator\n• FCM Notification Dispatcher"]
    end

    subgraph FirebaseCloud["🔥 Google Firebase Cloud Services"]
        Firestore[("🗄️ Cloud Firestore\n• devices\n• sensorReadings\n• tasks\n• alerts\n• automationRules\n• publicIssueReports\n• maintenanceNotes")]
        Auth["🔐 Firebase Auth\n• Custom Claims RBAC\n• JWT Token Issuance"]
        Storage["📦 Firebase Storage\n• Issue Photo Evidence\n• Task Completion Proof"]
        FCM["📲 Firebase Cloud Messaging\n• Custodial Push Notifications"]
    end

    subgraph Frontends["💻 Client Application Interfaces"]
        WebApp["🖥️ Next.js 16 Web Dashboard\n(Operations, QA Triage, Analytics, PDF Exports)"]
        MobileApp["📱 Custodial Mobile PWA\n(Task Checklist, Photo Proof Upload)"]
        PublicScan["🤳 Public Mobile Web Browser\n(/report/[deviceId] - Zero Login Reporting)"]
    end

    ESP32 -->|MQTTS Telemetry & Events| HiveMQ
    HiveMQ -->|Subscribe toilet/#| Worker
    Worker -->|Batch Ingest Readings| Firestore
    Worker -->|Trigger Automated Work Orders| Firestore
    Worker -->|Send Push Notification| FCM
    FCM -->|Push Alert| MobileApp
    WebApp -->|Live Firestore Snapshot Streaming| Firestore
    WebApp -->|Publish Actuator Commands| HiveMQ
    HiveMQ -->|Deliver Actuation| ESP32
    QRStickers -.->|Scanned by Smartphone| PublicScan
    PublicScan -->|Submit Report & Photo| Firestore
    PublicScan -->|Upload Evidence| Storage
    WebApp -->|Review Reports & Tasks| Firestore
    MobileApp -->|Acknowledge / Submit Proof| Firestore
```

---

## 🔌 Hardware & Microcontroller Specification (ESP32)

### GPIO Pinout Mapping Table

| GPIO Pin | Function / Peripheral | Direction / Logic | Electrical Description |
| :--- | :--- | :---: | :--- |
| **`GPIO 12`** | **Ultrasonic `TRIG`** | $3.3\text{V}$ Output | Sends $10\mu\text{s}$ ultrasonic trigger pulse for presence detection |
| **`GPIO 13`** | **Ultrasonic `ECHO`** | $3.3\text{V}$ Input | Receives pulse duration ($1\text{k}\Omega / 2\text{k}\Omega$ voltage divider protected) |
| **`GPIO 14`** | **Solenoid Flush Pump** | $3.3\text{V}$ Output (Active LOW) | Triggers optocoupled relay driving the 12V high-flow solenoid valve |
| **`GPIO 27`** | **UV-C Disinfection Lamp** | $3.3\text{V}$ Output (Active LOW) | Triggers optocoupled relay driving the 254nm germicidal lamp |
| **`GPIO 25`** | **Motorized Lid Servo** | $3.3\text{V}$ PWM (50Hz) | Position servo control ($0^\circ$ Open, $180^\circ$ Closed) |
| **`GPIO 32`** | **Water Flow Meter** | $3.3\text{V}$ Input (`PULLUP`) | Hardware interrupt pin counting pulses from YF-S201 Hall sensor |
| **`GPIO 2`**  | **Status Indicator LED** | $3.3\text{V}$ Output | Diagnostic LED (Fast blink = WiFi drop, Slow blink = MQTT drop, Solid = Operational) |

### Electrical Schematics & Power Isolation

> [!CAUTION]
> **Power Rail Isolation Rule**: Never power high-current inductive loads (servos, solenoid valves, pumps) directly from the ESP32's onboard $3.3\text{V}$ or $5\text{V}$ pins.
> * **Dedicated Servo Power**: Power the servo from an external regulated **$5\text{V} \ge 2\text{A}$ power supply**. Tie external GND and ESP32 GND together.
> * **Decoupling Capacitors**: Solder a **$470\mu\text{F} - 1000\mu\text{F}$ 16V electrolytic capacitor** across the $5\text{V}$ and $\text{GND}$ rails close to the servo to absorb current surges during movement.
> * **Echo Voltage Divider**: When using standard $5\text{V}$ HC-SR04 sensors, step down the `ECHO` line with a **$1\text{k}\Omega$ (series)** and **$2\text{k}\Omega$ (to GND)** resistor divider to safeguard `GPIO 13` from $5\text{V}$ damage.

### 7-State Finite State Machine (FSM)

The ESP32 firmware operates on a deterministic non-blocking finite state machine:

```mermaid
stateDiagram-v2
    [*] --> STANDBY: Power On / Reboot
    
    STANDBY --> PERSON_DETECTED: Distance < 30cm (Debounced)
    PERSON_DETECTED --> LID_OPEN: Servo moves to 0°
    
    LID_OPEN --> WAITING_FOR_DEPARTURE: Grace period (5s) passes
    
    WAITING_FOR_DEPARTURE --> WAITING_FOR_DEPARTURE: Person still present (Reset departure timer)
    WAITING_FOR_DEPARTURE --> LID_CLOSING: Person absent for > 3000ms
    
    LID_CLOSING --> FLUSHING: Servo moves to 180° + 500ms settle
    
    FLUSHING --> UV_ACTIVE: Flush duration (3s) expires -> Pump OFF
    
    UV_ACTIVE --> STANDBY: UV cycle (5s) expires -> UV OFF -> Clear sensor buffer
```

#### State Machine Timing Constants:
* **`DETECTION_THRESHOLD_CM`** ($30\text{ cm}$): Proximity threshold that confirms presence.
* **`SENSOR_GRACE_MS`** ($5000\text{ ms}$): Post-lid opening sensor blackout window preventing false triggers caused by lid deflection.
* **`PERSON_GONE_CONFIRM_MS`** ($3000\text{ ms}$): Debounce duration confirming occupant has departed before closing the lid.
* **`PUMP_DURATION_MS`** ($3000\text{ ms}$): Solenoid flush valve open duration.
* **`UV_DURATION_MS`** ($5000\text{ ms}$): Automated germicidal disinfection cycle duration.
* **`STANDBY_SETTLE_MS`** ($2000\text{ ms}$): Post-cycle sensor buffer refill duration.

---

## 📡 MQTT Protocol & Telemetry Schema

### Sensor Telemetry Topics

#### 1. Ultrasonic Distance Telemetry
* **Topic**: `toilet/sensors/ultrasonic`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "distance": 45.2,
    "unit": "cm",
    "timestamp": 1724508400000
  }
  ```

#### 2. Water Flow Consumption Event
* **Topic**: `toilet/sensors/waterflow`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "volume": 1.45,
    "duration": 3.0,
    "unit": "L"
  }
  ```

### Operational Event Topics

| Topic | Payload Format | Description |
| :--- | :--- | :--- |
| `toilet/events/lid` | `{"status": "open" \| "closed", "timestamp": 1724508400000}` | Dispatched upon servo movement completion |
| `toilet/events/pump` | `{"status": "active" \| "inactive", "timestamp": 1724508400000}` | Dispatched when the solenoid flush valve fires |
| `toilet/events/uv` | `{"duration": 5, "completed": true, "timestamp": 1724508400000}` | Dispatched upon UV-C germicidal cycle completion |

### Remote Actuation Command Topics

Commands dispatched from the Web Dashboard to the hardware via HiveMQ:

| Command Topic | Payload Format | Description |
| :--- | :--- | :--- |
| `toilet/commands/pump` | `"ON"` or `"OFF"` | Actuates the 12V Solenoid Flush Valve |
| `toilet/commands/uv` | `"ON"` or `"OFF"` | Starts / aborts the 254nm UV-C Disinfection Lamp |
| `toilet/commands/lid` | `"OPEN"` or `"CLOSE"` | Moves the Servo to open ($0^\circ$) or closed ($180^\circ$) position |
| `toilet/commands/config` | `{"pumpDuration": 3, "uvDuration": 5, "threshold": 30}` | Over-the-air calibration update |
| `toilet/commands/reset` | `"REBOOT"` | Executes an onboard watchdog software reset |

---

## 🖥️ Complete Web Application Pages Guide

The Klir web application is built with the **Next.js 16 App Router**. Below is an exhaustive breakdown of every route and view:

```mermaid
flowchart TD
    Root["/ (Landing Page)"] --> PublicReport["/report/[deviceId]\n(Public QR Stall Reporting)"]
    Root --> Portal["/portal-admin/*\n(Staff Authentication)"]
    Portal --> Dashboard["/dashboard\n(Operations Command Center)"]
    Dashboard --> Analytics["/analytics\n(Facility Intelligence)"]
    Dashboard --> Alerts["/alerts\n(Incident Alarms)"]
    Dashboard --> Tasks["/tasks\n(Work Order Hub)"]
    Dashboard --> Config["/configuration\n(Automation & Batch QR)"]
    Dashboard --> IssueReports["/issue-reports\n(Admin Moderation)"]
    Dashboard --> Reports["/reports\n(Compliance Exports)"]
    Dashboard --> Profile["/profile\n(User Settings)"]
```

---

### 1. Public Institutional Landing (`/`)
* **URL Route**: `/`
* **Target Audience**: Campus visitors, students, general public, and unauthenticated staff.
* **Purpose**: Serves as the public face of the Klir platform at SDCA. Informs visitors about the touchless sanitation system and directs anyone needing to report an issue to the QR code sticker located on the stall.
* **Key Features**:
  * Clean, responsive presentation of SDCA Digital Campus hygiene standards.
  * Automatic redirection to `/dashboard` if an active session or presentation cookie is detected.
  * Guidance on locating stall QR codes for frictionless mobile reporting.

---

### 2. Public QR Stall Incident Reporting (`/report/[deviceId]`)
* **URL Route**: `/report/[deviceId]` (e.g. `/report/SDCA-FL1-CANTEEN-M-S1`)
* **Target Audience**: Students, faculty, and campus visitors who scan a physical stall QR code sticker.
* **Purpose**: Provides a zero-login, frictionless reporting interface to report restroom issues directly from any smartphone browser.
* **Key Features**:
  * **Categorized Issue Selector**: Fast 1-tap selection for Common Faults:
    * `lid_malfunction` (Lid Malfunction)
    * `no_water` (No Water / Supply Dry)
    * `continuous_leak` (Continuous Plumbing Leak)
    * `uv_light_failure` (UV-C Light Failure)
    * `blockage_or_dirty` (Blockage or Unsanitary)
    * `physical_damage` (Physical Fixture Damage)
    * `other` (Other Facility Concern)
  * **Live In-Browser Camera Capture**: Users can snap a real-time photo of the issue directly with their camera (prevents uploading arbitrary fake gallery photos).
  * **Anti-Spam Deduplication Lock**: When a report is pending for a stall, subsequent scans inform the user: *"Maintenance is already scheduled for this stall"* with real-time status updates.
  * **Client IP & Browser Fingerprinting**: Protects the API against automated abuse.

---

### 3. Staff & Administrative Portal (`/portal-admin/*`)
* **URL Routes**:
  * `/portal-admin/login`: Secure staff login with password strength enforcement and brute-force rate limiting.
  * `/portal-admin/register`: Staff account registration with RFC email validation and default `pending` role.
  * `/portal-admin/forgot-password`: Self-service password reset email request.
  * `/portal-admin/reset-password`: Secure password confirmation with token validation.
* **Target Audience**: Custodial technicians, facility supervisors, campus administrators.
* **Security Controls**:
  * Passwords checked against **Have I Been Pwned (HIBP)** database ($>600\text{M}$ breached passwords blocked).
  * Rate-limited endpoints (10 attempts per 15 minutes).
  * Persistent sessions via Firebase Auth with role resolution.

---

### 4. Operations Command Center (`/dashboard`)
* **URL Route**: `/dashboard`
* **Target Audience**: Campus facility administrators and lead supervisors.
* **Purpose**: Real-time operations cockpit displaying live hardware state, telemetry, actuator controls, and custodial queues.
* **Key Components**:
  * **Stat Cards (`StatCards.tsx`)**: High-impact KPI widgets displaying:
    * Total Campus Flushes (Today & Cumulative)
    * Water Conserved (Liters saved vs traditional flush fixtures)
    * Completed UV-C Disinfection Cycles
    * Active Hardware Online / Offline Link Health
  * **Searchable Restroom Combobox (`ToiletUnitSelect.tsx`)**: Floor-grouped fuzzy combobox allowing instantaneous switching between all 22 campus restrooms and 96 stalls.
  * **Hardware Actuator Remote Control (`ControlPanel.tsx`)**:
    * Manual Flush solenoid valve trigger (`ON` / `OFF`)
    * Manual UV-C germicidal cycle start/abort
    * Motorized Lid Open / Close toggle
    * Hardware Watchdog Controller Reboot
    * **Poka-Yoke Double-Action Safety Modals**: Requires explicit slide-to-confirm and ultrasonic occupancy interlocks.
  * **Supervisor QA Audit Inspection Log**: Real-time table displaying finished technician tasks with photo proof, complete with 1-click **Approve** or **Flag for Recheck** actions.
  * **Live Activity Feed (`ActivityFeed.tsx`)**: Chronological event stream of sensor triggers, actuator events, and maintenance acknowledgments.

---

### 5. Telemetry & Facility Intelligence Analytics (`/analytics`)
* **URL Route**: `/analytics`
* **Target Audience**: Facilities managers, sustainability directors, and executive leadership.
* **Purpose**: Deep analytical exploration of restroom traffic, water usage, and sanitation compliance.
* **Key Visualizations**:
  * **Interactive Date Filtering**: 1-click presets (`Today`, `Last 7 Days`, `Last 30 Days`) plus custom calendar range selection.
  * **Water Usage & Consumption Area Charts**: Hourly and daily water volume curves with leak baseline references.
  * **Peak Traffic Heatmap & Hourly Flush Curve**: Pinpoints exact campus peak hours to optimize custodial shift scheduling.
  * **Floor-by-Floor Flush Distribution Bar Chart**: Compares 1F Canteen & Faculty vs 2F, 3F, and 4F wings to detect heavily utilized restrooms.
  * **Sustainability Impact Metrics**: Real-time computation of cubic meters of water saved and institutional utility bill reduction.

---

### 6. Incident Alarms & Alert Triage (`/alerts`)
* **URL Route**: `/alerts`
* **Target Audience**: On-duty supervisors and maintenance staff.
* **Purpose**: Centralized incident response center for hardware faults, water overuse, and overdue maintenance tasks.
* **Key Capabilities**:
  * **Severity-Grouped Triage**: Filter alarms by `Critical` (leaks, sensor offline), `Warning` (high usage threshold), or `Info`.
  * **1-Click Batch Acknowledgment**: Resolve individual alarms or click **Acknowledge All** to clear incident queues.
  * **Overdue Task Warnings**: Automatically highlights maintenance tasks that remain unacknowledged for $>30\text{ minutes}$.

---

### 7. Custodial Work Orders & Task Management (`/tasks`)
* **URL Route**: `/tasks`
* **Target Audience**: Custodial supervisors and maintenance technicians.
* **Purpose**: Full-screen, dedicated work order dispatch and lifecycle tracking system.
* **Work Order Lifecycle**:
  1. `unassigned` / `pending`: Created via automation or supervisor dispatch.
  2. `acknowledged`: Technician accepted the task on their mobile app.
  3. `completed`: Technician submitted custodial checklist and uploaded before/after photo proof.
  4. `flagged`: Supervisor inspected photo proof and rejected the work with mandatory remarks.
  5. `rechecking`: Technician accepted the rejection and committed to re-cleaning.

---

### 8. System Configuration & Automation Rules (`/configuration`)
* **URL Route**: `/configuration`
* **Target Audience**: System Administrators (`admin` role only).
* **Purpose**: Control center for tuning automation parameters, managing device hardware, and printing campus QR stickers.
* **Key Modules**:
  * **Hardware Timing Configuration**: Calibrate Solenoid Pump Duration ($1-10\text{s}$), UV-C Disinfection Cycle ($3-30\text{s}$), and Departure Debounce Delay ($1-10\text{s}$).
  * **Automation Rules Engine**: Configure threshold rules:
    * *Usage-Based Dispatch*: Auto-create task when flushes exceed $N$ cycles.
    * *Continuous Flow Leak Alarm*: Trigger critical alert when flow $>0.5\text{ L/min}$ for $>45\text{s}$.
    * *Component Wear Counter*: Alert when actuator duty cycles approach rated lifespan.
  * **Campus Batch QR Generator (`CampusBatchQrModal.tsx`)**: Generate and print standardized, high-contrast QR code stickers for all 96 stalls across all campus floors with 1 click.
  * **Public Reporting Toggle**: Enable or disable QR reporting per device.

---

### 9. Community Issue Moderation (`/issue-reports`)
* **URL Route**: `/issue-reports`
* **Target Audience**: System Administrators (`admin` role only).
* **Purpose**: Review, verify, and act on crowdsourced issue reports submitted by students and faculty via stall QR codes.
* **Key Features**:
  * **Status Triage Tabs**: Quick tabs for `Pending Review`, `Confirmed`, and `Dismissed`.
  * **Photo Evidence Viewer**: Inspect high-resolution photo evidence captured during report submission.
  * **Confirm & Auto-Dispatch**: 1-click confirmation converts the report into a high-priority custodial maintenance work order linked to that stall.
  * **Dismiss Spam**: Flag false alarms or duplicate submissions to unlock the stall for future reports.

---

### 10. Multi-Format Compliance & Export Engine (`/reports`)
* **URL Route**: `/reports`
* **Target Audience**: Campus administrators, audit teams, facility directors.
* **Purpose**: Generates institutional-grade compliance and facility auditing reports.
* **Supported Export Types**:
  * **Usage Summary Report**: Aggregated flushes, water volume, and UV cycles.
  * **Maintenance Tasks Summary**: Full history of work orders, completion times, and technician performance.
  * **Supervisor QA Audit Log**: Inspection records, approval rates, and flagged re-cleaning logs.
* **Output Formats**:
  * **PDF**: Client-side compiled via `@react-pdf/renderer` with official SDCA institutional letterhead.
  * **CSV**: Structured spreadsheet data for Microsoft Excel or Google Sheets.
  * **JSON**: Raw telemetry feeds for external data pipelines.

---

### 11. User Profile & Preferences (`/profile`)
* **URL Route**: `/profile`
* **Target Audience**: All authenticated users.
* **Purpose**: View account credentials, role claims (`admin`, `supervisor`, `maintenance`), update security passwords, and customize theme settings (Light / Dark mode).

---

## ⚙️ Core Platform Features Deep Dive

### 1. Autonomous Touchless Sanitation
The ESP32 microcontroller continuously polls the HC-SR04 ultrasonic sensor. When a user approaches within $30\text{ cm}$, the motorized servo swings open the lid ($0^\circ$). When the user departs and is absent for $>3000\text{ ms}$, the lid closes ($180^\circ$), the 12V solenoid valve fires a measured 3-second flush, and the 254nm UV-C lamp illuminates for 5 seconds to neutralize airborne droplets and bowl pathogens.

### 2. Continuous Telemetry Ingestion & Watchdog Monitor
Because serverless runtimes kill long-lived TCP connections, Klir runs a dedicated **`mqtt-listener`** service on Railway. It maintains a 24/7 TLS connection to HiveMQ Cloud. A built-in watchdog monitors device heartbeats; if an ESP32 fails to check in within 60 seconds, the device is flagged as offline and an alert is issued.

### 3. Closed-Loop Supervisor QA Audit Workflow
To prevent "ghost cleaning" (technicians marking tasks complete without cleaning), Klir enforces closed-loop QA:
1. Technician finishes work, checks off tasks, and snaps a live photo.
2. The task enters the **Supervisor QA Queue**.
3. The supervisor audits the submission using zero-scroll quick filter tabs:
   * **Approve (✓)**: Formally closes the work order.
   * **Flag (⚠️)**: Rejects the task with mandatory remarks (e.g. *"Mirror uncleaned, restock hand soap"*).
   * The technician must accept the re-inspection and re-clean the facility.

### 4. Automated Dispatch & Leak Anomaly Engine
The system processes continuous flow meter pulses. If water flows continuously at $>0.5\text{ L/min}$ for $>45\text{ seconds}$ outside of an active flush cycle, the engine:
1. Logs a **Critical Leak Alert** in Cloud Firestore.
2. Dispatches an emergency plumbing work order to the assigned floor technician.
3. Broadcasts high-priority Firebase Cloud Messaging (FCM) push alerts to custodial mobile phones.

### 5. Campus Batch QR Generator & Printable Sheets
Facility managers can open the **Batch QR Modal** from `/configuration` to generate print-ready SVG QR codes for all 96 stalls. The generator automatically:
* Formats stickers with official SDCA campus headers and color-coded floor tags.
* Employs CSS `@media print` rules with `break-inside: avoid` for standard sticker label sheets.
* Caches generated QR codes in memory to prevent browser re-rendering lag.

### 6. Double-Action Actuator Safety Locks (Poka-Yoke)
To prevent accidental activation of high-voltage UV-C lamps or plumbing valves:
* Remote commands require a **double-action confirmation modal** with explicit slide-to-confirm triggers.
* **Ultrasonic Interlock**: If the ultrasonic sensor detects a person in the stall, manual UV-C triggering is automatically hardware-disabled to eliminate UV radiation risks.
* Sensitive configuration changes require administrative password re-verification.

---

## 🔐 Role-Based Access Control (RBAC) & Security Architecture

Klir enforces strict server-side RBAC using Firebase Custom Claims and JWT Bearer verification on every protected route:

| Platform Resource / Capability | `admin` | `supervisor` | `maintenance` | `viewer` | `public` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Public Stall QR Issue Reporting** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Web Dashboard Access** | ✅ Full | ✅ Full | ⚠️ Feed Only | 👁️ Read-Only | ❌ No |
| **Custodial Mobile App Access** | ❌ Blocked | ✅ Audit Hub | ✅ Workspace | ❌ Blocked | ❌ No |
| **Create & Dispatch Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Acknowledge & Complete Tasks** | ❌ No | ❌ Audit Only | ✅ Checklist+Photo | ❌ No | ❌ No |
| **Approve / Flag QA Inspections** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Hardware Actuator Overrides** | ✅ Full | ✅ Full | ❌ No | ❌ No | ❌ No |
| **Moderate Public Issue Reports** | ✅ Full | ❌ No | ❌ No | ❌ No | ❌ No |
| **Manage Automation Rules** | ✅ Edit / Create | 👁️ View Only | ❌ No | ❌ No | ❌ No |
| **Export Compliance Reports (PDF/CSV)** | ✅ Yes | ✅ Yes | ❌ No | 👁️ View Only | ❌ No |

### Enterprise Security Safeguards (OWASP 2026):
* **No Token Storage in Cookies**: Prevents Cross-Site Scripting (XSS) session hijacking by storing auth tokens in Firebase's internal IndexedDB storage.
* **Per-IP & Per-User Rate Limiting**: All critical API endpoints are protected by `lib/rate-limit.ts` to thwart brute-force and DDoS attacks.
* **Strict Zod Input Validation**: Every request payload is strictly sanitized against Zod schemas in `lib/schemas.ts`.
* **CORS Origin Whitelisting**: Strict origin headers reject unauthorized cross-domain API calls.

---

## 📋 Comprehensive REST API Reference (48 Endpoints)

All API endpoints are located under `/api/` and require an `Authorization: Bearer <ID_TOKEN>` header (except public endpoints).

### 1. Actuators & Remote Overrides (5 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/actuators/pump` | `admin`, `supervisor` | Manually fire solenoid flush valve (`"ON"` / `"OFF"`) |
| `POST` | `/api/actuators/uv` | `admin`, `supervisor` | Start / abort manual UV-C disinfection cycle |
| `POST` | `/api/actuators/lid/open` | `admin`, `supervisor` | Move servo motor to open lid ($0^\circ$) |
| `POST` | `/api/actuators/lid/close` | `admin`, `supervisor` | Move servo motor to close lid ($180^\circ$) |
| `POST` | `/api/actuators/reset` | `admin`, `supervisor` | Issue hardware watchdog software reset |

### 2. Alarms & Incident Triage (3 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/alerts` | `admin`, `supervisor`, `maintenance`, `viewer` | Query active and historical threshold alarms |
| `POST` | `/api/alerts/[id]/acknowledge` | `admin`, `supervisor`, `maintenance` | Mark an individual alert as resolved |
| `POST` | `/api/alerts/acknowledge-all` | `admin`, `supervisor` | Batch acknowledge all unresolved alerts |

### 3. Analytics & Telemetry (4 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/analytics/dashboard` | `admin`, `supervisor`, `maintenance`, `viewer` | Top-level KPI counts for the executive dashboard |
| `GET` | `/api/analytics/flush-patterns` | `admin`, `supervisor`, `maintenance`, `viewer` | Hourly flush distribution across building floors |
| `GET` | `/api/analytics/water-usage` | `admin`, `supervisor`, `maintenance`, `viewer` | Water consumption and conservation estimates |
| `GET` | `/api/analytics/system-performance` | `admin`, `supervisor`, `maintenance`, `viewer` | MQTT latency, uptime, and controller health |

### 4. Authentication & Staff Identity (6 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | Public | Authenticate user and issue session token |
| `POST` | `/api/auth/register` | Public | Register new staff account (password checked against HIBP) |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate current user session |
| `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user profile and RBAC role |
| `POST` | `/api/auth/password-reset/request` | Public | Request password reset verification link |
| `POST` | `/api/auth/password-reset/confirm` | Public | Complete password reset with verification code |

### 5. Automation Rules Engine (5 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/automation-rules` | `admin`, `supervisor` | List automated threshold dispatch rules |
| `POST` | `/api/automation-rules` | `admin` | Create a new automated dispatch rule |
| `PUT` | `/api/automation-rules/[id]` | `admin` | Update rule thresholds, intervals, or status |
| `DELETE` | `/api/automation-rules/[id]` | `admin` | Delete an automation rule |
| `POST` | `/api/automation-rules/[id]/reset-counter` | `admin`, `supervisor` | Reset trigger cycle activation counter |

### 6. Campus Devices & Roster (6 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/devices` | `admin`, `supervisor`, `maintenance`, `viewer` | List all registered SDCA restroom devices |
| `POST` | `/api/devices` | `admin` | Register a new restroom device or stall |
| `GET` | `/api/devices/[id]` | `admin`, `supervisor`, `maintenance`, `viewer` | Fetch device hardware specifications and configuration |
| `PUT` | `/api/devices/[id]` | `admin` | Update device settings (e.g. enable public QR reporting) |
| `GET` | `/api/devices/[id]/status` | `admin`, `supervisor`, `maintenance`, `viewer` | Real-time ESP32 online/offline connectivity |
| `GET` | `/api/maintenance-personnel` | `admin`, `supervisor`, `maintenance`, `viewer` | Real-time technician roster with live workload counts |

### 7. Custodial Notes (2 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/maintenance-notes` | `admin`, `supervisor`, `maintenance`, `viewer` | Query custodial log entries for a restroom |
| `POST` | `/api/maintenance-notes` | `admin`, `supervisor`, `maintenance` | Add custodial note to a restroom or work order |

### 8. Public QR Stall Issue Reporting (6 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/public/issue-reports` | Public | Submit stall issue report with live camera photo proof |
| `GET` | `/api/issue-reports` | `admin` | Query crowdsourced reports by status |
| `POST` | `/api/issue-reports/[id]/confirm` | `admin` | Confirm report and automatically dispatch work order |
| `POST` | `/api/issue-reports/[id]/dismiss` | `admin` | Dismiss invalid or duplicate report |
| `GET` | `/api/issue-reports/[id]/evidence/[submissionId]` | `admin` | Stream captured photo evidence from cloud storage |
| `POST` | `/api/cron/public-issue-report-jobs` | Cron Secret | Automated recovery and escalation background job |

### 9. Compliance Reports & PDF Exports (2 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/reports/generate` | `admin`, `supervisor` | Compile performance audit report |
| `GET` | `/api/reports/[id]/download` | `admin`, `supervisor`, `viewer` | Download compiled compliance PDF or CSV |

### 10. Sensor Telemetry & Calibration (3 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/sensors/[id]/readings` | `admin`, `supervisor`, `maintenance`, `viewer` | Historical time-series sensor data |
| `GET` | `/api/sensors/[id]/stats` | `admin`, `supervisor`, `maintenance`, `viewer` | Aggregated sensor statistics and averages |
| `POST` | `/api/sensors/[id]/config` | `admin` | Update sensor sampling rate and debounce thresholds |

### 11. Supervisor QA & Work Order Dispatch (12 Endpoints)
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/tasks` | `admin`, `supervisor`, `maintenance` | Query work orders with status, priority, and assignee filters |
| `POST` | `/api/tasks` | `admin`, `supervisor` | Create and assign a maintenance work order with auto-enrichment |
| `POST` | `/api/tasks/create` | `admin`, `supervisor` | Alternate dispatch route with device metadata resolution |
| `GET` | `/api/tasks/[id]` | `admin`, `supervisor`, `maintenance` | Retrieve single task record and timeline history |
| `PUT` | `/api/tasks/[id]` | `admin`, `supervisor` | Update task instructions, priority, or assigned personnel |
| `DELETE` | `/api/tasks/[id]` | `admin`, `supervisor` | Permanently delete a work order |
| `POST` | `/api/tasks/[id]/acknowledge` | `maintenance` | Record technician acknowledgment timestamp |
| `POST` | `/api/tasks/[id]/accept-recheck` | `maintenance` | Acknowledge flagged task and commit to re-cleaning |
| `POST` | `/api/tasks/[id]/complete` | `maintenance` | Submit completion checklist, notes, and photo proof |
| `POST` | `/api/tasks/register-token` | `maintenance`, `supervisor` | Register device FCM push notification token |
| `POST` | `/api/tasks/cleanup-spam` | `admin`, `supervisor` | Batch cleanup of legacy automated spam tasks |
| `POST` | `/api/supervisor/approve-task` | `admin`, `supervisor` | Formally approve a completed maintenance task |
| `POST` | `/api/supervisor/flag-task` | `admin`, `supervisor` | Flag task with mandatory reason requiring re-inspection |
| `POST` | `/api/supervisor/reassign-task` | `admin`, `supervisor` | Reallocate work order to another technician |

---

## 🎨 Design System & Accessibility (WCAG 2.2 AA)

The web dashboard is styled according to the **SDCA Institutional Brand Palette** and fully conforms to **WCAG 2.2 Level AA Accessibility Standards**.

### SDCA Color Tokens

| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| **`sdca-red`** | `#B5121B` | Primary action buttons, brand headers, active tab highlights |
| **`sdca-darkred`** | `#8F0D16` | Hover states, brand accents, modal header gradients |
| **`sdca-gold`** | `#C9A227` | Accent badges, focus rings, warning indicators |
| **`hydro-cyan`** | `#0284C7` | Water telemetry, flow rate indicators, dual-flush badges |
| **`sanitize-indigo`** | `#6366F1` | UV-C disinfection indicators and status pill badges |
| **`operational-green`** | `#10B981` | Online heartbeat status, completed task badges, QA approved chip |
| **`advisory-amber`** | `#F59E0B` | Pending task alerts, maintenance notifications, QA pending chip |
| **`critical-crimson`** | `#EF4444` | Sensor anomaly alarms, continuous leak warnings, QA flagged chip |

### Accessibility Features:
* **WCAG 1.4.3 (Contrast Minimum)**: All text elements exceed $4.5:1$ contrast against light and dark backgrounds.
* **WCAG 1.4.10 (Reflow)**: Responsive layouts adapt down to $320\text{px}$ without clipping text or requiring dual-axis scrolling.
* **WCAG 2.1.1 (Keyboard Navigation)**: Full keyboard support (`Tab`, `ArrowKeys`, `Enter`, `Esc`) across all modals, comboboxes, and tables.
* **WCAG 4.1.2 (Name, Role, Value)**: Complete ARIA landmarks (`role="combobox"`, `role="listbox"`, `aria-live="polite"`) across dynamic telemetry feeds.

---

## ⚙️ Local Installation & Development Setup

### 1. Prerequisites
* **Node.js**: `v20.x` or `v22.x` (LTS)
* **npm**: `v10.x` or higher
* **Firebase Project**: Firestore, Authentication, and Firebase Storage enabled
* **HiveMQ Cloud Cluster**: Port 8883 (TLS enabled)

### 2. Clone & Install Dependencies
```powershell
# Clone the repository
git clone https://github.com/JamesCarl04/Smart-Flush-Web-App.git
cd Smart-Flush-Web-App

# Install Next.js root web dependencies
npm install

# Install standalone MQTT listener dependencies
cd mqtt-listener
npm install
cd ..
```

### 3. Configure Environment Variables
Create `.env` in the root directory:

```env
# ── Public Firebase Client SDK ──────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=klir-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=klir-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=klir-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=526260279429
NEXT_PUBLIC_FIREBASE_APP_ID=1:526260279429:web:...

# ── Firebase Admin SDK (Server-Side) ────────────────────────
FIREBASE_ADMIN_PROJECT_ID=klir-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@klir-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ...\n-----END PRIVATE KEY-----\n"

# ── HiveMQ Cloud MQTT Broker ────────────────────────────────
MQTT_BROKER_URL=ffc98acba62649a5b591fc33df78cc7a.s1.eu.hivemq.cloud
MQTT_USERNAME=hardware_push
MQTT_PASSWORD=YourMqttPassword
MQTT_PORT=8883
MQTT_DEVICE_ID=toilet-01
```

Create `mqtt-listener/.env` for the background ingestion worker:
```env
MQTT_BROKER_URL=ffc98acba62649a5b591fc33df78cc7a.s1.eu.hivemq.cloud
MQTT_USERNAME=hardware_push
MQTT_PASSWORD=YourMqttPassword
MQTT_PORT=8883
MQTT_DEVICE_ID=toilet-01
FIREBASE_ADMIN_PROJECT_ID=klir-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@klir-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ...\n-----END PRIVATE KEY-----\n"
```

### 4. Run Development Servers
Run both the Web Dashboard and the MQTT Ingestion Listener concurrently:
```powershell
npm run dev
```

Or run them individually in separate terminal sessions:
```powershell
# Terminal 1: Next.js Web Dashboard with Turbopack (Port 3000)
npm run dev:web

# Terminal 2: MQTT Listener Background Ingestion Bridge
npm run dev:listener
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Production Deployment Architecture (Vercel + Railway)

Because serverless environments terminate long-lived TCP connections, the production deployment is decoupled:

| Service Component | Hosting Platform | Runtime Model | Responsibility |
| :--- | :--- | :--- | :--- |
| **Web Dashboard & API Routes** | **Vercel** | Serverless Edge / Node.js | User authentication, REST API routes, dashboard UI, actuator command dispatch |
| **MQTT Ingestion Worker** | **Railway** | 24/7 Persistent Container | Long-lived TLS MQTT connection to HiveMQ, Firestore ingestion, FCM push alerts |

### Deploying the MQTT Listener to Railway:
1. Connect this repository to [Railway.app](https://railway.app).
2. Set **Root Directory** to `mqtt-listener`.
3. Set **Start Command** to `npm run start:prod`.
4. Copy the environment variables from `mqtt-listener/.env` into Railway's Variables settings.

---

## 🧪 Testing, Diagnostics & Code Quality

```powershell
# Run Jest unit and integration test suites (315 tests passing across 39 suites)
npm run test:ci

# Run Jest in watch mode during development
npm test

# Run Playwright End-to-End browser tests
npm run test:e2e

# Run ESLint validation
npm run lint

# Run security vulnerability audit
npm run test:security
```

---

## 🪟 Hardware & Windows Troubleshooting Guide

### 1. Arduino IDE Upload Error (`COM port is busy` / `PermissionError 13`)
* **Cause**: The Arduino Serial Monitor or another terminal is holding the COM port.
* **Fix**: Close the Serial Monitor before clicking **Upload (➔)**. If still locked, unplug and replug the USB cable.

### 2. ESP32 Bootloader Mode (Manual Flash)
* When Arduino shows `Connecting........_____........`:
* Press and hold the **`BOOT` (IO0)** button on the ESP32 for 2 seconds, then release.

### 3. Garbled Characters on Serial Monitor
* **Cause**: Baud rate mismatch or voltage drops during WiFi transmission.
* **Fix**:
  1. Confirm baud rate is set to `115200` in the Serial Monitor.
  2. Add `Serial.flush()` before network calls.
  3. Power the servo from an external $5\text{V} \ge 2\text{A}$ supply with a $470\mu\text{F}$ capacitor.

### 4. PowerShell Script Execution Policy Blocker
If Windows blocks running `npm` or `node` scripts:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

### 5. Firebase Admin Private Key Formatting
When configuring `FIREBASE_ADMIN_PRIVATE_KEY` in `.env`, ensure newline characters (`\n`) are preserved:
```env
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

---

## 📂 Repository Directory & File Map

```text
Smart-Flush-Web-App/
├── app/
│   ├── (dashboard)/                     # Protected dashboard pages
│   │   ├── alerts/page.tsx              # System alarms & threshold incident logs
│   │   ├── analytics/page.tsx           # Water usage & flush frequency analytics
│   │   ├── configuration/page.tsx       # Automation rules, device registry & batch QR
│   │   ├── dashboard/page.tsx           # Operations command center & dispatch
│   │   ├── issue-reports/page.tsx       # Admin-only public report triage & photo review
│   │   ├── profile/page.tsx             # User account & notification preferences
│   │   ├── reports/page.tsx             # PDF/CSV compliance audit report generator
│   │   ├── tasks/page.tsx               # Dedicated full-width work orders hub
│   │   └── layout.tsx                   # Dashboard navigation, header & live badges
│   ├── api/                             # 48 Next.js App Router API endpoints
│   │   ├── actuators/                   # Pump, UV, Lid open/close, reset routes
│   │   ├── alerts/                      # Alarm querying & acknowledgment
│   │   ├── analytics/                   # Aggregated metrics for telemetry charts
│   │   ├── auth/                        # Login, registration, password reset routes
│   │   ├── automation-rules/            # Threshold rule configuration
│   │   ├── cron/                        # Public issue report recovery & escalation jobs
│   │   ├── devices/                     # SDCA device registry & real-time status
│   │   ├── issue-reports/               # Community report moderation & photo evidence
│   │   ├── maintenance-notes/           # Restroom custodial log entries
│   │   ├── maintenance-personnel/       # Real-time technician roster queries
│   │   ├── public/                      # Zero-login QR stall issue submission
│   │   ├── reports/                     # PDF generation and download
│   │   ├── sensors/                     # Sensor readings and calibration config
│   │   ├── supervisor/                  # Supervisor approve, flag & reassign routes
│   │   └── tasks/                       # Task CRUD, acknowledge, complete, cleanup
│   ├── portal-admin/                    # Staff login, registration, password reset
│   ├── report/[deviceId]/               # Public mobile stall QR issue report page
│   ├── globals.css                      # Tailwind styling & custom scrollbars
│   ├── layout.tsx                       # Root HTML shell & auth provider wrapper
│   └── page.tsx                         # Public institutional landing page
├── components/                          # Reusable UI components
│   ├── configuration/                   # QR generation and public reporting controls
│   │   ├── CampusBatchQrModal.tsx       # Print-ready QR sheet generator for 96 stalls
│   │   └── PublicReportingControls.tsx  # Device QR preview and enable/disable toggle
│   └── dashboard/                       # Specialized operations UI components
│       ├── ActivityFeed.tsx             # Live stream of telemetry & task events
│       ├── ControlPanel.tsx             # Actuator buttons with safety modals
│       ├── DashboardToast.tsx           # Non-blocking accessible toast alerts
│       ├── MaintenanceTaskPanel.tsx     # Dispatch form & live task status feed
│       ├── RestroomMaintenanceNotes.tsx # Restroom notes history modal
│       ├── StatCards.tsx                # Metric KPI cards (Flushes, Water, UV)
│       └── ToiletUnitSelect.tsx         # Modern searchable floor-grouped combobox
├── hooks/                               # Custom React hooks
│   ├── useAlerts.ts                     # Real-time alarm subscription
│   ├── useAnalytics.ts                  # Metric aggregation & date filtering hook
│   ├── useAuth.ts                       # Firebase user state & role resolution
│   ├── useDeviceStatus.ts               # Real-time ESP32 link monitor
│   ├── useMaintenancePersonnel.ts       # Technician roster state hook
│   └── useTasks.ts                      # Live Firestore task snapshot subscription
├── lib/                                 # Server & client utility libraries
│   ├── admin-navigation.ts              # Dynamic sidebar item builder by role
│   ├── alert-engine.ts                  # Alert generation and threshold verification
│   ├── api-client.ts                    # Type-safe authenticated fetch wrapper
│   ├── auth-helpers.ts                  # Server-side token & RBAC verification
│   ├── automation-rule-config.ts        # Automation rule triggers and schemas
│   ├── fcm.ts                           # Firebase Cloud Messaging push alerts
│   ├── firebase-admin.ts                # Server Firebase Admin SDK singleton
│   ├── firebase.ts                      # Client Firebase SDK initialization
│   ├── pdf-report.tsx                   # Client-side compiled compliance PDF report
│   ├── public-issue-reports.ts          # Public report moderation and deduplication
│   ├── public-report-qr.ts              # QR code URL and filename generators
│   ├── rate-limit.ts                    # In-memory IP and user rate limiter
│   ├── restrooms.ts                     # Master directory of 22 rooms & 96 stalls
│   └── schemas.ts                       # Zod validation schemas for all requests
├── mqtt-listener/                       # Standalone 24/7 background listener service
│   ├── src/
│   │   ├── alert-engine.ts              # Evaluates rules and triggers alarms
│   │   ├── fcm.ts                       # Firebase Cloud Messaging push alerts
│   │   ├── firestore-writers.ts         # Writes sensor batches to Firestore
│   │   ├── hardware-counters.ts         # Maintenance hardware counter manager
│   │   ├── index.ts                     # Process bootstrap & graceful shutdown
│   │   └── mqtt-client.ts               # MQTT connection singleton & router
│   ├── package.json
│   └── tsconfig.json
├── types/                               # TypeScript domain type definitions
├── tailwind.config.ts                   # SDCA palette & DaisyUI theme configuration
├── tsconfig.json                        # TypeScript compiler options
└── package.json                         # Project dependencies and script runner
```

---

## 📄 License & Attribution

This project is proprietary software engineered for **St. Dominic College of Asia (SDCA)**.  
*© 2026 Klir Smart Flush Engineering Team. All rights reserved.*
