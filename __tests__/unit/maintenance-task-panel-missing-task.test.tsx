/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocks
let mockSearchParams = new URLSearchParams();
const mockUseAuth = jest.fn();
const mockUseTasks = jest.fn();
const mockUseMaintenancePersonnel = jest.fn();
const mockMarkTaskAlertsViewed = jest.fn();
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
  markTaskAlertsViewed: (...args: unknown[]) => mockMarkTaskAlertsViewed(...args),
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

// Mock ToiletUnitSelect to avoid heavy rendering
jest.mock('@/components/dashboard/ToiletUnitSelect', () => ({
  ToiletUnitSelect: () => <div data-testid="toilet-unit-select" />,
}));

import { MaintenanceTaskPanel } from '@/components/dashboard/MaintenanceTaskPanel';
import type { Task } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 'task-101',
    deviceId: 'toilet-1',
    deviceLabel: 'Ground Floor Restroom',
    status: 'pending',
    triggerType: 'maintenance',
    message: 'Fix flush valve',
    createdBy: 'admin-1',
    createdAt: Date.now() - 10000,
    acknowledgedAt: null,
    completedAt: null,
    assignedTo: null,
    assignedToIds: [],
    assignmentType: 'broadcast',
    isBroadcast: true,
  },
  {
    id: 'task-102',
    deviceId: 'toilet-2',
    deviceLabel: '2nd Floor Restroom',
    status: 'acknowledged',
    triggerType: 'student_report',
    message: 'Paper towel dispenser broken',
    createdBy: 'admin-1',
    createdAt: Date.now() - 50000,
    acknowledgedAt: Date.now() - 20000,
    completedAt: null,
    assignedTo: 'user-tech-1',
    assignedToIds: ['user-tech-1'],
    assignmentType: 'individual',
    isBroadcast: false,
  },
];

describe('MaintenanceTaskPanel - Missing Targeted Task Notification Banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();

    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-1', email: 'admin@sdca.edu.ph' },
      loading: false,
    });

    mockUseTasks.mockReturnValue({
      tasks: sampleTasks,
      loading: false,
      error: null,
      refreshTasks: jest.fn(),
    });

    mockUseMaintenancePersonnel.mockReturnValue({
      personnel: [],
      personnelById: {},
      loading: false,
    });

    mockApiFetch.mockResolvedValue({
      success: true,
      data: [
        { id: 'toilet-1', name: 'Ground Floor Restroom' },
        { id: 'toilet-2', name: '2nd Floor Restroom' },
      ],
    });

    // Mock scrollIntoView in jsdom
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('displays a dismissible warning banner with role="alert" when target taskId is not found', async () => {
    mockSearchParams = new URLSearchParams('taskId=task-deleted-999');

    await act(async () => {
      render(<MaintenanceTaskPanel />);
    });

    const alertBanner = screen.getByRole('alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Task Not Found');
    expect(alertBanner).toHaveTextContent('task-deleted-999');
    expect(alertBanner).toHaveTextContent(
      'could not be found. It may have been deleted or archived.',
    );

    const dismissButton = screen.getByRole('button', {
      name: /dismiss task not found notice/i,
    });
    expect(dismissButton).toBeInTheDocument();
  });

  it('allows dismissing the warning banner cleanly and does not re-appear on subsequent re-renders', async () => {
    mockSearchParams = new URLSearchParams('taskId=task-nonexistent-555');

    let rerenderFn: (ui: React.ReactElement) => void = () => {};
    await act(async () => {
      const { rerender } = render(<MaintenanceTaskPanel />);
      rerenderFn = rerender;
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', {
      name: /dismiss task not found notice/i,
    });
    await act(async () => {
      fireEvent.click(dismissButton);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Rerender with same query param
    await act(async () => {
      rerenderFn(<MaintenanceTaskPanel />);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays the warning banner when tasks finish loading and task list is completely empty', async () => {
    mockSearchParams = new URLSearchParams('taskId=task-empty-feed');
    mockUseTasks.mockReturnValue({
      tasks: [],
      loading: false,
      error: null,
      refreshTasks: jest.fn(),
    });

    await act(async () => {
      render(<MaintenanceTaskPanel />);
    });

    const alertBanner = screen.getByRole('alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('task-empty-feed');
    expect(screen.getByText('No tasks assigned yet')).toBeInTheDocument();
  });

  it('does NOT display the warning banner while tasks are still loading', async () => {
    mockSearchParams = new URLSearchParams('taskId=task-loading-check');
    mockUseTasks.mockReturnValue({
      tasks: [],
      loading: true,
      error: null,
      refreshTasks: jest.fn(),
    });

    await act(async () => {
      render(<MaintenanceTaskPanel />);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT display the warning banner when target taskId exists in tasks', async () => {
    mockSearchParams = new URLSearchParams('taskId=task-101');

    await act(async () => {
      render(<MaintenanceTaskPanel />);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockMarkTaskAlertsViewed).toHaveBeenCalledWith(['task-101']);
  });

  it('does NOT display the warning banner when no taskId is provided in query params', async () => {
    mockSearchParams = new URLSearchParams('');

    await act(async () => {
      render(<MaintenanceTaskPanel />);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
