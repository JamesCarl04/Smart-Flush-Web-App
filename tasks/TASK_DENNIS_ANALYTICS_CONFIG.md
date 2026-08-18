# 📊 AI Task Instruction: Dennis — Analytics, Configuration & Dispatch Engine / QA Lead

> **Instructions for Dennis's AI Coding Assistant**  
> Copy and paste this prompt directly into your AI model (Antigravity, Cursor, Claude Code, Copilot, ChatGPT) to begin implementation.

---

## 🤖 System Prompt for AI Assistant

```markdown
You are an expert Full-Stack Data & QA Engineer pair-programming with Dennis on the Smart Flush Web Application (Next.js 16 App Router, Recharts, Tailwind CSS 3.4, Firebase, TypeScript).

Your mission is to implement **Multi-Floor Comparative Analytics**, the **Physical Hardware Testbed Binding UI** on the Configuration page, the **Universal 1-Click Alert Dispatch Drawer**, and execute **Cross-Platform Mobile-Web E2E QA**.
```

---

## 🎯 Scope of Work & File Ownership

You are strictly responsible for creating and modifying the following files:

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **[MODIFY]** | `app/(dashboard)/analytics/page.tsx` | Multi-floor comparative bar charts (1F vs 2F vs 3F vs 4F) & room deep dives |
| **[MODIFY]** | `app/(dashboard)/configuration/page.tsx` | Add the Physical Hardware Binding Card to bind `toilet-01` to any room |
| **[NEW]** | `components/layout/AlertDispatchDrawer.tsx` | Top-bar 1-click alert triage drawer creating unassigned work orders |
| **[MODIFY]** | `app/(dashboard)/layout.tsx` | Mount the `AlertDispatchDrawer` with the header notification bell |

---

## 📋 Step-by-Step Implementation Guide

### Step 1: Update `app/(dashboard)/analytics/page.tsx`

Refactor the analytics page to consume `useFacility()` from `contexts/FacilityContext.tsx`:
1. **Mode A: Campus Overview (`selectedFloor === 'all'`):**
   * **Floor Comparison Bar Chart:** Renders a Recharts grouped bar chart comparing:
     * `1st Floor` (4 rooms), `2nd Floor` (5 rooms), `3rd Floor` (5 rooms), `4th Floor` (5 rooms).
     * Metrics: Total Flushes Today, Total Water Consumed ($L$), Water Conserved ($L$).
   * **Campus Peak Traffic Line Chart:** Hourly volume aggregated across all 4 floors.
2. **Mode B: Floor View (`selectedFloor !== 'all' && selectedDeviceId === 'all'`):**
   * **Room-by-Room Bar Chart:** Compares the restrooms on the active floor (e.g. Male 1, Male 2, Female 1, Female 2, PWD).
3. **Mode C: Room View (`selectedDeviceId !== 'all'`):**
   * **Hourly Stall Occupancy Heatmap & Duration Curve:** Deep dive for the single selected restroom.

---

### Step 2: Update `app/(dashboard)/configuration/page.tsx`

Add the **Physical Hardware Testbed Binding Card**:
* Location: Prominently displayed near the top of the Configuration page.
* Features:
  * Dropdown selector: *"Bind Physical ESP32 Hardware (`toilet-01`) to Target Restroom: `[ 2F PWD Restroom ▼ ]`"*.
  * Shows all 19 SDCA Annex rooms grouped by floor.
  * **Save Binding Button:** Calls `PUT /api/devices/hardware-binding`.
  * **Live Binding Status Pill:** Displays active bound room, floor badge, and live ESP32 link status.
  * Informational Callout: *"When active, live sensor telemetry and actuator commands for this restroom are routed to the physical prototype unit."*

---

### Step 3: Create `components/layout/AlertDispatchDrawer.tsx`

Build the Universal 1-Click Alert Dispatch Drawer:
* Trigger: Mounted in the top header bell / alert indicator.
* Content:
  * Lists active threshold alerts and anomalies.
  * Each alert card features an immediate **"⚡ 1-Click Quick Dispatch"** button.
* Action:
  * Calls `POST /api/tasks/create` with `assignedTo: null`, `assignedToIds: []`, `status: "pending"`, and the target restroom metadata.
  * Shows success toast: *"Task dispatched to Unassigned Mobile Queue for Supervisor triage"*.

---

### Step 4: Cross-Platform E2E Verification & Testing

Execute the end-to-end multi-floor verification workflow:
1. **Analytics Test:**
   * Change Global Facility Selector to "All Floors" $\rightarrow$ Verify 4-floor comparative chart renders.
   * Switch to "2nd Floor" $\rightarrow$ Verify room comparison chart for Floor 2 renders.
2. **Configuration Binding Test:**
   * Change hardware binding to "1F Canteen Male Restroom" and click Save.
   * Verify toast appears and GET `/api/devices/hardware-binding` returns updated room.
3. **1-Click Dispatch Test:**
   * Open Alert Drawer $\rightarrow$ Click "Quick Dispatch" for 2F PWD.
   * Verify task appears in Firestore `tasks` collection with `status: "pending"` and `assignedTo: null`.

---

## 🧪 Verification & Acceptance Criteria

When finished, run these commands to verify:
```powershell
# 1. Check TypeScript typing
npx tsc --noEmit

# 2. Check ESLint
npx eslint app/(dashboard)/analytics/page.tsx app/(dashboard)/configuration/page.tsx components/layout/AlertDispatchDrawer.tsx

# 3. Test in Browser
# - Navigate to http://localhost:3000/analytics -> Test multi-floor chart
# - Navigate to http://localhost:3000/configuration -> Test hardware binding card
# - Test 1-click alert dispatch from header
```
