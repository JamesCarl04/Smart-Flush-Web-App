# ⚙️ AI Task Instruction: Christian — Backend API, Hardware Binding & Telemetry Ingestion Lead

> **Instructions for Christian's AI Coding Assistant**  
> Copy and paste this prompt directly into your AI model (Antigravity, Cursor, Claude Code, Copilot, ChatGPT) to begin implementation.

---

## 🤖 System Prompt for AI Assistant

```markdown
You are an expert Backend & Cloud Systems Engineer pair-programming with Christian on the Smart Flush Web Application (Next.js 16 App Router, Firebase Admin SDK, Firestore, Zod v4, TypeScript).

Your mission is to implement the **Dynamic Hardware Binding API**, support **Universal 1-Click Unassigned Work Orders (`assignedTo: null`)**, update **Zod Schemas and Task Serialization**, and ensure **Dynamic Actuator Routing** in backend routes.
```

---

## 🎯 Scope of Work & File Ownership

You are strictly responsible for creating and modifying the following files:

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **[NEW]** | `app/api/devices/hardware-binding/route.ts` | GET & PUT endpoints for binding physical ESP32 (`toilet-01`) to any room |
| **[MODIFY]** | `lib/schemas.ts` | Zod schema validation accepting optional assignees & stall-level metadata |
| **[MODIFY]** | `lib/task-types.ts` & `lib/task-service.ts` | Task serialization and creation with unassigned state & auto metadata |
| **[MODIFY]** | `app/api/tasks/create/route.ts` & `app/api/tasks/route.ts` | Allow creating pending unassigned work orders with role checks (`admin`, `supervisor`) |
| **[MODIFY]** | `app/api/alerts/route.ts` | Support creating unassigned dispatch tasks from triggered alerts |
| **[MODIFY]** | `app/api/actuators/pump/route.ts` & `uv/route.ts` & `lid/` | Route commands dynamically based on active hardware binding |

---

## 📋 Step-by-Step Implementation Guide

### Step 1: Create `app/api/devices/hardware-binding/route.ts`

Implement the dynamic hardware controller binding endpoint:
* **GET `/api/devices/hardware-binding`**:
  * Returns the current binding from Firestore `system_config/hardware_binding` (or default fallback).
  * Response:
    ```json
    {
      "success": true,
      "data": {
        "hardwareId": "toilet-01",
        "boundDeviceId": "SDCA-FL2-PWD",
        "boundRoomName": "2F PWD Restroom",
        "floor": "2nd Floor",
        "building": "SDCA Annex Building",
        "updatedAt": 1724000000000,
        "updatedBy": "admin@sdca.edu.ph"
      }
    }
    ```
* **PUT `/api/devices/hardware-binding`**:
  * Requires `admin` or `supervisor` auth token.
  * Validates request body with Zod: `{ boundDeviceId: string, boundRoomName: string, floor: string }`.
  * Writes to Firestore `system_config/hardware_binding` document with `serverTimestamp()`.

---

### Step 2: Update `lib/schemas.ts` & `lib/task-types.ts`

Ensure Zod schemas and TypeScript interfaces support:
1. **Unassigned Task Dispatch**:
   * `assignedTo` is optional string or `null`.
   * `assignedToIds` is optional string array or empty array `[]`.
2. **Stall Density & Metadata**:
   * `stallNumber`: optional number ($1-9$).
   * `floor`: optional string (e.g. `'2nd Floor'`).
   * `restroomName`: optional string (e.g. `'2F PWD Restroom'`).
   * `building`: optional string (default `'SDCA Annex Building'`).

---

### Step 3: Update `lib/task-service.ts` & `app/api/tasks/create/route.ts`

Update `createTaskDocument()` and the `POST /api/tasks/create` endpoint:
* When a task is created with no assigned personnel:
  * Set `status: 'pending'`.
  * Set `assignedTo: null`, `assignedToIds: []`.
* Auto-enrich metadata:
  * Look up device document in `devices` collection by `deviceId`.
  * Populate `restroomName`, `floor`, `building`, `location`.
* Allow access to both `admin` and `supervisor` roles.

---

### Step 4: Update Actuator Routes (`app/api/actuators/`)

In `app/api/actuators/pump/route.ts`, `uv/route.ts`, `lid/open/route.ts`, `lid/close/route.ts`:
* Check if a specific target `deviceId` is provided in the request body.
* If target is specified or defaults to bound device, fetch active hardware binding from `system_config/hardware_binding`.
* Publish MQTT command with audit payload logging the target restroom and operator UID.

---

## 🧪 Verification & Acceptance Criteria

When finished, run these commands to verify:
```powershell
# 1. Check TypeScript typing
npx tsc --noEmit

# 2. Check ESLint
npx eslint app/api/devices/hardware-binding/route.ts app/api/tasks/create/route.ts lib/schemas.ts lib/task-service.ts

# 3. Test API Routes
# - Test GET /api/devices/hardware-binding -> Returns 200 with binding object
# - Test PUT /api/devices/hardware-binding -> Updates binding in Firestore
# - Test POST /api/tasks/create with assignedTo: null -> Creates unassigned pending task
```
