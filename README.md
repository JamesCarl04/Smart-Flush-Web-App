# 🌐 Smart Flush IoT System — Web Management & Dispatch Dashboard

> **Enterprise Operations & Telemetry Platform for Smart Flush IoT Ecosystem**  
> *SDCA Annex Campus Edition • Real-Time Sensor Telemetry, Actuator Controls & Custodial Dispatch*

[![Next.js](https://img.shields.io/badge/Next.js-16.1%20(Turbopack)-black.svg?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-4.12-5A0EF8.svg?logo=daisyui)](https://daisyui.com/)
[![Firebase](https://img.shields.io/badge/Firebase%20Admin-SDK-orange.svg?logo=firebase)](https://firebase.google.com/)
[![MQTT](https://img.shields.io/badge/MQTT-HiveMQ%20Cloud-red.svg?logo=mqtt)](https://www.hivemq.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![WCAG](https://img.shields.io/badge/WCAG-2.2%20Level%20AA-green.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 📌 Table of Contents

1. [Executive Summary & System Overview](#-executive-summary--system-overview)
2. [SDCA Annex Facility Master Directory (19 Units)](#-sdca-annex-facility-master-directory-19-units)
3. [System Architecture & Ingestion Pipeline](#-system-architecture--ingestion-pipeline)
4. [Core Modules & Operational Features](#-core-modules--operational-features)
   - [1. Real-Time Telemetry & Operations Dashboard](#1-real-time-telemetry--operations-dashboard)
   - [2. Maintenance Task Dispatch & Roster Management](#2-maintenance-task-dispatch--roster-management)
   - [3. Hardware Actuator Remote Control Center](#3-hardware-actuator-remote-control-center)
   - [4. Automated Rules Engine & Threshold Alarms](#4-automated-rules-engine--threshold-alarms)
   - [5. Historical Analytics & Compliance PDF Reports](#5-historical-analytics--compliance-pdf-reports)
5. [Role-Based Access Control (RBAC) Matrix](#-role-based-access-control-rbac-matrix)
6. [Comprehensive REST API Reference (39 Endpoints)](#-comprehensive-rest-api-reference-39-endpoints)
7. [Design System & Accessibility (WCAG 2.2 AA)](#-design-system--accessibility-wcag-22-aa)
8. [Hardware & MQTT Protocol Specification](#-hardware--mqtt-protocol-specification)
9. [Installation, Environment & Local Setup](#-installation-environment--local-setup)
10. [Deployment Architecture (Vercel + Railway)](#-deployment-architecture-vercel--railway)
11. [Project Directory & File Structure](#-project-directory--file-structure)
12. [Verification, Testing & Diagnostics](#-verification-testing--diagnostics)
13. [Troubleshooting & Windows Guide](#-troubleshooting--windows-guide)

---

## 🏢 Executive Summary & System Overview

The **Smart Flush Web Application** is the centralized facility management and IoT telemetry hub engineered for high-traffic institutional sanitation in the **St. Dominic College of Asia (SDCA) Annex Building**.

Combining real-time sensor streams (ultrasonic occupancy, water flow rate, lid state) with bidirectional MQTT hardware actuation (solenoid valves, servo-driven lids, UV-C germicidal disinfection), the platform delivers:
* **Water Conservation Intelligence:** Live monitoring of flush volume (liters), anomalous continuous leaks, and water saved via dual-flush optimization.
* **Smart Custodial Dispatch:** Automated work order creation triggered by high flush counts, hygiene alerts, or supervisor dispatches with instant mobile push notifications.
* **Audit & Re-Inspection Workflow:** Full task lifecycle tracking with photo evidence, supervisor verification, and custodial re-inspection flagging.
* **Hardware Interlock Safety:** Remote actuator triggers with software safety bounds to protect plumbing and restroom occupants.

---

## 🗺️ SDCA Annex Facility Master Directory (19 Units)

The platform manages 19 registered restrooms distributed across 4 floors of the SDCA Annex Building plus a dedicated hardware lab test unit:

| Floor / Area | Restroom Name | Hardware Device ID | Default Lead Technician |
| :--- | :--- | :--- | :--- |
| **1st Floor** | **1F Canteen Male Restroom**<br>**1F Canteen Female Restroom**<br>**1F Faculty Male Restroom**<br>**1F Faculty Female Restroom** | `SDCA-FL1-CANTEEN-M`<br>`SDCA-FL1-CANTEEN-F`<br>`SDCA-FL1-FACULTY-M`<br>`SDCA-FL1-FACULTY-F` | **James Alvarez** (`james@gmail.com`) |
| **2nd Floor** | **2F Male Restroom 1**<br>**2F Male Restroom 2**<br>**2F Female Restroom 1**<br>**2F Female Restroom 2**<br>**2F PWD Restroom** | `SDCA-FL2-M1`<br>`SDCA-FL2-M2`<br>`SDCA-FL2-F1`<br>`SDCA-FL2-F2`<br>`SDCA-FL2-PWD` | **Justine Lopez** (`justine@gmail.com`) |
| **3rd Floor** | **3F Male Restroom 1**<br>**3F Male Restroom 2**<br>**3F Female Restroom 1**<br>**3F Female Restroom 2**<br>**3F PWD Restroom** | `SDCA-FL3-M1`<br>`SDCA-FL3-M2`<br>`SDCA-FL3-F1`<br>`SDCA-FL3-F2`<br>`SDCA-FL3-PWD` | **Maria Lindog** (`maria@gmail.com`) |
| **4th Floor** | **4F Male Restroom 1**<br>**4F Male Restroom 2**<br>**4F Female Restroom 1**<br>**4F Female Restroom 2**<br>**4F PWD Restroom** | `SDCA-FL4-M1`<br>`SDCA-FL4-M2`<br>`SDCA-FL4-F1`<br>`SDCA-FL4-F2`<br>`SDCA-FL4-PWD` | **Supervisor Team** |
| **Lab Unit** | **SDCA Annex Test Stall** | `toilet-01` | *Hardware Diagnostic Unit* |

---

## 🛠️ System Architecture & Ingestion Pipeline

The architecture is divided into three distinct operational layers: Edge IoT Microcontrollers, Persistent Ingestion Service, and Web/Mobile Client Applications.

```mermaid
flowchart TD
    subgraph Edge["📡 Edge Layer (SDCA Restrooms)"]
        ESP32["🚽 ESP32 Microcontroller\n- Ultrasonic Distance Sensor\n- Water Flow Meter\n- Motorized Lid Servo\n- UV-C Germicidal Relay\n- 12V Solenoid Flush Valve"]
    end

    subgraph Broker["☁️ Message Broker"]
        HiveMQ["🌐 HiveMQ Cloud\nMQTT over TLS (Port 8883)"]
    end

    subgraph Service["⚙️ Background Pipeline (Railway)"]
        Listener["⚡ MQTT Listener Service\n(Persistent Node Process)\n- Telemetry Batching\n- Rules & Anomaly Engine\n- FCM Notification Dispatcher"]
    end

    subgraph Cloud["💾 Cloud Database & Auth"]
        Firestore["🔥 Google Cloud Firestore\n- devices\n- sensorReadings\n- tasks\n- alerts\n- automationRules\n- users"]
        FCM["📲 Firebase Cloud Messaging\n(Mobile Push Notifications)"]
    end

    subgraph Clients["🖥️ Client Applications"]
        WebApp["🌐 Next.js 16 Web Dashboard\n- Operations & Analytics\n- Dispatch Panel\n- Remote Controls"]
        MobileApp["📱 Klir Mobile Companion App\n(Technician & Custodial Workspace)"]
    end

    ESP32 -->|Publish Telemetry| HiveMQ
    HiveMQ -->|Subscribe Event Stream| Listener
    Listener -->|Persist Readings & Counters| Firestore
    Listener -->|Dispatch Priority Alert| FCM
    FCM -->|Push Notification| MobileApp
    WebApp -->|Read & Stream State| Firestore
    WebApp -->|Publish Actuator Commands| HiveMQ
    HiveMQ -->|Deliver Command| ESP32
    MobileApp -->|Acknowledge / Submit Photo Proof| Firestore
```

---

## 🚀 Core Modules & Operational Features

### 1. Real-Time Telemetry & Operations Dashboard
* **Live KPI Counters:** Instant computation of Total Flushes, Active Sensor Anomalies, Net Water Conserved (Liters), and Completed UV Sterilization Cycles.
* **Interactive Sensor Charts:** Time-series line and bar charts (using Recharts) mapping hourly usage patterns, water flow velocity, and occupancy durations.
* **Live Device Status Grid:** Renders link health, last-seen timestamps, and firmware version across all 19 SDCA units.

### 2. Maintenance Task Dispatch & Roster Management
* **Searchable Toilet Combobox (`ToiletUnitSelect`):** Clean, custom dropdown grouping all 19 stalls by floor (`1st Floor`, `2nd Floor`, `3rd Floor`, `4th Floor`, `SDCA Annex`) with quick search and zero repetitive `(online)` status tags.
* **Auto-Metadata Enrichment:** Every created task automatically queries Firestore to resolve `restroomName`, `floor`, `building`, and `location`.
* **Multi-Assignee Broadcast:** Single or broadcast dispatch to technicians with real-time status badges (`pending`, `assigned`, `acknowledged`, `flagged`, `completed`).
* **Technician Availability Tracking:** Real-time 3-state roster check verifying whether technicians are free or currently engaged in an active task.
* **Supervisor Work Order Reallocation & Flagging:** Dedicated endpoints enabling supervisors to flag poor cleaning jobs for re-inspection or reassign tasks with audit reasons.

### 3. Hardware Actuator Remote Control Center
* **UV-C Disinfection Cycle:** Dispatches timed UV germicidal cycles (30s / 60s) with occupancy safety interlocks.
* **Motorized Lid Servo:** Commands remote opening and closing with obstruction feedback.
* **Solenoid Flush Valve:** Manual emergency or maintenance flush actuation with double-action confirmation modals (Poka-Yoke prevention).
* **Controller Hardware Reset:** Remote ESP32 watchdog reset trigger.

### 4. Automated Rules Engine & Threshold Alarms
* **Flush Threshold Rule:** Automatically triggers custodial dispatch when a toilet exceeds $N$ flushes (e.g. 25 flushes).
* **Continuous Flow Leak Detection:** Alerts when flow meter reads $> 0.5\text{ L/min}$ for more than 45 seconds continuously.
* **UV Cycle Expiry:** Automatically logs cycle completion and resets maintenance wear counters.

### 5. Historical Analytics & Compliance PDF Reports
* **Custom Date Range Filtering:** Select custom calendar intervals to review campus hygiene performance.
* **Automated PDF Export:** Generates client-side formatted PDF audit reports via `@react-pdf/renderer` ready for administration review.

---

## 🔐 Role-Based Access Control (RBAC) Matrix

| Feature / Action | `admin` | `supervisor` | `maintenance` | `viewer` |
| :--- | :---: | :---: | :---: | :---: |
| **Web Dashboard Access** | ✅ Full Access | ✅ Full Access | ⚠️ Task Feed Only | 👁️ Read-Only |
| **Mobile App Access** | ❌ Blocked | ✅ Command Hub | ✅ Workspace | ❌ Blocked |
| **Dispatch / Create Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Edit / Delete Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Flag Tasks for Re-cleaning** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Reassign Tasks** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Acknowledge & Complete Tasks** | ❌ No | ❌ Audit Only | ✅ Photo + Checklist | ❌ No |
| **Hardware Actuator Triggers** | ✅ Full | ✅ Full | ❌ No | ❌ No |
| **Automation Rules Configuration**| ✅ Yes | 👁️ View Only | ❌ No | ❌ No |
| **Generate & Download Reports** | ✅ Yes | ✅ Yes | ❌ No | 👁️ View Only |

---

## 📡 Comprehensive REST API Reference (39 Endpoints)

All API endpoints are protected via Firebase Authentication (`Authorization: Bearer <ID_TOKEN>`) and enforce strict RBAC and Zod validation schemas.

### 📋 Maintenance & Task Management

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/tasks` | `admin`, `supervisor`, `maintenance` | Fetch all work orders with optional status/assignee filters |
| `POST` | `/api/tasks` | `admin`, `supervisor` | Create and broadcast/assign a maintenance work order |
| `POST` | `/api/tasks/create` | `admin`, `supervisor` | Alternate dispatch route with device metadata resolution |
| `GET` | `/api/tasks/[id]` | `admin`, `supervisor`, `maintenance` | Fetch single task details and progress history |
| `PUT` | `/api/tasks/[id]` | `admin`, `supervisor` | Update task instructions, target stall, or assignees |
| `DELETE` | `/api/tasks/[id]` | `admin`, `supervisor` | Delete a work order |
| `POST` | `/api/tasks/[id]/acknowledge` | `maintenance` | Record technician acknowledgment timestamp |
| `POST` | `/api/tasks/[id]/complete` | `maintenance` | Submit completion checklist, note, and photo proof |
| `POST` | `/api/tasks/register-token` | `maintenance`, `supervisor` | Register device FCM push notification token |

### 👮 Supervisor Actions

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/supervisor/flag-task` | `admin`, `supervisor` | Flag task with a reason requiring re-inspection |
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

## 🎨 Design System & Accessibility (WCAG 2.2 AA)

The web dashboard is built according to the **SDCA Institutional Brand Palette** and meets **WCAG 2.2 Level AA Accessibility Standards**.

### SDCA Color Tokens

| Token | Hex Value | Application |
| :--- | :--- | :--- |
| **`sdca-red`** | `#B5121B` | Primary buttons, brand headers, active tab highlights |
| **`sdca-darkred`** | `#8F0D16` | Hover states, secondary brand accents, card top glows |
| **`sdca-gold`** | `#C9A227` | Accent badges, focus rings, warning indicators |
| **`hydro-cyan`** | `#0284C7` | Water telemetry, flow rate indicators, dual-flush badges |
| **`sanitize-indigo`** | `#6366F1` | UV-C disinfection indicators and status pill badges |
| **`operational-green`** | `#10B981` | Online heartbeat status, completed task badges |
| **`advisory-amber`** | `#F59E0B` | Pending task alerts, maintenance notifications |
| **`critical-crimson`** | `#EF4444` | Sensor anomaly alarms, continuous leak warnings |

### Accessibility Features (WCAG 2.2 Level AA)
* **Keyboard Navigable:** Full `Tab`, `Arrow Up/Down`, `Enter`, and `Escape` support across all menus, modals, and the `ToiletUnitSelect` combobox.
* **Aria Landmarks & Roles:** Explicit `role="region"`, `role="combobox"`, `role="listbox"`, `role="option"`, and `aria-live="polite"` dynamic counters.
* **Color Contrast:** All text elements exceed the $4.5:1$ contrast ratio requirement in both Light and Dark themes.
* **Focus Visible Rings:** High-contrast focus rings (`ring-2 ring-primary ring-offset-2`) for all interactive buttons and inputs.

---

## 📡 Hardware & MQTT Protocol Specification

The ESP32 firmware communicates over TLS encrypted MQTT via HiveMQ Cloud.

### MQTT Ingestion Topics (ESP32 ➔ Broker ➔ Railway Listener ➔ Firestore)

| Topic | Example Payload | Action |
| :--- | :--- | :--- |
| `toilet/sensors/ultrasonic` | `{"distance": 18, "unit": "cm", "timestamp": 1723982400000}` | Evaluates occupancy status; debounce threshold: 2cm / 15s |
| `toilet/sensors/waterflow` | `{"volume": 0.8, "duration": 4.2, "unit": "L"}` | Increments water consumption; evaluates leak anomalies |
| `toilet/events/lid` | `{"status": "closed", "timestamp": 1723982400000}` | Updates motorized lid position telemetry |
| `toilet/events/pump` | `{"status": "active", "timestamp": 1723982400000}` | Logs solenoid flush event and increments flush count |
| `toilet/events/uv` | `{"duration": 30, "completed": true, "timestamp": 1723982400000}`| Records disinfection completion; increments UV cycle count |

### MQTT Actuation Topics (Next.js Dashboard ➔ Broker ➔ ESP32)

| Topic | Payload | Description |
| :--- | :--- | :--- |
| `toilet/commands/pump` | `"ON"` / `"OFF"` | Commands solenoid valve to start/stop flush |
| `toilet/commands/uv` | `"ON"` / `"OFF"` | Commands UV-C germicidal relay |
| `toilet/commands/lid` | `"OPEN"` / `"CLOSE"` | Commands servo motor to open or close lid |
| `toilet/commands/reset` | `"REBOOT"` | Triggers hardware controller software reboot |
| `toilet/commands/config` | `{"pumpDuration": 5, "uvDuration": 30, "threshold": 25}` | Updates onboard calibration parameters |

---

## ⚙️ Installation, Environment & Local Setup

### 1. Prerequisites
* **Node.js:** `v20.x` or `v22.x` (LTS)
* **npm:** `v10.x` or higher
* **Firebase Project:** Firestore Database & Authentication enabled
* **HiveMQ Cloud Broker:** Free or Standard cluster

### 2. Clone & Install Dependencies
```powershell
# Clone the repository
git clone https://github.com/JamesCarl04/Smart-Flush-Web-App.git
cd Smart-Flush-Web-App

# Install root dependencies
npm install

# Install standalone MQTT listener dependencies
cd mqtt-listener
npm install
cd ..
```

### 3. Configure Environment Variables
Create `.env` in the root directory:

```env
# ── Public Firebase Client SDK Configuration ───────────
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=klir-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=klir-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=klir-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=526260279429
NEXT_PUBLIC_FIREBASE_APP_ID=1:526260279429:web:46cdd5e4d188e5e67831ec

# ── Firebase Admin SDK (Server-Side) ─────────────────────
FIREBASE_ADMIN_PROJECT_ID=klir-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@klir-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ── HiveMQ Cloud MQTT Broker ─────────────────────────────
MQTT_BROKER_URL=ffc98acba62649a5b591fc33df78cc7a.s1.eu.hivemq.cloud
MQTT_USERNAME=hardware_push
MQTT_PASSWORD=YourMqttPassword
MQTT_PORT=8883
MQTT_DEVICE_ID=toilet-01
```

Create `mqtt-listener/.env` for the background worker:
```env
MQTT_BROKER_URL=ffc98acba62649a5b591fc33df78cc7a.s1.eu.hivemq.cloud
MQTT_USERNAME=hardware_push
MQTT_PASSWORD=YourMqttPassword
MQTT_PORT=8883
MQTT_DEVICE_ID=toilet-01
FIREBASE_ADMIN_PROJECT_ID=klir-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@klir-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run Development Environment
To run both the Next.js Web Dashboard and the MQTT Listener simultaneously:
```powershell
npm run dev
```

Or run them individually in separate terminals:
```powershell
# Terminal 1: Next.js Web App with Turbopack (Port 3000)
npm run dev:web

# Terminal 2: MQTT Listener Background Service
npm run dev:listener
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Deployment Architecture (Vercel + Railway)

Because serverless hosting environments (like Vercel) terminate long-lived TCP connections, the production deployment is decoupled:

| Component | Target Platform | Runtime Model | Responsibility |
| :--- | :--- | :--- | :--- |
| **Web Dashboard & API Routes** | **Vercel** | Serverless Edge / Node Functions | User authentication, REST API, MQTT command publishing, dashboard UI |
| **MQTT Ingestion Listener** | **Railway** | 24/7 Long-Lived Node.js Container | Constant TCP MQTT connection to HiveMQ, Firestore ingestion, FCM push |

### Deploying the MQTT Listener to Railway:
1. Connect the GitHub repository to [Railway.app](https://railway.app).
2. Set **Root Directory** to `mqtt-listener`.
3. Set **Start Command** to `npx ts-node src/index.ts`.
4. Copy environment variables from `mqtt-listener/.env` into the Railway Dashboard.

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
│   │   └── reports/page.tsx             # PDF audit report generator
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

## 🧪 Verification, Testing & Diagnostics

```powershell
# Type check all TypeScript files (Web App & API Routes)
npx tsc --noEmit

# Run ESLint code quality suite
npm run lint

# Run Jest unit and integration tests
npm run test

# Run Playwright End-to-End browser tests
npm run test:e2e

# Run security audit on third-party dependencies
npm run test:security
```

---

## 🪟 Troubleshooting & Windows Guide

### 1. PowerShell Script Execution Policy
If PowerShell blocks running `npm` or `node` scripts (`File cannot be loaded because running scripts is disabled on this system`), run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

### 2. Firebase Admin Private Key Formatting
When configuring `FIREBASE_ADMIN_PRIVATE_KEY` in `.env`, ensure newline characters (`\n`) are preserved:
```env
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### 3. HiveMQ Cloud TLS Connection Issues
If the MQTT connection fails with a certificate error:
* Ensure `MQTT_PORT=8883` is specified (not `1883`).
* Check that your network allows outbound traffic on TCP port `8883`.

---

## 📄 License & Attribution

This project is proprietary software developed for **St. Dominic College of Asia (SDCA)**.  
*© 2026 Smart Flush Operations Team. All rights reserved.*
