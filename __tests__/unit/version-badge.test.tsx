/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import packageInfo from '@/package.json';

const mockUseAuth = jest.fn();
const mockUseAlerts = jest.fn();
const mockUseTasks = jest.fn();
const mockUsePresentationMode = jest.fn();
const mockUseTheme = jest.fn();
const mockUseProfile = jest.fn();

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
}));

jest.mock('@/hooks/useTasks', () => ({
  useTasks: () => mockUseTasks(),
}));

jest.mock('@/hooks/usePresentationMode', () => ({
  usePresentationMode: () => mockUsePresentationMode(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/profile',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ role: 'admin' }),
  }),
}));

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin-uid', email: 'admin@klir.local' } },
}));

import DashboardLayout from '@/app/(dashboard)/layout';
import ProfilePage from '@/app/(dashboard)/profile/page';

describe('Web App Application Version Badge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-123', email: 'admin@klir.com', displayName: 'System Admin' },
      role: 'admin',
      roleLoading: false,
      roleError: null,
      logout: jest.fn(),
    });
    mockUseAlerts.mockReturnValue({
      alerts: [],
      unreadCount: 0,
      loading: false,
      refetch: jest.fn(),
    });
    mockUseTasks.mockReturnValue({
      tasks: [],
      pendingCount: 0,
      loading: false,
      refetch: jest.fn(),
    });
    mockUsePresentationMode.mockReturnValue({
      isPresentationMode: false,
      togglePresentationMode: jest.fn(),
    });
    mockUseTheme.mockReturnValue({
      theme: 'light',
      toggleTheme: jest.fn(),
    });
    mockUseProfile.mockReturnValue({
      user: { uid: 'admin-123', email: 'admin@klir.com', displayName: 'System Admin' },
      notifPrefs: { criticalAlerts: true, highPriorityAlerts: true },
      loading: false,
      updateProfile: jest.fn(),
      changePassword: jest.fn(),
      updateNotifications: jest.fn(),
    });
  });

  it('renders package.json version badge in ProfilePage header', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByText(`Klir Admin Web • v${packageInfo.version}`),
      ).toBeTruthy();
    });
  });

  it('renders package.json version badge in DashboardLayout navigation sidebar', async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      const versionBadges = screen.getAllByText(`v${packageInfo.version}`);
      expect(versionBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders gracefully without crashing when alerts and tasks are undefined', async () => {
    mockUseAlerts.mockReturnValue({
      alerts: undefined,
      unreadCount: undefined,
      loading: false,
      refetch: jest.fn(),
    });
    mockUseTasks.mockReturnValue({
      tasks: undefined,
      pendingCount: undefined,
      loading: false,
      refetch: jest.fn(),
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      const versionBadges = screen.getAllByText(`v${packageInfo.version}`);
      expect(versionBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
