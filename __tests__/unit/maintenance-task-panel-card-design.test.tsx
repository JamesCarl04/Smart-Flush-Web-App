/** @jest-environment jsdom */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocks
let mockSearchParams = new URLSearchParams();
const mockUseAuth = jest.fn();
const mockUseTasks = jest.fn();
const mockUseMaintenancePersonnel = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useTasks', () => ({
  useTasks: () => mockUseTasks(),
}));

jest.mock('@/hooks/useMaintenancePersonnel', () => ({
  useMaintenancePersonnel: () => mockUseMaintenancePersonnel(),
}));

jest.mock('@/lib/viewed-alerts', () => ({
  markTaskAlertsViewed: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/lib/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ role: 'admin' }),
  }),
}));

// Mock ToiletUnitSelect to keep tests lightweight
jest.mock('@/components/dashboard/ToiletUnitSelect', () => ({
  ToiletUnitSelect: () => <div data-testid="toilet-unit-select" />,
}));

import { MaintenanceTaskPanel } from '@/components/dashboard/MaintenanceTaskPanel';
import type { Task } from '@/types';

describe('MaintenanceTaskPanel - Card Design Threes & WCAG Standards', () => {
  const mockTasks: Task[] = [
    {
      id: 'task-pending-1',
      deviceId: 'toilet-1',
      deviceLabel: '1F Canteen Restroom',
      status: 'pending',
      triggerType: 'maintenance',
      automationTrigger: 'maintenance_due',
      message: '[Ticket #IR-4AA60193] [other] No waste can in restroom',
      createdAt: 1726000000000,
      acknowledgedAt: null,
      completedAt: null,
      assignedTo: 'tech-carlos',
      assignedToIds: ['tech-carlos'],
      assignmentType: 'individual',
      isBroadcast: false,
    },
    {
      id: 'task-ack-2',
      deviceId: 'toilet-2',
      deviceLabel: '2F Science Lab Stall 3',
      status: 'acknowledged',
      triggerType: 'student_report',
      message: 'Flush handle is loose',
      createdAt: 1726000000000,
      acknowledgedAt: 1726010000000,
      completedAt: null,
      assignedTo: 'tech-maria',
      assignedToIds: ['tech-maria'],
      assignmentType: 'individual',
      isBroadcast: false,
    },
    {
      id: 'task-completed-3',
      deviceId: 'toilet-1',
      deviceLabel: '1F Canteen Restroom',
      status: 'completed',
      triggerType: 'flush_count',
      message: 'High usage inspection completed',
      createdAt: 1726000000000,
      acknowledgedAt: 1726005000000,
      completedAt: 1726020000000,
      assignedTo: 'tech-carlos',
      assignedToIds: ['tech-carlos'],
      assignmentType: 'individual',
      isBroadcast: false,
    },
    {
      id: 'task-flagged-4',
      deviceId: 'toilet-2',
      deviceLabel: '2F Science Lab Stall 3',
      status: 'flagged',
      triggerType: 'manual',
      message: 'Water valve requires follow up check',
      flagReason: 'Valve still hissing after flush cycle completed',
      inspectedByName: 'Lead Inspector Robert',
      inspectedAt: 1726025000000,
      createdAt: 1726000000000,
      acknowledgedAt: 1726005000000,
      completedAt: 1726020000000,
      assignedTo: 'tech-carlos',
      assignedToIds: ['tech-carlos'],
      assignmentType: 'individual',
      isBroadcast: false,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();

    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-1', email: 'admin@sdca.edu.ph' },
      loading: false,
    });

    mockUseTasks.mockReturnValue({
      tasks: mockTasks,
      loading: false,
      error: null,
      refreshTasks: jest.fn(),
    });

    mockUseMaintenancePersonnel.mockReturnValue({
      personnel: [
        { id: 'tech-carlos', displayName: 'Carlos Garcia', email: 'carlos@sdca.edu.ph' },
        { id: 'tech-maria', displayName: 'Maria Santos', email: 'maria@sdca.edu.ph' },
      ],
      personnelById: {
        'tech-carlos': { id: 'tech-carlos', displayName: 'Carlos Garcia', email: 'carlos@sdca.edu.ph' },
        'tech-maria': { id: 'tech-maria', displayName: 'Maria Santos', email: 'maria@sdca.edu.ph' },
      },
      loading: false,
    });

    mockApiFetch.mockResolvedValue({
      success: true,
      data: [
        { id: 'toilet-1', name: '1F Canteen Restroom' },
        { id: 'toilet-2', name: '2F Science Lab Stall 3' },
      ],
    });
  });

  describe('3-Level Visual Hierarchy & 3-Zone Layout', () => {
    it('renders Level 1 identity in Zone 1 (location with map pin, priority badge, and status pill)', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // Verify locations are rendered
      expect(screen.getAllByText('1F Canteen Restroom').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('2F Science Lab Stall 3').length).toBeGreaterThanOrEqual(1);

      // Verify priority badges
      expect(screen.getByText('Routine Toilet Check')).toBeInTheDocument();
      expect(screen.getByText('Public Issue Report')).toBeInTheDocument();
      expect(screen.getByText('High Usage Check')).toBeInTheDocument();

      // Verify status pills for all 4 states
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Flagged for Re-inspection')).toBeInTheDocument();
    });

    it('extracts bracketed ticket codes and categories into neat pills in Zone 2', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // Verify ticket extraction: Ticket #IR-4AA60193
      expect(screen.getByText('Ticket #IR-4AA60193')).toBeInTheDocument();

      // Verify category pill: "other Issue"
      expect(screen.getByText('other Issue')).toBeInTheDocument();

      // Verify clean message without raw bracket prefix
      expect(screen.getByText('No waste can in restroom')).toBeInTheDocument();
      expect(
        screen.queryByText('[Ticket #IR-4AA60193] [other] No waste can in restroom'),
      ).not.toBeInTheDocument();
    });

    it('renders the Flagged Reason callout box in Zone 2 with inspector attribution', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      expect(screen.getByText('Flagged Reason:')).toBeInTheDocument();
      expect(
        screen.getByText('Valve still hissing after flush cycle completed'),
      ).toBeInTheDocument();
      expect(screen.getByText('Lead Inspector Robert')).toBeInTheDocument();
    });

    it('renders Zone 3 with assignee details and chronological timeline flow', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // Assignee details
      expect(screen.getAllByText('Carlos Garcia').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Maria Santos').length).toBeGreaterThanOrEqual(1);

      // Chronological flow markers
      expect(screen.getAllByText(/Created/i).length).toBeGreaterThanOrEqual(4);
      expect(screen.getAllByText(/Ack/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Done/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('WCAG 2.0 / 2.1 AA Compliance', () => {
    it('enforces min-h-[44px] touch targets on Edit and Delete action buttons', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // Find all edit buttons
      const editButtons = screen.getAllByRole('button', { name: /^edit task for/i });
      expect(editButtons.length).toBeGreaterThanOrEqual(1);
      editButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]');
      });

      // Find all delete buttons
      const deleteButtons = screen.getAllByRole('button', { name: /^delete task for/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
      deleteButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]');
      });
    });

    it('provides accessible names (aria-label) and focus rings for screen readers and keyboard users', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      const pendingEditBtn = screen.getByRole('button', {
        name: 'Edit task for 1F Canteen Restroom',
      });
      expect(pendingEditBtn).toBeInTheDocument();
      expect(pendingEditBtn.className).toContain('focus-visible:ring-2');

      const deleteButtons = screen.getAllByRole('button', {
        name: /delete task for/i,
      });
      deleteButtons.forEach((btn) => {
        expect(btn.className).toContain('focus-visible:ring-2');
        expect(btn.className).toContain('min-w-[44px]');
      });
    });
  });

  describe('Supervisor Action Required State', () => {
    it('renders unassigned supervisor warning and Assign button with 44px touch target', async () => {
      const supervisorTask: Task = {
        id: 'task-supervisor-1',
        deviceId: 'toilet-1',
        deviceLabel: '1F Canteen Restroom',
        status: 'unassigned',
        requiresSupervisorAssignment: true,
        triggerType: 'maintenance',
        message: 'No personnel available automatically',
        createdAt: 1726000000000,
        acknowledgedAt: null,
        completedAt: null,
        assignedTo: null,
        assignedToIds: [],
        assignmentType: 'individual',
        isBroadcast: false,
      };

      mockUseTasks.mockReturnValue({
        tasks: [supervisorTask],
        loading: false,
        error: null,
        refreshTasks: jest.fn(),
      });

      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      expect(
        screen.getByText('Unassigned — supervisor action required'),
      ).toBeInTheDocument();

      expect(
        screen.getByText('Unassigned (Pending supervisor dispatch)'),
      ).toBeInTheDocument();

      const assignBtn = screen.getByRole('button', {
        name: 'Assign task for 1F Canteen Restroom',
      });
      expect(assignBtn).toBeInTheDocument();
      expect(assignBtn.className).toContain('min-h-[44px]');
      expect(assignBtn.className).toContain('min-w-[44px]');
    });
  });

  describe('Advanced Edge Cases & Robustness', () => {
    it('renders assignee initials avatar for individual assigned technicians', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // Carlos Garcia initials = CG, Maria Santos initials = MS
      expect(screen.getAllByText('CG').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('MS').length).toBeGreaterThanOrEqual(1);
    });

    it('displays multi-staff ack progress count alongside ack timestamp', async () => {
      const multiAckTask: Task = {
        id: 'task-multi-ack',
        deviceId: 'toilet-1',
        deviceLabel: '1F Canteen Restroom',
        status: 'acknowledged',
        triggerType: 'maintenance',
        message: 'Multiple technicians assigned',
        createdAt: 1726000000000,
        acknowledgedAt: 1726005000000,
        completedAt: null,
        assignedTo: null,
        assignedToIds: ['tech-carlos', 'tech-maria'],
        assignmentType: 'team',
        isBroadcast: false,
        acknowledgedBy: {
          'tech-carlos': 1726005000000,
        },
      };

      mockUseTasks.mockReturnValue({
        tasks: [multiAckTask],
        loading: false,
        error: null,
        refreshTasks: jest.fn(),
      });

      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      expect(screen.getByText(/\(1\/2 staff ack\)/)).toBeInTheDocument();
    });

    it('extracts task.reportCategory even when message does not contain brackets', async () => {
      const reportCategoryTask: Task = {
        id: 'task-report-cat',
        deviceId: 'toilet-2',
        deviceLabel: '2F Science Lab Stall 3',
        status: 'pending',
        triggerType: 'student_report',
        reportCategory: 'water_leak',
        message: 'Floor is flooded near pipe joint',
        createdAt: 1726000000000,
        assignedTo: 'tech-carlos',
        assignedToIds: ['tech-carlos'],
      };

      mockUseTasks.mockReturnValue({
        tasks: [reportCategoryTask],
        loading: false,
        error: null,
        refreshTasks: jest.fn(),
      });

      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      expect(screen.getByText('water leak Issue')).toBeInTheDocument();
      expect(screen.getByText('Floor is flooded near pipe joint')).toBeInTheDocument();
    });

    it('extracts inverted bracket order [category] [Ticket #...] cleanly', async () => {
      const invertedBracketTask: Task = {
        id: 'task-inverted-bracket',
        deviceId: 'toilet-1',
        deviceLabel: '1F Canteen Restroom',
        status: 'pending',
        triggerType: 'student_report',
        message: '[cleanliness] [Ticket #IR-998877] Paper towels all over the floor',
        createdAt: 1726000000000,
      };

      mockUseTasks.mockReturnValue({
        tasks: [invertedBracketTask],
        loading: false,
        error: null,
        refreshTasks: jest.fn(),
      });

      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      expect(screen.getByText('Ticket #IR-998877')).toBeInTheDocument();
      expect(screen.getByText('cleanliness Issue')).toBeInTheDocument();
      expect(screen.getByText('Paper towels all over the floor')).toBeInTheDocument();
    });

    it('displays the Flagged event in the chronological timeline progression', async () => {
      await act(async () => {
        render(<MaintenanceTaskPanel />);
      });

      // task-flagged-4 has inspectedAt: 1726025000000
      expect(screen.getByText(/Flagged Sep 11, 2024/i)).toBeInTheDocument();
    });
  });
});
