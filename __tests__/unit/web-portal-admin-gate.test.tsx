/** @jest-environment jsdom */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn();
const mockCookieSet = jest.fn();
const mockCookieRemove = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('@/lib/firebase', () => ({
  app: {},
}));

jest.mock('js-cookie', () => ({
  set: (...args: unknown[]) => mockCookieSet(...args),
  remove: (...args: unknown[]) => mockCookieRemove(...args),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: jest.fn(),
  }),
}));

import LoginPage from '@/app/portal-admin/login/page';

describe('Web Portal Admin Gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as any).location;
    (window as any).location = new URL('http://localhost/portal-admin/login');
  });

  it('renders login page and allows admin to log into web console', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: {
        getIdToken: jest.fn().mockResolvedValue('admin-token'),
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { role: 'admin' },
      }),
    } as Response);

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('name@organization.com'), {
      target: { value: 'admin@sdca.edu.ph' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'AdminPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Login to Dashboard/i }));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'admin@sdca.edu.ph',
        'AdminPassword123!',
      );
    });

    await waitFor(() => {
      expect(mockCookieSet).toHaveBeenCalledWith('auth-token', '1', expect.anything());
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it.each(['supervisor', 'maintenance', 'technician'])(
    'denies login for %s role with explicit mobile-app notice',
    async (nonAdminRole) => {
      mockSignInWithEmailAndPassword.mockResolvedValueOnce({
        user: {
          getIdToken: jest.fn().mockResolvedValue(`${nonAdminRole}-token`),
        },
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { role: nonAdminRole },
        }),
      } as Response);

      render(<LoginPage />);

      fireEvent.change(screen.getByPlaceholderText('name@organization.com'), {
        target: { value: `${nonAdminRole}@sdca.edu.ph` },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
        target: { value: 'Password123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Login to Dashboard/i }));

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(mockCookieRemove).toHaveBeenCalledWith('auth-token', { path: '/' });
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            'Access denied. The web portal is reserved exclusively for Administrators. Supervisors and Maintenance technicians must use the Klir Mobile App.',
          ),
        ).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('displays access denied message when navigated to with ?error=admin-only', async () => {
    (window as any).location = new URL('http://localhost/portal-admin/login?error=admin-only');

    render(<LoginPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Access denied. The web portal is reserved exclusively for Administrators. Supervisors and Maintenance technicians must use the Klir Mobile App.',
        ),
      ).toBeTruthy();
    });
  });
});
