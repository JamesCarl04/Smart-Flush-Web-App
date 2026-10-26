/** @jest-environment jsdom */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogout = jest.fn().mockResolvedValue(undefined);

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

const mockAuthState: {
  user: any;
  loading: boolean;
  role: string | null;
  roleLoading: boolean;
  logout: () => Promise<void>;
} = {
  user: null,
  loading: false,
  role: null,
  roleLoading: false,
  logout: mockLogout,
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/hooks/usePresentationMode', () => ({
  usePresentationMode: () => false,
}));

jest.mock('@/hooks/useAlerts', () => ({
  useAlerts: () => ({ alerts: [], unreadCount: 0 }),
}));

jest.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [] }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: jest.fn(),
  }),
}));

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

import DashboardLayout from '@/app/(dashboard)/layout';

describe('DashboardLayout Authoritative RBAC Gate', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as any).location;
    (window as any).location = { href: 'http://localhost/dashboard' };
  });

  afterAll(() => {
    (window as any).location = originalLocation;
  });

  it('renders children when authenticated user has admin role', async () => {
    mockAuthState.user = { uid: 'admin-1', email: 'admin@sdca.edu.ph', displayName: 'Admin User' };
    mockAuthState.role = 'admin';
    mockAuthState.loading = false;
    mockAuthState.roleLoading = false;

    render(
      <DashboardLayout>
        <div data-testid="dashboard-content">Admin Dashboard Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId('dashboard-content')).toBeTruthy();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost/dashboard');
  });

  it.each(['supervisor', 'maintenance', 'technician'])(
    'revokes session and redirects to login with ?error=admin-only when user has %s role',
    async (nonAdminRole) => {
      mockAuthState.user = { uid: 'user-1', email: `${nonAdminRole}@sdca.edu.ph`, displayName: 'Non-Admin' };
      mockAuthState.role = nonAdminRole;
      mockAuthState.loading = false;
      mockAuthState.roleLoading = false;

      render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Protected Content</div>
        </DashboardLayout>,
      );

      // Protected content and dashboard layout must NOT be rendered for non-admins
      expect(screen.queryByTestId('dashboard-content')).toBeNull();

      // Loading / signing out indicator should be displayed
      expect(screen.getByText('Signing out...')).toBeTruthy();

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(window.location.href).toBe('/portal-admin/login?error=admin-only');
      });
    },
  );

  it('redirects unauthenticated user to /portal-admin/login', async () => {
    mockAuthState.user = null;
    mockAuthState.role = null;
    mockAuthState.loading = false;
    mockAuthState.roleLoading = false;

    render(
      <DashboardLayout>
        <div data-testid="dashboard-content">Protected Content</div>
      </DashboardLayout>,
    );

    expect(screen.queryByTestId('dashboard-content')).toBeNull();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/portal-admin/login');
    });
  });
});
