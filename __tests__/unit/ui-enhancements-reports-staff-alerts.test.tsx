/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AlertsPage, {
  formatAlertTitle,
  isConnectionAlert,
  isErrorOrCriticalAlert,
} from '@/app/(dashboard)/alerts/page';
import { getStatusBadge, getInspectionBadge } from '@/app/(dashboard)/reports/page';
import StaffManagementPage, { StaffMember } from '@/app/(dashboard)/staff/page';

// ─── MOCKS ─────────────────────────────────────────────────────────────

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'admin-1',
      email: 'admin@sdca.edu.ph',
      displayName: 'System Admin',
      getIdToken: jest.fn().mockResolvedValue('test-token'),
    },
    role: 'admin',
    roleLoading: false,
  }),
}));

const mockAlerts = [
  {
    id: 'alert-1',
    type: 'hardware_pump_failure',
    message: 'Water pump failure detected on toilet-01.',
    severity: 'high' as const, // Real alert-engine severity (must be Tier 1 Red!)
    timestamp: { _seconds: 1700000000 },
    acknowledged: false,
  },
  {
    id: 'alert-2',
    type: 'water_overuse',
    message: 'Water overuse detected on toilet-01: 8L exceeds threshold of 2L.',
    severity: 'high' as const, // Usage limit warning (Tier 2 Amber)
    timestamp: { _seconds: 1700000000 },
    acknowledged: false,
  },
  {
    id: 'alert-3',
    type: 'device_offline',
    message: 'Device toilet-01 lost internet connection.',
    severity: 'medium' as const, // Connection offline (Tier 1 Red)
    timestamp: { _seconds: 1700000000 },
    acknowledged: false,
  },
  {
    id: 'alert-4',
    type: 'routine_cleaning_notice',
    message: 'Daily cleaning cycle benchmark achieved.',
    severity: 'low' as const, // Info notice (Tier 3 Slate)
    timestamp: { _seconds: 1700000000 },
    acknowledged: true, // Acknowledged (Tier 3 Slate)
  },
];

jest.mock('@/hooks/useAlerts', () => ({
  useAlerts: () => ({
    alerts: mockAlerts.map((a) => ({
      id: a.id,
      title: a.type,
      description: a.message,
      severity: a.severity,
      timestamp: new Date(a.timestamp._seconds * 1000),
      acknowledged: a.acknowledged,
    })),
    unreadCount: 3,
    loading: false,
    acknowledgeAlert: jest.fn(),
    acknowledgeAlerts: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({
    tasks: [],
    loading: false,
  }),
}));

jest.mock('@/lib/viewed-alerts', () => ({
  getViewedTaskAlertIds: () => [],
  markTaskAlertsViewed: jest.fn(),
}));

const mockStaffList: StaffMember[] = [
  {
    id: 'staff-1',
    uid: 'staff-1',
    displayName: 'Juan Dela Cruz',
    email: 'jdelacruz@sdca.edu.ph',
    role: 'supervisor',
    building: 'Main Campus',
    shift: '1st',
    active: true,
    isAvailable: true,
    currentTaskId: null,
  },
  {
    id: 'staff-2',
    uid: 'staff-2',
    displayName: 'Maria Santos',
    email: 'msantos@sdca.edu.ph',
    role: 'technician',
    building: 'SDCA Annex',
    shift: '2nd',
    active: true,
    isAvailable: false,
    currentTaskId: 'task-101',
  },
  {
    id: 'staff-3',
    uid: 'staff-3',
    displayName: 'Antonio Luna',
    email: 'aluna@sdca.edu.ph',
    role: 'admin',
    building: 'Main Campus',
    shift: '1st',
    active: true,
    isAvailable: true,
    currentTaskId: null,
  },
];

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'staff-1',
        uid: 'staff-1',
        displayName: 'Juan Dela Cruz',
        email: 'jdelacruz@sdca.edu.ph',
        role: 'supervisor',
        building: 'Main Campus',
        shift: '1st',
        active: true,
        isAvailable: true,
        currentTaskId: null,
      },
      {
        id: 'staff-2',
        uid: 'staff-2',
        displayName: 'Maria Santos',
        email: 'msantos@sdca.edu.ph',
        role: 'technician',
        building: 'SDCA Annex',
        shift: '2nd',
        active: true,
        isAvailable: false,
        currentTaskId: 'task-101',
      },
      {
        id: 'staff-3',
        uid: 'staff-3',
        displayName: 'Antonio Luna',
        email: 'aluna@sdca.edu.ph',
        role: 'admin',
        building: 'Main Campus',
        shift: '1st',
        active: true,
        isAvailable: true,
        currentTaskId: null,
      },
    ],
  }),
}));

// ─── TESTS ─────────────────────────────────────────────────────────────

