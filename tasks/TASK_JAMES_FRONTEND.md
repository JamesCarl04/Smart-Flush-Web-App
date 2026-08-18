# 🎨 AI Task Instruction: James — Frontend UI & Global Facility State Lead

> **Instructions for James's AI Coding Assistant**  
> Copy and paste this prompt directly into your AI model (Antigravity, Cursor, Claude Code, Copilot, ChatGPT) to begin implementation.

---

## 🤖 System Prompt for AI Assistant

```markdown
You are an expert Senior Frontend Engineer & UI Architect pair-programming with James on the Smart Flush Web Application (Next.js 16 App Router, React 19, Tailwind CSS 3.4, DaisyUI, TypeScript).

Your mission is to implement the **Global Facility Context & State Management**, the **Top Header Facility Selector Dropdown**, the **4-Floor Interactive Bird's-Eye Status Matrix**, and connect **StatCards** to dynamically filter by facility context.
```

---

## 🎯 Scope of Work & File Ownership

You are strictly responsible for creating and modifying the following files:

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **[NEW]** | `contexts/FacilityContext.tsx` | React Context for global building, floor, room selection & persistence |
| **[NEW]** | `components/layout/GlobalFacilitySelector.tsx` | Sticky top-bar cascade selector dropdown (`[SDCA Annex] -> [Floor] -> [Room]`) |
| **[NEW]** | `components/dashboard/FacilityStatusMatrix.tsx` | 4-Floor visual bird's-eye grid with live status color pills (🟢/🟡/🔴) |
| **[MODIFY]** | `components/dashboard/StatCards.tsx` | Adapt KPI cards to dynamically compute totals based on `useFacility()` |
| **[MODIFY]** | `app/(dashboard)/layout.tsx` | Wrap dashboard children with `FacilityProvider` & mount `GlobalFacilitySelector` |
| **[MODIFY]** | `app/(dashboard)/dashboard/page.tsx` | Mount `FacilityStatusMatrix` at the top of the dashboard overview |

---

## 📋 Step-by-Step Implementation Guide

### Step 1: Create `contexts/FacilityContext.tsx`

Create a clean React context that handles:
* State:
  * `selectedBuilding`: default `"SDCA Annex Building"`
  * `selectedFloor`: `'all' | '1st Floor' | '2nd Floor' | '3rd Floor' | '4th Floor'` (default `'all'`)
  * `selectedDeviceId`: `'all' | string` (default `'all'`)
  * `selectedRoomName`: `'All Restrooms' | string` (default `'All Restrooms'`)
  * `filterMode`: computed `'campus' | 'floor' | 'room'`
* Setters:
  * `setSelectedFloor(floor)`
  * `setSelectedDevice(deviceId, roomName)`
  * `resetToCampusOverview()`
* Export hook: `useFacility()`

```typescript
// types/facility.ts or within context:
export type FloorOption = 'all' | '1st Floor' | '2nd Floor' | '3rd Floor' | '4th Floor';
export type FilterMode = 'campus' | 'floor' | 'room';

export interface FacilityContextType {
  selectedBuilding: string;
  selectedFloor: FloorOption;
  selectedDeviceId: string;
  selectedRoomName: string;
  filterMode: FilterMode;
  setSelectedFloor: (floor: FloorOption) => void;
  setSelectedDevice: (deviceId: string, roomName?: string) => void;
  resetToCampusOverview: () => void;
}
```

---

### Step 2: Create `components/layout/GlobalFacilitySelector.tsx`

Build the top-bar selector component:
* Layout: Flexbox container with icons (`Building2`, `Layers`, `MapPin`, `ChevronDown`, `RotateCcw`).
* Displays:
  1. **Building Pill**: `SDCA Annex Building` (Badge).
  2. **Floor Select**: Dropdown with options: `All Floors (Campus Overview)`, `1st Floor`, `2nd Floor`, `3rd Floor`, `4th Floor`.
  3. **Room Select**: Enabled when a floor is selected; lists restrooms on that floor.
  4. **Reset Button**: Quickly resets filter back to "All Floors".
* Visual Styling:
  * SDCA Brand tokens (`hover:border-sdca-red`, subtle background blur, `rounded-xl`, dark mode compatible).

---

### Step 3: Create `components/dashboard/FacilityStatusMatrix.tsx`

Build the 4-floor bird's-eye status matrix:
* Structure:
  * Header: Title *"SDCA Annex Interactive Facility Matrix"*, subtitle *"Click any room tile to inspect live telemetry & filter dashboard"*, live pulse dot.
  * 4 Rows (Floors 1 to 4):
    * **1F:** 1F Canteen M, 1F Canteen F, 1F Faculty M, 1F Faculty F
    * **2F:** 2F Male 1, 2F Male 2, 2F Female 1, 2F Female 2, 2F PWD
    * **3F:** 3F Male 1, 3F Male 2, 3F Female 1, 3F Female 2, 3F PWD
    * **4F:** 4F Male 1, 4F Male 2, 4F Female 1, 4F Female 2, 4F PWD
* Tile Status Indicators:
  * 🟢 **Green (Sanitized / Normal):** Usage $< 20$ flushes.
  * 🟡 **Yellow (Attention):** Usage $20-25$ flushes.
  * 🔴 **Red (Alert / Pending Work Order):** Usage $\ge 25$ flushes or active alert.
* Click Handler:
  * Clicking a tile sets `selectedFloor` and `selectedDeviceId` in `useFacility()`.
  * Highlight the currently active tile with an SDCA red/gold border ring (`ring-2 ring-[#B5121B]`).

---

### Step 4: Update `components/dashboard/StatCards.tsx`

Connect `StatCards` to `useFacility()`:
* Dynamically display the scope in the card subtitle:
  * *"Campus-wide total (19 restrooms)"* vs *"2nd Floor total (5 restrooms)"* vs *"2F PWD Restroom"*.
* Filter computed telemetry based on active device/floor.

---

### Step 5: Update `app/(dashboard)/layout.tsx` & `app/(dashboard)/dashboard/page.tsx`

* In `app/(dashboard)/layout.tsx`:
  * Wrap `{children}` with `<FacilityProvider>`.
  * Insert `<GlobalFacilitySelector />` into the sticky top header (left/center area).
* In `app/(dashboard)/dashboard/page.tsx`:
  * Mount `<FacilityStatusMatrix />` above the StatCards row.

---

## 🧪 Verification & Acceptance Criteria

When finished, run these commands to verify:
```powershell
# 1. Check TypeScript typing
npx tsc --noEmit

# 2. Check ESLint
npx eslint contexts/FacilityContext.tsx components/layout/GlobalFacilitySelector.tsx components/dashboard/FacilityStatusMatrix.tsx components/dashboard/StatCards.tsx

# 3. Test in Browser
# Navigate to http://localhost:3000/dashboard
# - Test changing Floor to "2nd Floor" -> StatCards and header update.
# - Test clicking "3F Female 1" on the Matrix -> Global selector updates to 3F Female 1.
# - Test clicking "Reset" -> Returns to Campus Overview.
```
