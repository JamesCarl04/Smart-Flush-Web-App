# 🌐 Smart Flush IoT System — Web Management & Dispatch Dashboard

> **Enterprise Operations & Telemetry Platform for Smart Flush IoT Ecosystem**  
> *SDCA Annex Campus Edition • Real-Time Sensor Telemetry, Actuator Controls & Custodial Dispatch*

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black.svg?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase%20Admin-SDK-orange.svg?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](#)

---

## 📌 Table of Contents

1. [System Overview](#-system-overview)
2. [SDCA Annex Facility Master Directory (19 Restrooms)](#-sdca-annex-facility-master-directory-19-restrooms)
3. [Architecture & Hardware Pipeline](#-architecture--hardware-pipeline)
4. [Core Modules & Features](#-core-modules--features)
   - [Live Telemetry & Dashboard](#1-live-telemetry--dashboard)
   - [Maintenance Task Dispatch Panel](#2-maintenance-task-dispatch-panel)
   - [Actuator Remote Controls](#3-actuator-remote-controls)
   - [Automation Rules & Threshold Alerts](#4-automation-rules--threshold-alerts)
5. [API Reference & Endpoints](#-api-reference--endpoints)
6. [Role & Authorization Matrix](#-role--authorization-matrix)
7. [Getting Started & Installation](#-getting-started--installation)
8. [Build & Verification Scripts](#-build--verification-scripts)

---

## 🏢 System Overview

The **Smart Flush Web Application** is the central command center for the Smart Flush campus ecosystem. Built with **Next.js (App Router)** and **TypeScript**, it ingests real-time MQTT telemetry from ESP32 microcontroller units installed in SDCA Annex restrooms.

The web platform provides facility managers and administrators with:
* Real-time flush frequency monitoring and water conservation metrics.
* Automated and manual custodial work order dispatch.
* Remote hardware actuation (UV sterilization, automated lid cycle, water pump).
* Role-based access control (Admin, Supervisor, Maintenance Technician, Viewer).

---

## 🗺️ SDCA Annex Facility Master Directory (19 Restrooms)

All 19 restrooms across Floors 1 to 4 in the SDCA Annex building are registered in the Firestore database:

| Floor | Restroom Name | Device ID | Default Lead Technician |
| :--- | :--- | :--- | :--- |
| **1st Floor** | **1F Canteen Male Restroom**<br>**1F Canteen Female Restroom**<br>**1F Faculty Male Restroom**<br>**1F Faculty Female Restroom** | `SDCA-FL1-CANTEEN-M`<br>`SDCA-FL1-CANTEEN-F`<br>`SDCA-FL1-FACULTY-M`<br>`SDCA-FL1-FACULTY-F` | **James Alvarez** (`james@gmail.com`) |
| **2nd Floor** | **2F Male Restroom 1**<br>**2F Male Restroom 2**<br>**2F Female Restroom 1**<br>**2F Female Restroom 2**<br>**2F PWD Restroom** | `SDCA-FL2-M1`<br>`SDCA-FL2-M2`<br>`SDCA-FL2-F1`<br>`SDCA-FL2-F2`<br>`SDCA-FL2-PWD` | **Justine Lopez (Tech)** (`justine@gmail.com`) |
| **3rd Floor** | **3F Male Restroom 1**<br>**3F Male Restroom 2**<br>**3F Female Restroom 1**<br>**3F Female Restroom 2**<br>**3F PWD Restroom** | `SDCA-FL3-M1`<br>`SDCA-FL3-M2`<br>`SDCA-FL3-F1`<br>`SDCA-FL3-F2`<br>`SDCA-FL3-PWD` | **Maria Lindog** (`maria@gmail.com`) |
| **4th Floor** | **4F Male Restroom 1**<br>**4F Male Restroom 2**<br>**4F Female Restroom 1**<br>**4F Female Restroom 2**<br>**4F PWD Restroom** | `SDCA-FL4-M1`<br>`SDCA-FL4-M2`<br>`SDCA-FL4-F1`<br>`SDCA-FL4-F2`<br>`SDCA-FL4-PWD` | **Supervisor Dispatch** |
| **Lab Unit** | **SDCA Annex Test Stall** | `toilet-01` | *Hardware Test Unit* |

---

## 🛠️ Architecture & Hardware Pipeline

```mermaid
sequenceDiagram
    participant ESP32 as 🚽 ESP32 IoT Stall
    participant MQTT as ☁️ HiveMQ Cloud
    participant Listener as ⚙️ MQTT Listener Service
    participant Firestore as 💾 Firestore DB
    participant WebApp as 🖥️ Next.js Web App
    participant Mobile as 📱 Klir Mobile App

    ESP32->>MQTT: Publish Telemetry (Flush, UV, Leak, Lid)
    MQTT->>Listener: Ingest Event Stream
    Listener->>Firestore: Evaluate Threshold & Create Task
    Listener->>Mobile: Send FCM Push Alert to Assigned Staff
    Mobile->>Firestore: Acknowledge & Submit Photo Proof
    Firestore->>WebApp: Live Update on Maintenance Task Panel
```

---

## 🚀 Core Modules & Features

### 1. Live Telemetry & Dashboard
* Real-time cards for Total Flushes, Active Anomalies, Water Conserved (L), and UV Sanitization Cycles.
* Live line charts of hourly flush patterns and occupancy duration per restroom unit.

### 2. Maintenance Task Dispatch Panel
* **Target Selector:** Dropdown of all 19 SDCA Annex restrooms.
* **Technician Assignment:** Multi-assignee support dispatching tasks directly to mobile apps.
* **Metadata Auto-Enrichment:** Automatically embeds `floor`, `restroomName`, `building`, and `location` onto every created task.

### 3. Actuator Remote Controls
* **UV Sterilization:** Trigger 30s/60s disinfection cycles with safety interlocks.
* **Motorized Lid:** Remote Open/Close commands with obstruction detection.
* **Flush Valve Actuation:** Automated solenoid pump triggering.

### 4. Automation Rules & Threshold Alerts
* Configurable rule engine (e.g. *Trigger cleaning alert after 25 flushes* or *Alert on continuous flow leak > 45s*).

---

## 📡 API Reference & Endpoints

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/tasks` | `admin`, `supervisor`, `maintenance` | List tasks filtered by status/assignee |
| `POST` | `/api/tasks/create` | `admin`, `supervisor` | Create and dispatch new work order |
| `GET` | `/api/devices` | `admin`, `supervisor`, `maintenance`, `viewer` | List all 19 registered restroom devices |
| `GET` | `/api/maintenance-personnel` | `admin`, `supervisor`, `maintenance` | Live 3-state technician roster query |
| `POST` | `/api/supervisor/reassign-task` | `admin`, `supervisor` | Reallocate work order to new staff member |
| `POST` | `/api/supervisor/flag-task` | `admin`, `supervisor` | Flag completed review for re-cleaning |
| `POST` | `/api/actuators/uv` | `admin`, `supervisor` | Remote UV sterilization command |
| `POST` | `/api/actuators/lid/close` | `admin`, `supervisor` | Remote motorized lid control |

---

## 🔐 Role & Authorization Matrix

| Role | Web Dashboard Access | Mobile App Access | Can Dispatch Tasks | Can Clean & Submit Tasks |
| :--- | :---: | :---: | :---: | :---: |
| **`admin`** | Full Access | Blocked (Web Only) | Yes | No |
| **`supervisor`** | Full Access | Full Access (Command Hub) | Yes | No (Audit & Flag Only) |
| **`maintenance`** | Task View Only | Full Access (Workspace) | No | Yes (Checklist & Photos) |
| **`viewer`** | Read-Only | Blocked | No | No |

---

## ⚙️ Getting Started & Installation

### 1. Install Dependencies
```powershell
cd c:\Users\justi\Development\Smart-Flush-Web-App
npm install
```

### 2. Environment Variables
Create `.env` with Firebase credentials:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=klir-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=klir-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=klir-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=526260279429
NEXT_PUBLIC_FIREBASE_APP_ID=1:526260279429:web:46cdd5e4d188e5e67831ec

# Firebase Admin SDK Credentials
FIREBASE_ADMIN_PROJECT_ID=klir-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@klir-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# MQTT HiveMQ Credentials
MQTT_BROKER_URL=ffc98acba62649a5b591fc33df78cc7a.s1.eu.hivemq.cloud
MQTT_USERNAME=hardware_push
MQTT_PASSWORD=Qhs8wWtUs5U77bg
MQTT_PORT=8883
```

### 3. Run Development Server
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Build & Verification Scripts

```powershell
# Compile and build Next.js production bundle
npm run build

# Start production server
npm run start
```

---

*© 2026 Smart Flush Team. All rights reserved.*
