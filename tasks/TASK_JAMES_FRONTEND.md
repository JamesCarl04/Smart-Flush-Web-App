# 🎨 AI Task Instruction: James — Frontend UI & Global Facility State Lead

> **Instructions for James's AI Coding Assistant**  
> Copy and paste this prompt directly into your AI model (Antigravity, Cursor, Claude Code, Copilot, ChatGPT) to begin implementation.

---

## 🤖 System Prompt for AI Assistant

```markdown
You are an expert Senior Frontend Engineer & UI Architect pair-programming with James on the Smart Flush Web Application (Next.js 16 App Router, React 19, Tailwind CSS 3.4, DaisyUI, TypeScript).

Your mission is to implement the **Global Facility Context & State Management**, the **Top Header Facility Selector Dropdown**, the **4-Floor Interactive Bird's-Eye Status Matrix**, and connect **StatCards** to dynamically filter by facility context.

CRITICAL INSTRUCTIONS: You MUST strictly adhere to the Design 3's Framework, WCAG 2.2 Level AA Accessibility Standards, and the SDCA Institutional Brand Palette.
```

---

## 🎨 Mandatory Design & Accessibility Standards

### 1. The Design 3's Framework
* **3-Second Comprehension (Glanceability):**
  * Use instant visual indicators: 🟢 Green (Clean/Normal $< 20$ flushes), 🟡 Yellow (Attention $20–25$ flushes), 🔴 Red (Alert $\ge 25$ flushes or active leak).
  * Every card must show a clear scope subtitle (e.g. *"Campus-wide total (19 restrooms)"* vs *"2nd Floor"* vs *"2F PWD"*).
* **3-Click Maximum Action (Efficiency):**
  * 1-click facility filtering: clicking any room tile on the 4-floor matrix instantly filters the page.
  * Fast dropdown cascades (`Building` $\rightarrow$ `Floor` $\rightarrow$ `Room`) with instant Reset button.
* **3-State System Feedback (Responsiveness):**
  * Provide visual feedback for all transitions: **Idle** $\rightarrow$ **Loading / Skeleton** $\rightarrow$ **Resolved** (smooth state transition and toast alerts).

### 2. WCAG 2.2 Level AA Accessibility Audit Checklist
* **Color Contrast:** All text must maintain $\ge 4.5:1$ contrast ratio against light and dark backgrounds.
* **Focus Visible Rings:** Use `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` on all clickable buttons, matrix tiles, and inputs.
* **Full Keyboard Navigability:** Support `Tab`, `Arrow Up/Down/Left/Right`, `Enter`, and `Escape` for all selectors and tiles.
* **Semantic ARIA Landmarks:**
  * Matrix component must have `role="region"` and `aria-label="4-Floor Facility Status Matrix"`.
  * Tiles must use `role="button"`, `aria-pressed={isSelected}`, and descriptive `aria-label` (e.g. `"2F PWD Restroom: Status Alert, 28 flushes"`).
* **Touch Targets:** Minimum $44 \times 44\text{px}$ touch target size for mobile/tablet usability.

### 3. SDCA Institutional Brand Palette Tokens
* Primary: `sdca-red` (`#B5121B`), `sdca-darkred` (`#8F0D16`), `sdca-gold` (`#C9A227`).
* Telemetry: `hydro` (`#0284C7`), `sanitize` (`#6366F1`), `operational` (`#10B981`), `advisory` (`#F59E0B`), `critical` (`#EF4444`).

---

## 🔒 Security & Client-Side Safety Audit

1. **Role-Based UI Rendering:** Inspect user roles from `useAuth()` to ensure admin/supervisor-only controls remain hidden from unprivileged viewers.
2. **Safe Navigation & Memory Management:** Clean up all event listeners (`mousedown`, `touchstart`) and timeouts in `useEffect` return blocks to prevent memory leaks.
3. **No Sensitive Leaks:** Do not log raw user tokens or sensitive internal IDs in client console output.

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
  1. **Building Pill**: `SDCA Annex Building` (Badge with `bg-slate-100 dark:bg-slate-800`).
  2. **Floor Select**: Dropdown with options: `All Floors (Campus Overview)`, `1st Floor`, `2nd Floor`, `3rd Floor`, `4th Floor`.
  3. **Room Select**: Enabled when a floor is selected; lists restrooms on that floor.
  4. **Reset Button**: Quickly resets filter back to "All Floors".
* WCAG Accessibility:
  * Focus rings (`focus-visible:ring-2 focus-visible:ring-[#B5121B]`).
  * `aria-label="Global facility and floor filter"`.

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
  * Highlight the currently active tile with an SDCA red border ring (`ring-2 ring-[#B5121B]`).

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
  * Insert `<GlobalFacilitySelector />` into the sticky top header.
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
# - Verify keyboard navigation (Tab through matrix tiles, Enter to select).
# - Test changing Floor to "2nd Floor" -> StatCards and header update.
# - Test clicking "3F Female 1" on the Matrix -> Global selector updates to 3F Female 1.
# - Test clicking "Reset" -> Returns to Campus Overview.
```