describe('UI Enhancements Verification Suite', () => {
  describe('Issue #1: Reports Page Badges (Icon Removal & Pure Typography)', () => {
    it('renders getStatusBadge without any SVG icons for all statuses', () => {
      const statuses: ('completed' | 'pending' | 'acknowledged' | 'flagged' | 'rechecking')[] = [
        'completed',
        'pending',
        'acknowledged',
        'flagged',
        'rechecking',
      ];

      for (const status of statuses) {
        const { container } = render(<div>{getStatusBadge(status)}</div>);
        // Verify text exists
        expect(container.textContent?.trim().length).toBeGreaterThan(0);
        // Verify ZERO SVG icons are rendered inside the badge
        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBe(0);
      }
    });

    it('renders getInspectionBadge without any SVG icons for all inspection statuses', () => {
      const inspectionStatuses: ('approved' | 'flagged' | 'pending_review')[] = [
        'approved',
        'flagged',
        'pending_review',
      ];

      for (const status of inspectionStatuses) {
        const { container } = render(<div>{getInspectionBadge(status)}</div>);
        expect(container.textContent?.trim().length).toBeGreaterThan(0);
        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBe(0);
      }
    });
  });

  describe('Issue #2: Staff Table Row Hover & Focus Indicators', () => {
    it('renders absolute left hover/focus indicator bar across ALL rows, not just the first row', async () => {
      const { container } = render(<StaffManagementPage />);

      let rows: NodeListOf<Element> = container.querySelectorAll('tbody tr');
      await waitFor(() => {
        rows = container.querySelectorAll('tbody tr');
        expect(rows.length).toBe(3);
      });

      rows.forEach((row, index) => {
        // 1. Row must have group and focus-within classes
        expect(row.className).toContain('group');
        expect(row.className).toContain('focus-within:bg-slate-50/70');

        // 2. First cell must be relative
        const firstCell = row.querySelector('td:first-child');
        expect(firstCell?.className).toContain('relative');

        // 3. Must contain absolute left indicator bar with group-hover
        const indicator = firstCell?.querySelector('.absolute.left-0');
        expect(indicator).toBeTruthy();
        expect(indicator?.className).toContain('group-hover:bg-[#B5121B]');
        expect(indicator?.className).toContain('group-focus-within:bg-[#B5121B]');
      });
    });
  });

  describe('Issue #3: System Alerts 3-Tier System, Plain English & Touch Targets', () => {
    it('formats raw snake_case, hyphenated, and uppercase alert types into plain English', () => {
      expect(formatAlertTitle('hardware_pump_failure')).toBe('Water Pump Failure');
      expect(formatAlertTitle('water_overuse')).toBe('High Water Consumption');
      expect(formatAlertTitle('flush_count_exceeded')).toBe('High Usage Volume Exceeded');
      expect(formatAlertTitle('device_offline')).toBe('Device Offline / Connection Lost');
      expect(formatAlertTitle('device-offline')).toBe('Device Offline / Connection Lost');
      expect(formatAlertTitle('VALVE_FAULT')).toBe('Valve Fault');
      expect(formatAlertTitle('Maintenance Task Overdue')).toBe('Maintenance Task Overdue');
    });

    it('identifies connection alerts properly and isolates them from tasks', () => {
      const connectionAlert = {
        id: '1',
        title: 'device_offline',
        description: 'Device lost internet connection',
        severity: 'medium' as const,
        timestamp: new Date(),
        acknowledged: false,
        source: 'system' as const,
      };
      expect(isConnectionAlert(connectionAlert)).toBe(true);

      const taskAlert = {
        id: '2',
        title: 'Maintenance Task Overdue',
        description: 'Offline pipe inspection needed',
        severity: 'medium' as const,
        timestamp: new Date(),
        acknowledged: false,
        source: 'task' as const,
        taskId: 't-1',
        deviceId: 'd-1',
      };
      expect(isConnectionAlert(taskAlert)).toBe(false);
    });

    it('classifies hardware pump failure and hardware errors as Tier 1 Red even with severity high', () => {
      const pumpFailureAlert = {
        id: '1',
        title: 'hardware_pump_failure',
        description: 'Water pump failure detected',
        severity: 'high' as const,
        timestamp: new Date(),
        acknowledged: false,
        source: 'system' as const,
      };
      expect(isErrorOrCriticalAlert(pumpFailureAlert)).toBe(true);
    });

    it('renders AlertsPage with Tier 1 Red badges and borders for errors & offline items', () => {
      const { container } = render(<AlertsPage />);

      // Water Pump Failure should render in English
      expect(screen.getByText('Water Pump Failure')).toBeTruthy();

      // Offline badge and Error/Issue badge in rose-800
      const redBadges = container.querySelectorAll('.text-rose-800');
      expect(redBadges.length).toBeGreaterThanOrEqual(2);

      // Red left borders for critical/error/offline items
      const redBorders = container.querySelectorAll('.border-l-rose-500');
      expect(redBorders.length).toBeGreaterThanOrEqual(2);
    });

    it('renders Tier 2 Amber styling for usage warnings', () => {
      const { container } = render(<AlertsPage />);

      // High Water Consumption renders in English
      expect(screen.getByText('High Water Consumption')).toBeTruthy();

      // Amber left borders for warnings
      const amberBorders = container.querySelectorAll('.border-l-amber-500');
      expect(amberBorders.length).toBeGreaterThanOrEqual(1);

      const amberBadges = container.querySelectorAll('.text-amber-900');
      expect(amberBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('renders Tier 3 Neutral Slate styling for acknowledged alert without emerald green', () => {
      render(<AlertsPage />);

      const ackBadge = screen.getByText('Acknowledged');
      expect(ackBadge).toBeTruthy();
      expect(ackBadge.className).not.toContain('bg-emerald-50');
      expect(ackBadge.className).not.toContain('text-emerald-700');
      expect(ackBadge.className).toContain('text-slate-700');
    });

    it('ensures action buttons meet minimum 44px touch target requirement', () => {
      const { container } = render(<AlertsPage />);

      const dismissButtons = screen.getAllByLabelText('Dismiss Alert');
      dismissButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]');
        expect(btn.className).toContain('min-w-[44px]');
      });

      const acknowledgeButtons = screen.getAllByRole('button', { name: /acknowledge/i });
      acknowledgeButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]');
      });

      const markAllBtn = screen.getByRole('button', { name: /mark all as read/i });
      expect(markAllBtn.className).toContain('min-h-[44px]');
    });
  });
});
