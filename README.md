# 🚽 Klir — Smart Flush Enterprise IoT & Custodial Dispatch Platform

> **Advanced Facility Telemetry, Automated Disinfection & Workforce Dispatch Platform**  
> *St. Dominic College of Asia (SDCA) Annex Campus Edition • Real-Time Sensor Telemetry, Actuator Safety Interlocks & Custodial QA Auditing*

[![Next.js](https://img.shields.io/badge/Next.js-16.1%20(Turbopack)-black.svg?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-4.12-5A0EF8.svg?logo=daisyui)](https://daisyui.com/)
[![Firebase](https://img.shields.io/badge/Firebase%20Admin-v13.7-orange.svg?logo=firebase)](https://firebase.google.com/)
[![MQTT](https://img.shields.io/badge/MQTT-HiveMQ%20Cloud%20TLS-red.svg?logo=mqtt)](https://www.hivemq.com/)
[![Tests](https://img.shields.io/badge/Jest%20Tests-67%2F67%20Passing-brightgreen.svg?logo=jest)](https://jestjs.io/)
[![WCAG](https://img.shields.io/badge/WCAG-2.2%20Level%20AA-green.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 📌 Table of Contents

1. [Executive Summary & Platform Capabilities](#-executive-summary--platform-capabilities)
2. [Master Campus Facility Directory (19 Units across 4 Floors)](#-master-campus-facility-directory-19-units-across-4-floors)
3. [End-to-End System Architecture & Telemetry Pipeline](#-end-to-end-system-architecture--telemetry-pipeline)
4. [Hardware & Microcontroller Specification (ESP32)](#-hardware--microcontroller-specification-esp32)
   - [GPIO Pinout Mapping Table](#gpio-pinout-mapping-table)
   - [Electrical Schematics & Power Rail Isolation](#electrical-schematics--power-rail-isolation)
   - [7-State Finite State Machine (FSM)](#7-state-finite-state-machine-fsm)
5. [MQTT Protocol & Real-Time Event Schema](#-mqtt-protocol--real-time-event-schema)
   - [Sensor Ingestion Topics & Payloads](#sensor-ingestion-topics--payloads)
   - [Actuation Command Topics](#actuation-command-topics)
6. [Core Web Application Modules](#-core-web-application-modules)
   - [1. Real-Time Telemetry & Operations Dashboard](#1-real-time-telemetry--operations-dashboard)
   - [2. Searchable Restroom Combobox (`ToiletUnitSelect`)](#2-searchable-restroom-combobox-toiletunitselect)
   - [3. Supervisor QA Audit & Inspection Log](#3-supervisor-qa-audit--inspection-log)
   - [4. Hardware Actuator Remote Control Center](#4-hardware-actuator-remote-control-center)
   - [5. Automated Rules Engine & Threshold Alarms](#5-automated-rules-engine--threshold-alarms)
   - [6. Multi-Format Reporting & Export Engine](#6-multi-format-reporting--export-engine)
7. [Role-Based Access Control (RBAC) & Security Architecture](#-role-based-access-control-rbac--security-architecture)
8. [Comprehensive REST API Reference (39 Endpoints)](#-comprehensive-rest-api-reference-39-endpoints)
9. [Design System & Accessibility Standards (WCAG 2.2 AA)](#-design-system--accessibility-standards-wcag-22-aa)
10. [Local Installation & Development Setup](#-local-installation--development-setup)
11. [Production Deployment Architecture (Vercel + Railway)](#-production-deployment-architecture-vercel--railway)
12. [Testing, Diagnostics & Code Quality](#-testing-diagnostics--code-quality)
13. [Hardware & Windows Troubleshooting Guide](#-hardware--windows-troubleshooting-guide)
14. [License & Attribution](#-license--attribution)

---

## 🏢 Executive Summary & Platform Capabilities

**Klir** (Smart Flush IoT System) is a full-stack, enterprise-grade hygiene and facility intelligence platform engineered for high-traffic institutional buildings, currently deployed across the **St. Dominic College of Asia (SDCA) Annex Building**.

### Key System Highlights:
* **Autonomous Touchless Sanitation**: ESP32 microcontrollers automatically handle ultrasonic presence detection, motorized lid opening, automated high-efficiency solenoid flush cycles, and post-use UV-C germicidal disinfection.
* **Live Telemetry & Anomaly Detection**: Continuous water volume measurement (liters), continuous leak detection ($>0.5\text{ L/min}$ for $>45\text{s}$), and real-time link health monitoring.
* **Intelligent Custodial Dispatch**: Automated work orders triggered by usage count ($N$ flushes), hygiene alerts, or supervisor dispatches with instant Firebase Cloud Messaging (FCM) mobile notifications.
* **Supervisor QA Audit & Work Order Triage**: Closed-loop quality assurance where completed custodial jobs are audited, approved, or flagged for mandatory re-cleaning with zero-scroll quick filter tabs.
* **Hardware Interlock Safety**: Double-action safety modals (Poka-Yoke prevention) and hardware presence interlocks preventing accidental UV-C exposure or plumbing over-pressurization.

---

## 🗺️ Master Campus Facility Directory (22 Units & 96 Fixtures across 4 Floors)

All 22 restrooms and 96 individual fixtures/stalls across the 4 floors of the SDCA Annex Building plus the dedicated hardware testing lab unit are registered in the centralized directory:

| Floor | Restroom Facility Name | Device Hardware ID | Fixture Count | Room Location Code | Default Lead Technician |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **1st Floor** | **1F Canteen Male Restroom** | `SDCA-FL1-CANTEEN-M` | 7 | `SDCA-101-CM` | James Alvarez (`james@gmail.com`) |
| **1st Floor** | **1F Canteen Female Restroom** | `SDCA-FL1-CANTEEN-F` | 3 | `SDCA-102-CF` | James Alvarez (`james@gmail.com`) |
| **1st Floor** | **1F Faculty Male Restroom** | `SDCA-FL1-FACULTY-M` | 6 | `SDCA-103-FM` | James Alvarez (`james@gmail.com`) |
| **1st Floor** | **1F Faculty Female Restroom** | `SDCA-FL1-FACULTY-F` | 2 | `SDCA-104-FF` | James Alvarez (`james@gmail.com`) |
| **2nd Floor** | **2F Male (Left Wing)** | `SDCA-FL2-M1` | 7 | `SDCA-201-M1` | Justine Lopez (`justine@gmail.com`) |
| **2nd Floor** | **2F Male (Right Wing)** | `SDCA-FL2-M2` | 7 | `SDCA-202-M2` | Justine Lopez (`justine@gmail.com`) |
| **2nd Floor** | **2F Female (Left Wing)** | `SDCA-FL2-F1` | 5 | `SDCA-203-F1` | Justine Lopez (`justine@gmail.com`) |
| **2nd Floor** | **2F Female (Right Wing)** | `SDCA-FL2-F2` | 5 | `SDCA-204-F2` | Justine Lopez (`justine@gmail.com`) |
| **2nd Floor** | **2F PWD (Left Wing)** | `SDCA-FL2-PWD1` | 1 | `SDCA-205-PWD1` | Justine Lopez (`justine@gmail.com`) |
| **2nd Floor** | **2F PWD (Right Wing)** | `SDCA-FL2-PWD2` | 1 | `SDCA-206-PWD2` | Justine Lopez (`justine@gmail.com`) |
| **3rd Floor** | **3F Male (Left Wing)** | `SDCA-FL3-M1` | 7 | `SDCA-301-M1` | Maria Lindog (`maria@gmail.com`) |
| **3rd Floor** | **3F Male (Right Wing)** | `SDCA-FL3-M2` | 7 | `SDCA-302-M2` | Maria Lindog (`maria@gmail.com`) |
| **3rd Floor** | **3F Female (Left Wing)** | `SDCA-FL3-F1` | 5 | `SDCA-303-F1` | Maria Lindog (`maria@gmail.com`) |
| **3rd Floor** | **3F Female (Right Wing)** | `SDCA-FL3-F2` | 5 | `SDCA-304-F2` | Maria Lindog (`maria@gmail.com`) |
| **3rd Floor** | **3F PWD (Left Wing)** | `SDCA-FL3-PWD1` | 1 | `SDCA-305-PWD1` | Maria Lindog (`maria@gmail.com`) |
| **3rd Floor** | **3F PWD (Right Wing)** | `SDCA-FL3-PWD2` | 1 | `SDCA-306-PWD2` | Maria Lindog (`maria@gmail.com`) |
| **4th Floor** | **4F Male (Left Wing)** | `SDCA-FL4-M1` | 7 | `SDCA-401-M1` | Supervisor Team |
| **4th Floor** | **4F Male (Right Wing)** | `SDCA-FL4-M2` | 7 | `SDCA-402-M2` | Supervisor Team |
| **4th Floor** | **4F Female (Left Wing)** | `SDCA-FL4-F1` | 5 | `SDCA-403-F1` | Supervisor Team |
| **4th Floor** | **4F Female (Right Wing)** | `SDCA-FL4-F2` | 5 | `SDCA-404-F2` | Supervisor Team |
| **4th Floor** | **4F PWD (Left Wing)** | `SDCA-FL4-PWD1` | 1 | `SDCA-405-PWD1` | Supervisor Team |
| **4th Floor** | **4F PWD (Right Wing)** | `SDCA-FL4-PWD2` | 1 | `SDCA-406-PWD2` | Supervisor Team |
| **Lab Unit** | **SDCA Annex Test Stall** | `toilet-01` | 1 | `LAB-BENCH-01` | *Diagnostic Hardware Unit* |

---

## 🛠️ End-to-End System Architecture & Telemetry Pipeline

The platform uses a decoupled three-tier architecture ensuring reliability, real-time response, and continuous data ingestion without serverless execution timeout limitations:

```mermaid
flowchart TB
    subgraph EdgeLayer["📡 Edge Layer (ESP32 Microcontrollers)"]
        ESP["🚽 ESP32 Node\n• Ultrasonic Trigger & Echo\n• YF-S201 Water Flow Sensor\n• SG90/MG995 Lid Servo\n• 12V Solenoid Flush Valve\n• 254nm UV-C Lamp Relay\n• WiFi & TLS MQTT Client"]
    end

    subgraph BrokerLayer["☁️ Cloud MQTT Broker"]
        HiveMQ["🌐 HiveMQ Cloud\n• Port 8883 (MQTTS / TLS)\n• QoS 1 Delivery\n• Topic Routing"]
    end

    subgraph ListenerLayer["⚙️ Ingestion Bridge (Railway Service)"]
        Listener["⚡ mqtt-listener Service\n• 24/7 Long-Lived Node.js Process\n• Telemetry Parser & Timestamping\n• Device Heartbeat Watchdog\n• Threshold Rules & Alert Engine\n• FCM Push Notification Dispatcher"]
    end

    subgraph CloudStorage["🔥 Google Firebase Cloud Infrastructure"]
        Firestore[("🗄️ Cloud Firestore\n• devices\n• sensorReadings\n• tasks\n• alerts\n• automationRules\n• maintenanceNotes\n• users")]
        FirebaseAuth["🔐 Firebase Auth\n• JWT Bearer Tokens\n• RBAC Custom Claims"]
        FCM["📲 Firebase Cloud Messaging\n• Custodial Push Notifications"]
    end

    subgraph PresentationLayer["🖥️ Client Applications"]
        WebApp["🌐 Next.js 16 Web Dashboard\n• Operations Command Center\n• Dispatch & QA Inspection Log\n• Actuator Overrides & PDF Exports"]
        MobileApp["📱 Klir Mobile Companion App\n• Technician Task Checklist\n• Photo Proof Upload"]
    end

    ESP -->|Publish Sensor Telemetry & Events| HiveMQ
    HiveMQ -->|Subscribe toilet/sensors/# & events/#| Listener
    Listener -->|Batch Write Readings & Counters| Firestore
    Listener -->|Trigger Incident Alerts| FCM
    FCM -->|Push Alert| MobileApp
    WebApp -->|Live Firestore Snapshot Streaming| Firestore
    WebApp -->|Authenticate Requests| FirebaseAuth
    WebApp -->|Publish Actuator Commands| HiveMQ
    HiveMQ -->|Deliver Command| ESP
    MobileApp -->|Acknowledge / Submit Photo Proof| Firestore
```


---

## 🔌 Hardware & Microcontroller Specification (ESP32)

### GPIO Pinout Mapping Table

| GPIO Pin | Function / Peripheral | Logic Level | Circuit Description |
| :--- | :--- | :---: | :--- |
| **`GPIO 12`** | **Ultrasonic `TRIG`** | $3.3\text{V}$ Output | $10\mu\text{s}$ pulse trigger for distance measurement |
| **`GPIO 13`** | **Ultrasonic `ECHO`** | $3.3\text{V}$ Input | Echo pulse duration return ($1\text{k}\Omega / 2\text{k}\Omega$ voltage divider protected) |
| **`GPIO 14`** | **Solenoid Flush Pump** | $3.3\text{V}$ Output (Active LOW) | Optocoupled relay trigger for 12V Solenoid Valve |
| **`GPIO 27`** | **UV-C Disinfection Relay**| $3.3\text{V}$ Output (Active LOW) | Optocoupled relay trigger for 254nm Disinfection Lamp |
| **`GPIO 25`** | **Motorized Lid Servo** | $3.3\text{V}$ PWM (50Hz) | Position servo control ($0^\circ$ Open, $180^\circ$ Closed) |
| **`GPIO 32`** | **Water Flow Meter** | $3.3\text{V}$ Input (`PULLUP`) | Hardware interrupt counter for YF-S201 Hall sensor pulses |
| **`GPIO 2`**  | **Status Indicator LED** | $3.3\text{V}$ Output | Connectivity LED (Fast blink = WiFi Drop, Slow blink = MQTT Drop, Solid = Operational) |

### Electrical Schematics & Power Rail Isolation

> [!CAUTION]
> **Power Rail Isolation Rule**: Never power high-current inductive loads (servos, solenoid valves, pumps) directly from the ESP32's onboard $3.3\text{V}$ or $5\text{V}$ pins.
> * **Servo Power**: Power from an external regulated **$5\text{V} \ge 2\text{A}$ power supply**. Connect the external power supply GND and ESP32 GND together.
> * **Decoupling Capacitors**: Place a **$470\mu\text{F} - 1000\mu\text{F}$ 16V electrolytic capacitor** across the $5\text{V}$ and $\text{GND}$ rail near the servo to eliminate voltage drops during motion.
> * **Echo Voltage Divider**: When using $5\text{V}$ HC-SR04 sensors, step down the `ECHO` output using a **$1\text{k}\Omega$ (series)** and **$2\text{k}\Omega$ (to GND)** voltage divider to protect `GPIO 13` from $5\text{V}$ overvoltage.

### 7-State Finite State Machine (FSM)

The ESP32 firmware executes a deterministic non-blocking state machine ensuring user safety and hygiene:

```mermaid
stateDiagram-v2
    [*] --> STANDBY
    
    STANDBY --> PERSON_DETECTED : Distance < 30cm (Settle time expired)
    PERSON_DETECTED --> LID_OPEN : openLid() complete (Servo at 0°)
    
    LID_OPEN --> WAITING_FOR_DEPARTURE : SENSOR_GRACE_MS (5s) expired
    
    WAITING_FOR_DEPARTURE --> WAITING_FOR_DEPARTURE : Person present (reset timer)
    WAITING_FOR_DEPARTURE --> LID_CLOSING : Person absent for 3000ms
    
    LID_CLOSING --> FLUSHING : closeLid() complete + 500ms pause
    
    FLUSHING --> UV_ACTIVE : Flush duration (3s) expired -> Pump OFF
    
    UV_ACTIVE --> STANDBY : UV cycle (5s) expired -> UV OFF -> Clear Buffer
```

#### State Machine Timing Constants:
* **`DETECTION_THRESHOLD_CM`** ($30\text{ cm}$): Proximity threshold triggering presence state.
* **`SENSOR_GRACE_MS`** ($5000\text{ ms}$): Post-lid opening sensor blackout period preventing false "person gone" triggers from lid deflection.
* **`PERSON_GONE_CONFIRM_MS`** ($3000\text{ ms}$): Debounce duration confirming the user has exited before closing the lid.
* **`PUMP_DURATION_MS`** ($3000\text{ ms}$): Solenoid flush valve open duration.
* **`UV_DURATION_MS`** ($5000\text{ ms}$): Automated germicidal disinfection cycle duration.
* **`STANDBY_SETTLE_MS`** ($2000\text{ ms}$): Post-cycle sensor buffer refill period.

---

## 📡 MQTT Protocol & Real-Time Event Schema

### Sensor Ingestion Topics & Payloads

The edge ESP32 publishes telemetry and cycle events using JSON payloads:

#### 1. Ultrasonic Distance Telemetry
* **Topic**: `toilet/sensors/ultrasonic`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "distance": 68.4,
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
    "volume": 1.25,
    "duration": 3.1,
    "unit": "L"
  }
  ```

#### 3. Motorized Lid Position Event
* **Topic**: `toilet/events/lid`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "status": "open",
    "timestamp": 1724508400000
  }
  ```

#### 4. Solenoid Flush State Event
* **Topic**: `toilet/events/pump`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "status": "active",
    "timestamp": 1724508400000
  }
  ```

#### 5. UV-C Disinfection Cycle Event
* **Topic**: `toilet/events/uv`
* **QoS**: `1`
* **Payload**:
  ```json
  {
    "duration": 5,
    "completed": true,
    "timestamp": 1724508400000
  }
  ```

### Actuation Command Topics

Commands dispatched from the Web Dashboard to the hardware via HiveMQ:

| Command Topic | Payload Format | Description |
| :--- | :--- | :--- |
| `toilet/commands/pump` | `"ON"` or `"OFF"` | Actuates the 12V Solenoid Flush Valve |
| `toilet/commands/uv` | `"ON"` or `"OFF"` | Toggles the 254nm UV-C Disinfection Relay |
| `toilet/commands/lid` | `"OPEN"` or `"CLOSE"` | Moves the Servo to open ($0^\circ$) or closed ($180^\circ$) position |
| `toilet/commands/config` | `{"pumpDuration": 3, "uvDuration": 5, "threshold": 30}` | Updates onboard calibration parameters dynamically |
| `toilet/commands/reset` | `"REBOOT"` | Executes an onboard watchdog software reset |

---

## 🚀 Core Web Application Modules

### 1. Real-Time Telemetry & Operations Dashboard
* **Live KPI Counters**: Instant computation of Total Flushes, Net Water Conserved (Liters), Sensor Link Health, and Completed UV-C Disinfection Cycles.
* **Telemetry Visualizations**: Recharts time-series mapping water usage trends, occupancy durations, and flush distributions across floors.
* **Link Watchdog & Last Seen Indicator**: Detects silent hardware dropouts and marks units as offline after 60 seconds of missing heartbeat.

### 2. Searchable Restroom Combobox (`ToiletUnitSelect`)
* **Hierarchical Floor Grouping**: Organizes all 19 SDCA units across 4 floors (`1st Floor`, `2nd Floor`, `3rd Floor`, `4th Floor`, `SDCA Annex`).
* **Fuzzy Search**: Filter by floor, gender, or room code without cumbersome scrolling.
* **Clean Labeling**: Standardized names (e.g. `1F Canteen Female Restroom · 1st Floor`).

### 3. Supervisor QA Audit & Inspection Log
* **Closed-Loop Quality Control**: Technicians submit tasks with photo proof; supervisors review each submission with dedicated **Approve** or **Flag for Recheck** actions.
* **Accurate Rate Analytics**:
  $$\text{Approval Rate} = \begin{cases} \left(\frac{\text{Approved Tasks}}{\text{Audited Tasks}}\right) \times 100\% & \text{if Audited Tasks} > 0 \\ 0\% & \text{if Audited Tasks} = 0 \end{cases}$$
* **Zero-Scroll Quick Filter Tabs**: 1-click triage chips (`All`, `⏳ Pending`, `✓ Approved`, `⚠️ Flagged`) allowing rapid inspection without searching or vertical scrolling.
* **Full-Width High-Contrast Inspection Table**: Displays QA status, restroom location, technician name, auditing supervisor, flag reasons/remarks, and completion timestamps.

### 4. Hardware Actuator Remote Control Center
* **Double-Action Safety Modals**: Requires explicit confirmation with Poka-Yoke safety locks before triggering flush or UV-C cycles.
* **Occupancy Protection**: Disables manual UV-C triggering if the ultrasonic sensor registers an occupant present.
* **Admin Password Authorization**: Critical configuration changes require administrative password re-verification with background scroll-locking.

### 5. Automated Rules Engine & Threshold Alarms
* **Usage Count Rules**: Automatically dispatches a custodial cleaning task when a restroom exceeds a predefined flush threshold (e.g. 25 flushes).
* **Continuous Flow Leak Detection**: Triggers critical alerts when flow rate remains $>0.5\text{ L/min}$ for $>45\text{s}$.
* **Hardware Wear Counters**: Tracks actuator duty cycles and alerts maintenance when components approach rated lifespan limits.

### 6. Multi-Format Reporting & Export Engine
* **Report Types**: Maintenance Tasks Summary, Supervisor QA Audit Log, Water Consumption & Conservation, and Sensor Health History.
* **Export Formats**: Client-side compiled **PDF** (via `@react-pdf/renderer`), **CSV** data sheets, and **JSON** raw feeds.

---

## 🔐 Role-Based Access Control (RBAC) & Security Architecture

The platform enforces strict role-based access control via Firebase Custom Claims and server-side JWT verification:

| Capability / Resource | `admin` | `supervisor` | `maintenance` | `viewer` |
| :--- | :---: | :---: | :---: | :---: |
| **Web Dashboard Access** | ✅ Full Access | ✅ Full Access | ⚠️ Task Feed Only | 👁️ Read-Only |
| **Mobile App Access** | ❌ Blocked | ✅ Command Hub | ✅ Workspace | ❌ Blocked |
| **Dispatch / Create Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Edit / Delete Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Approve / Flag QA Inspections** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Reassign Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Acknowledge & Complete Tasks** | ❌ No | ❌ Audit Only | ✅ Photo + Checklist | ❌ No |
| **Hardware Actuator Remote Overrides** | ✅ Full | ✅ Full | ❌ No | ❌ No |
| **Automation Rules Configuration** | ✅ Edit / Create | 👁️ View Only | ❌ No | ❌ No |
| **Export Compliance Reports (PDF/CSV)** | ✅ Yes | ✅ Yes | ❌ No | 👁️ View Only |

---

## 📡 Comprehensive REST API Reference (39 Endpoints)

All API endpoints are located under `/api/` and require an `Authorization: Bearer <ID_TOKEN>` header (except public auth endpoints).

### 📋 Maintenance & Task Management

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/tasks` | `admin`, `supervisor`, `maintenance` | Query work orders with status, priority, and assignee filters |
| `POST` | `/api/tasks` | `admin`, `supervisor` | Create and assign a maintenance work order with auto-enrichment |
| `POST` | `/api/tasks/create` | `admin`, `supervisor` | Alternate dispatch route with device metadata resolution |
| `GET` | `/api/tasks/[id]` | `admin`, `supervisor`, `maintenance` | Retrieve single task record and timeline history |
| `PUT` | `/api/tasks/[id]` | `admin`, `supervisor` | Update task instructions, priority, or assigned personnel |
| `DELETE` | `/api/tasks/[id]` | `admin`, `supervisor` | Permanently remove a work order |
| `POST` | `/api/tasks/[id]/acknowledge` | `maintenance` | Record technician acknowledgment timestamp |
| `POST` | `/api/tasks/[id]/accept-recheck`| `maintenance` | Acknowledge a flagged task and commit to re-cleaning |
| `POST` | `/api/tasks/[id]/complete` | `maintenance` | Submit completion checklist, custodial notes, and photo proof |
| `POST` | `/api/tasks/register-token` | `maintenance`, `supervisor` | Register device FCM push notification token |

### 👮 Supervisor Actions & Quality Assurance

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/supervisor/approve-task` | `admin`, `supervisor` | Formally approve a completed maintenance task |
| `POST` | `/api/supervisor/flag-task` | `admin`, `supervisor` | Flag task with a mandatory reason requiring re-inspection |
| `POST` | `/api/supervisor/reassign-task` | `admin`, `supervisor` | Reallocate work order to another technician |

### 🚽 Restroom Devices & Personnel

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/devices` | `admin`, `supervisor`, `maintenance`, `viewer` | List all 19 registered SDCA Annex devices |
| `POST` | `/api/devices` | `admin` | Register a new restroom device stall |
| `GET` | `/api/devices/[id]` | `admin`, `supervisor`, `maintenance`, `viewer` | Retrieve single device specification and config |
| `GET` | `/api/devices/[id]/status` | `admin`, `supervisor`, `maintenance`, `viewer` | Get real-time ESP32 online/offline connectivity |
| `GET` | `/api/maintenance-personnel` | `admin`, `supervisor`, `maintenance`, `viewer` | Real-time technician roster with live availability |
| `GET` | `/api/maintenance-notes` | `admin`, `supervisor`, `maintenance`, `viewer` | Retrieve custodial maintenance log entries |
| `POST` | `/api/maintenance-notes` | `admin`, `supervisor`, `maintenance` | Add new note to a restroom or task |

### ⚡ Actuator Remote Commands

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/actuators/pump` | `admin`, `supervisor` | Trigger manual flush solenoid valve (`"ON"` / `"OFF"`) |
| `POST` | `/api/actuators/uv` | `admin`, `supervisor` | Start / abort UV-C germicidal disinfection cycle |
| `POST` | `/api/actuators/lid/open` | `admin`, `supervisor` | Actuate servo motor to open toilet lid |
| `POST` | `/api/actuators/lid/close` | `admin`, `supervisor` | Actuate servo motor to close toilet lid |
| `POST` | `/api/actuators/reset` | `admin`, `supervisor` | Dispatch ESP32 hardware watchdog controller reboot |

### 📊 Sensors, Analytics & Reports

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/sensors/[id]/readings` | `admin`, `supervisor`, `maintenance`, `viewer` | Time-series query for ultrasonic / flow sensor data |
| `GET` | `/api/sensors/[id]/stats` | `admin`, `supervisor`, `maintenance`, `viewer` | Aggregated sensor statistics and averages |
| `POST` | `/api/sensors/[id]/config` | `admin` | Update sensor sampling rate and debounce thresholds |
| `GET` | `/api/analytics/dashboard` | `admin`, `supervisor`, `maintenance`, `viewer` | High-level summary metrics for executive dashboard |
| `GET` | `/api/analytics/flush-patterns` | `admin`, `supervisor`, `maintenance`, `viewer` | Hourly flush distribution across building floors |
| `GET` | `/api/analytics/water-usage` | `admin`, `supervisor`, `maintenance`, `viewer` | Cumulative water volume analytics and savings |
| `GET` | `/api/analytics/system-performance`| `admin`, `supervisor`, `maintenance`, `viewer` | MQTT latency, uptime, and controller health metrics |
| `POST` | `/api/reports/generate` | `admin`, `supervisor` | Generate comprehensive performance audit report |
| `GET` | `/api/reports/[id]/download` | `admin`, `supervisor`, `viewer` | Download pre-compiled PDF compliance report |

### 🚨 Alerts & Automation Rules

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/alerts` | `admin`, `supervisor`, `maintenance`, `viewer` | List active and historical threshold alarms |
| `POST` | `/api/alerts/[id]/acknowledge`| `admin`, `supervisor`, `maintenance` | Mark specific alert as acknowledged |
| `POST` | `/api/alerts/acknowledge-all` | `admin`, `supervisor` | Acknowledge all active alerts simultaneously |
| `GET` | `/api/automation-rules` | `admin`, `supervisor` | Retrieve automated threshold trigger rules |
| `POST` | `/api/automation-rules` | `admin` | Create new automated dispatch rule |
| `PUT` | `/api/automation-rules/[id]` | `admin` | Update rule parameters or toggle enabled state |
| `DELETE` | `/api/automation-rules/[id]` | `admin` | Remove an automation rule |
| `POST` | `/api/automation-rules/[id]/reset-counter` | `admin`, `supervisor` | Reset rule activation counter |

### 🔑 Authentication & Identity

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | Public | Authenticate user and issue session token |
| `POST` | `/api/auth/register` | Public | Register new staff member (defaults to pending role) |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate current user session |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile and role |
| `POST` | `/api/auth/password-reset/request` | Public | Initiate password reset email |
| `POST` | `/api/auth/password-reset/confirm` | Public | Finalize password reset with action code |

---

## 🎨 Design System & Accessibility Standards (WCAG 2.2 AA)

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

### Accessibility Features (WCAG 2.2 AA)
* **WCAG 1.4.3 (Contrast Minimum)**: All text elements exceed $4.5:1$ contrast against light and dark backgrounds.
* **WCAG 1.4.10 (Reflow)**: Responsive layouts adapt down to $320\text{px}$ without clipping text or requiring dual-axis scrolling.
* **WCAG 2.1.1 (Keyboard Navigation)**: Full keyboard support (`Tab`, `ArrowKeys`, `Enter`, `Esc`) for all modals, comboboxes, and dropdowns.
* **WCAG 4.1.2 (Name, Role, Value)**: ARIA landmarks (`role="region"`, `role="combobox"`, `role="listbox"`, `aria-live="polite"`) across dynamic telemetry feeds.

---

## ⚙️ Local Installation & Development Setup

### 1. Prerequisites
* **Node.js**: `v20.x` or `v22.x` (LTS)
* **npm**: `v10.x` or higher
* **Firebase Project**: Firestore Database & Authentication enabled
* **HiveMQ Cloud Cluster**: Port 8883 (TLS enabled)

### 2. Clone & Install Dependencies
```powershell
# Clone the repository
git clone https://github.com/JamesCarl04/Smart-Flush-Web-App.git
cd Smart-Flush-Web-App

# Install Next.js root dependencies
npm install

# Install standalone MQTT listener dependencies
cd mqtt-listener
npm install
cd ..
```

### 3. Configure Environment Variables
Create `.env` in the root project directory:

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
To run both the Next.js Web Dashboard and the MQTT Listener concurrently:
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

Because serverless environments (like Vercel) terminate long-lived TCP connections, the production deployment is decoupled:

| Service | Host Platform | Runtime Model | Core Responsibility |
| :--- | :--- | :--- | :--- |
| **Web Dashboard & API Routes** | **Vercel** | Serverless Edge / Node.js | User authentication, REST API routes, dashboard UI, actuator command dispatch |
| **MQTT Ingestion Listener** | **Railway** | 24/7 Long-Lived Container | Persistent TLS MQTT connection to HiveMQ, Firestore ingestion, FCM push alerts |

### Deploying the MQTT Listener to Railway:
1. Connect this repository to [Railway.app](https://railway.app).
2. Set **Root Directory** to `mqtt-listener`.
3. Set **Start Command** to `npm run start:prod` (runs precompiled `dist/index.js`).
4. Copy the environment variables from `mqtt-listener/.env` into Railway's Variables settings.

---

## 📂 Project Directory & File Structure

```text
Smart-Flush-Web-App/
├── app/
│   ├── (dashboard)/                     # Protected dashboard pages
│   │   ├── alerts/page.tsx              # System alarms & threshold incident logs
│   │   ├── analytics/page.tsx           # Water usage & flush frequency analytics
│   │   ├── configuration/page.tsx       # Automation rules & threshold settings
│   │   ├── dashboard/page.tsx           # Operations command center & dispatch
│   │   ├── profile/page.tsx             # User account & notification preferences
│   │   └── reports/page.tsx             # PDF/CSV audit report generator
│   ├── api/                             # 39 Next.js App Router API endpoints
│   │   ├── actuators/                   # Pump, UV, Lid open/close, reset routes
│   │   ├── alerts/                      # Alarm querying & acknowledgment
│   │   ├── analytics/                   # Aggregated metrics for telemetry charts
│   │   ├── auth/                        # Login, registration, token verification
│   │   ├── automation-rules/            # Threshold rule configuration
│   │   ├── devices/                     # 19 SDCA device registry & status
│   │   ├── maintenance-notes/           # Restroom custodial log entries
│   │   ├── maintenance-personnel/       # Real-time technician roster queries
│   │   ├── reports/                     # PDF generation and download
│   │   ├── sensors/                     # Sensor readings and config
│   │   ├── supervisor/                  # Supervisor flag & reassign routes
│   │   └── tasks/                       # Task CRUD, acknowledge, and completion
│   ├── auth/                            # Login, registration, password reset UI
│   ├── globals.css                      # Tailwind styling & custom scrollbars
│   └── layout.tsx                       # Root HTML shell & auth provider wrapper
├── components/
│   └── dashboard/                       # Specialized operations UI components
│       ├── ActivityFeed.tsx             # Live stream of telemetry & task events
│       ├── ControlPanel.tsx             # Actuator buttons with safety modals
│       ├── DashboardToast.tsx           # Non-blocking accessible toast alerts
│       ├── MaintenanceTaskPanel.tsx     # Dispatch form & live task status feed
│       ├── RestroomMaintenanceNotes.tsx # Restroom notes history modal
│       ├── StatCards.tsx                # Metric KPI cards (Flushes, Water, UV)
│       └── ToiletUnitSelect.tsx         # Modern searchable floor-grouped combobox
├── hooks/                               # Custom React hooks
│   ├── useAuth.ts                       # Firebase user state & role resolution
│   ├── useDeviceStatus.ts               # Real-time ESP32 link monitor
│   ├── useMaintenancePersonnel.ts       # Technician roster state hook
│   └── useTasks.ts                      # Live Firestore task snapshot subscription
├── lib/                                 # Server & client utility libraries
│   ├── api-client.ts                    # Type-safe authenticated fetch wrapper
│   ├── auth-helpers.ts                  # Server-side token & RBAC verification
│   ├── firebase.ts                      # Client Firebase SDK initialization
│   ├── firebase-admin.ts                # Server Firebase Admin SDK singleton
│   ├── schemas.ts                       # Zod validation schemas for all requests
│   ├── task-service.ts                  # Task creation & metadata enrichment logic
│   └── task-types.ts                    # TypeScript interfaces for tasks & work orders
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

## 🧪 Testing, Diagnostics & Code Quality

```powershell
# Run full Next.js production build
npm run build

# Run Jest unit and integration test suite (67 tests)
npx jest --watchAll=false

# Run ESLint validation
npm run lint

# Run Playwright End-to-End browser tests
npm run test:e2e

# Run security vulnerability audit
npm run test:security
```

---

## 🪟 Hardware & Windows Troubleshooting Guide

### 1. Arduino IDE Upload Error (`COM port is busy` / `PermissionError 13`)
* **Cause**: The Arduino Serial Monitor is open and locking the COM port.
* **Fix**: Close the Serial Monitor window/tab before clicking **Upload (➔)**. If still locked, unplug and replug the USB cable.

### 2. ESP32 Bootloader Mode (Manual Flash)
* When Arduino shows `Connecting........_____........`:
* Press and hold the **`BOOT` (IO0)** button on the ESP32 for 2 seconds, then release.

### 3. Garbled Characters on Serial Monitor (`[SENSORJ".W5)'`)
* **Cause**: Voltage drop during WiFi transmission spikes or 5V overvoltage on ECHO Pin 13.
* **Fix**:
  1. Add `Serial.flush()` before network calls.
  2. Use a high-quality USB cable.
  3. Power the servo from an external $5\text{V} \ge 2\text{A}$ supply with a $470\mu\text{F}$ capacitor.

### 4. PowerShell Script Execution Policy
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

## 📄 License & Attribution

This project is proprietary software developed for **St. Dominic College of Asia (SDCA)**.  
*© 2026 Klir Smart Flush Engineering Team. All rights reserved.*
