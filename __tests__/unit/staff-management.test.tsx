/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const mockUseAuth = jest.fn();
const mockApiFetch = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockReauthenticateWithCredential = jest.fn();
const mockEmailAuthProviderCredential = jest.fn();

jest.mock('firebase/auth', () => ({
  reauthenticateWithCredential: (...args: unknown[]) => mockReauthenticateWithCredential(...args),
  EmailAuthProvider: {
    credential: (...args: unknown[]) => mockEmailAuthProviderCredential(...args),
  },
}));

jest.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'admin-1',
      email: 'admin@sdca.edu.ph',
    },
  },
  db: {},
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import StaffManagementPage, { StaffMember } from '@/app/(dashboard)/staff/page';

const mockStaff: StaffMember[] = [
  {
    id: 'staff-1',
    uid: 'staff-1',
    displayName: 'Juan Dela Cruz',
    email: 'jdelacruz@sdca.edu.ph',
    role: 'supervisor',
    building: 'SDCA Annex Building',
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
    building: 'SDCA Annex Building',
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
    building: 'SDCA Annex Building',
    shift: '1st',
    active: true,
    isAvailable: true,
    currentTaskId: null,
  },
  {
    id: 'staff-4',
    uid: 'staff-4',
    displayName: 'Pedro Penduko',
    email: 'ppenduko@sdca.edu.ph',
    role: 'technician',
    building: 'SDCA Annex Building',
    shift: '3rd',
    active: false,
    isAvailable: false,
    currentTaskId: null,
  },
];

describe('StaffManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authorization Gate', () => {
    it('shows loading state while role is resolving', () => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1' },
        role: null,
        roleLoading: true,
      });

      render(<StaffManagementPage />);
      expect(screen.getByText(/validating authorization/i)).toBeTruthy();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it.each([
      ['supervisor', 'supervisor'],
      ['maintenance', 'maintenance'],
      ['viewer', 'viewer'],
      ['user', 'regular user'],
    ])('denies access to non-admin role: %s', (roleName) => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'user-1' },
        role: roleName,
        roleLoading: false,
      });

      render(<StaffManagementPage />);
      expect(screen.getByText(/access denied/i)).toBeTruthy();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('Dashboard KPIs and Roster Rendering', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1' },
        role: 'admin',
        roleLoading: false,
      });
      mockApiFetch.mockResolvedValue({
        success: true,
        data: mockStaff,
      });
    });

    it('loads staff data and calculates top 4 KPI cards correctly', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      // Total Staff: 4
      expect(screen.getByText('4')).toBeTruthy();
      // Supervisors: 1 (Juan)
      expect(screen.getByText('1')).toBeTruthy();
      // Technicians and Available both equal 2
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2);
    });

    it('renders static badges and contains ZERO emojis and ZERO pulsing CSS classes', async () => {
      const { container } = render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      // Check for zero pulsing classes
      expect(container.querySelector('.animate-pulse')).toBeNull();
      expect(container.querySelector('.animate-ping')).toBeNull();

      // Check that HTML content contains zero emojis (Unicode emoji regex)
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(container.innerHTML)).toBe(false);

      // Verify static indicators for status
      const availableBadges = screen.getAllByText('Available');
      expect(availableBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/On Task #task-10/)).toBeTruthy();
      expect(screen.getByText('Deactivated')).toBeTruthy();
    });

    it('filters staff by search query (name or email)', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const searchInput = screen.getByLabelText(/search staff roster/i);

      // Search by name
      fireEvent.change(searchInput, { target: { value: 'Maria' } });
      expect(screen.getByText('Maria Santos')).toBeTruthy();
      expect(screen.queryByText('Juan Dela Cruz')).toBeNull();

      // Search by email
      fireEvent.change(searchInput, { target: { value: 'aluna@sdca' } });
      expect(screen.getByText('Antonio Luna')).toBeTruthy();
      expect(screen.queryByText('Maria Santos')).toBeNull();
    });

    it('filters staff by role dropdown', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const roleSelect = screen.getByLabelText(/filter by role/i);

      // Filter by supervisor
      fireEvent.change(roleSelect, { target: { value: 'supervisor' } });
      expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      expect(screen.queryByText('Maria Santos')).toBeNull();
      expect(screen.queryByText('Antonio Luna')).toBeNull();

      // Filter by technician
      fireEvent.change(roleSelect, { target: { value: 'technician' } });
      expect(screen.getByText('Maria Santos')).toBeTruthy();
      expect(screen.getByText('Pedro Penduko')).toBeTruthy();
      expect(screen.queryByText('Juan Dela Cruz')).toBeNull();
    });

    it('automatically refreshes staff roster via silent background polling every 30 seconds', async () => {
      jest.useFakeTimers();
      try {
        render(<StaffManagementPage />);

        // Initial load on mount
        expect(mockApiFetch).toHaveBeenCalledTimes(1);

        // Advance 30 seconds
        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });

        // Polling triggered second load silently without error toasts
        expect(mockApiFetch).toHaveBeenCalledTimes(2);

        // Advance another 30 seconds
        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });
        expect(mockApiFetch).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears background polling interval on component unmount', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      try {
        const { unmount } = render(<StaffManagementPage />);
        expect(clearIntervalSpy).not.toHaveBeenCalled();
        unmount();
        expect(clearIntervalSpy).toHaveBeenCalled();
      } finally {
        clearIntervalSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('renders 3-dots action menu with smart auto-flipping, button toggling, and closes on outside click', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);

      // Initially collapsed
      expect(menuButtons[0].getAttribute('aria-expanded')).toBe('false');

      // Top row (index 0 - Juan Dela Cruz) opens downward with top-full
      fireEvent.click(menuButtons[0]);
      expect(menuButtons[0].getAttribute('aria-expanded')).toBe('true');
      expect(menuButtons[0].className).toContain('z-30');

      const topMenu = screen.getByRole('menu');
      expect(topMenu.className).toContain('top-full');
      expect(topMenu.className).toContain('mt-1.5');

      // Clicking same button again toggles menu closed
      fireEvent.click(menuButtons[0]);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(menuButtons[0].getAttribute('aria-expanded')).toBe('false');

      // Re-open and click outside on backdrop closes menu
      fireEvent.click(menuButtons[0]);
      expect(screen.getByRole('menu')).toBeTruthy();
      const backdrop = document.querySelector('.fixed.inset-0.z-20');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(screen.queryByRole('menu')).toBeNull();

      // Bottom row (index 3 - Pedro Penduko) flips upward with bottom-full
      fireEvent.click(menuButtons[3]);
      const bottomMenu = screen.getByRole('menu');
      expect(bottomMenu.className).toContain('bottom-full');
      expect(bottomMenu.className).toContain('mb-1.5');

      // Clicking action item closes menu
      fireEvent.click(screen.getByText('Edit Assignment'));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('positions action menu downward for short rosters (3 items) on middle row to avoid top clipping, while flipping upward only on the last row', async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        data: mockStaff.slice(0, 3), // Exactly 3 items: index 0, 1, 2
      });

      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      expect(menuButtons).toHaveLength(3);

      // Index 0: opens downward
      fireEvent.click(menuButtons[0]);
      const menu0 = screen.getByRole('menu');
      expect(menu0.className).toContain('top-full');
      fireEvent.click(menuButtons[0]);

      // Index 1 (middle row): opens downward (does not flip upward into the header)
      fireEvent.click(menuButtons[1]);
      const menu1 = screen.getByRole('menu');
      expect(menu1.className).toContain('top-full');
      expect(menu1.className).not.toContain('bottom-full');
      fireEvent.click(menuButtons[1]);

      // Index 2 (last row, has 2 rows above it): flips upward safely
      fireEvent.click(menuButtons[2]);
      const menu2 = screen.getByRole('menu');
      expect(menu2.className).toContain('bottom-full');
      expect(menu2.className).toContain('mb-1.5');
    });

    it('dismisses modal on Escape key press', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));
      expect(screen.getByText('Provision New Staff Member')).toBeTruthy();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Provision New Staff Member')).toBeNull();
    });
  });

  describe('Provisioning Modal (Add Staff Member) - Two-Step Flow', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1', email: 'admin@sdca.edu.ph' },
        role: 'admin',
        roleLoading: false,
      });
      mockApiFetch.mockResolvedValue({
        success: true,
        data: mockStaff,
      });
    });

    it('opens modal on primary CTA click and validates required fields on Step 1', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));

      expect(screen.getByText('Provision New Staff Member')).toBeTruthy();

      // Submit Step 1 without filling
      fireEvent.click(screen.getByRole('button', { name: /review & continue/i }));

      expect(screen.getByText('Full name is required')).toBeTruthy();
      expect(screen.getByText('Institutional email is required')).toBeTruthy();
      // Should not transition to Step 2
      expect(screen.queryByText('Confirm New Team Member')).toBeNull();
    });

    it('supports two-step creation: Step 1 input -> Step 2 review -> Back to Edit -> Confirm & Provision', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));

      // Fill in Step 1 fields
      fireEvent.change(screen.getByPlaceholderText('Maria Santos'), {
        target: { value: 'Clara Del Rosario' },
      });
      fireEvent.change(screen.getByPlaceholderText('msantos@sdca.edu.ph'), {
        target: { value: 'cdelrosario@sdca.edu.ph' },
      });

      // Proceed to Step 2 Review
      fireEvent.click(screen.getByRole('button', { name: /review & continue/i }));

      // Step 2 Review screen assertion
      await waitFor(() => {
        expect(screen.getByText('Confirm New Team Member')).toBeTruthy();
      });
      const reviewDialog = screen.getByRole('dialog', { name: /confirm new team member/i });
      expect(within(reviewDialog).getByText('Clara Del Rosario')).toBeTruthy();
      expect(within(reviewDialog).getByText('cdelrosario@sdca.edu.ph')).toBeTruthy();
      expect(within(reviewDialog).getByText('SDCA Annex Building')).toBeTruthy();
      expect(within(reviewDialog).getByText('1st Shift (Morning)')).toBeTruthy();
      expect(within(reviewDialog).getByText(/Password setup link will be emailed upon creation/i)).toBeTruthy();

      // Test "Back to Edit" returns to Step 1 without resetting form values
      fireEvent.click(screen.getByRole('button', { name: /back to edit/i }));
      expect(screen.getByText('Provision New Staff Member')).toBeTruthy();
      expect((screen.getByPlaceholderText('Maria Santos') as HTMLInputElement).value).toBe('Clara Del Rosario');
      expect((screen.getByPlaceholderText('msantos@sdca.edu.ph') as HTMLInputElement).value).toBe('cdelrosario@sdca.edu.ph');
      const facilityInput = screen.getByLabelText(/assigned facility/i) as HTMLInputElement;
      expect(facilityInput.value).toBe('SDCA Annex Building');
      expect(facilityInput.readOnly).toBe(true);

      // Proceed back to Step 2
      fireEvent.click(screen.getByRole('button', { name: /review & continue/i }));
      expect(screen.getByText('Confirm New Team Member')).toBeTruthy();

      // Mock API success for account provisioning
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        uid: 'new-staff-uid',
        resetLink: 'https://example.com/reset',
      });

      // Click Confirm & Create Account
      fireEvent.click(screen.getByRole('button', { name: /confirm & create account/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              displayName: 'Clara Del Rosario',
              email: 'cdelrosario@sdca.edu.ph',
              role: 'technician',
              building: 'SDCA Annex Building',
              shift: '1st',
              sendPasswordReset: true,
            }),
          }),
        );
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Clara Del Rosario provisioned'),
      );
    });
  });

  describe('Action Handlers (Edit, Reset, Deactivate, Reactivate)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1', email: 'admin@sdca.edu.ph' },
        role: 'admin',
        roleLoading: false,
      });
      mockApiFetch.mockResolvedValue({
        success: true,
        data: mockStaff,
      });
      mockReauthenticateWithCredential.mockReset();
      mockEmailAuthProviderCredential.mockReset();
    });

    it('opens edit modal with locked read-only role and locked facility and updates shift assignment without sending role', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      fireEvent.click(screen.getByText('Edit Assignment'));

      const editDialog = screen.getByRole('dialog', { name: /edit assignment/i });
      expect(editDialog).toBeTruthy();

      // Clean Role display without "Current Role (Locked)" and without sub-description
      expect(within(editDialog).getByText('Role')).toBeTruthy();
      expect(within(editDialog).getByText('Supervisor')).toBeTruthy();
      expect(within(editDialog).queryByText(/Current Role \(Locked\)/i)).toBeNull();
      expect(within(editDialog).queryByText(/Role permissions are set during account provisioning and cannot be altered via assignment editing/i)).toBeNull();
      expect(within(editDialog).queryByLabelText(/^role$/i)).toBeNull();

      // Facility is locked to SDCA Annex Building without helper text
      const facilityInput = within(editDialog).getByLabelText(/assigned facility/i) as HTMLInputElement;
      expect(facilityInput.value).toBe('SDCA Annex Building');
      expect(facilityInput.readOnly).toBe(true);

      // Change shift
      fireEvent.change(within(editDialog).getByLabelText(/assigned shift/i), {
        target: { value: '2nd' },
      });

      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-1',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
              building: 'SDCA Annex Building',
              shift: '2nd',
            }),
          }),
        );
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Updated assignment for Juan Dela Cruz'),
      );
    });

    it('requires step-up password authentication to deactivate staff member', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      // Open action menu for Juan Dela Cruz
      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      expect(screen.getByText('Deactivate Account')).toBeTruthy();

      // Click Deactivate Account opens the step-up confirmation modal
      fireEvent.click(screen.getByText('Deactivate Account'));

      expect(screen.getByRole('dialog', { name: /deactivate staff member/i })).toBeTruthy();
      expect(screen.getByText(/Step-up authentication required for access revocation/i)).toBeTruthy();
      expect(screen.getByText(/Deactivating this account will immediately revoke all active mobile and web sessions/i)).toBeTruthy();

      // 1. Submit without password -> shows error
      fireEvent.click(screen.getByRole('button', { name: /authorize & deactivate/i }));
      expect(screen.getByText('Administrator password is required to authorize deactivation.')).toBeTruthy();
      expect(mockReauthenticateWithCredential).not.toHaveBeenCalled();
      expect(mockApiFetch).not.toHaveBeenCalledWith(
        '/api/staff/staff-1',
        expect.anything(),
        expect.objectContaining({ method: 'PATCH' }),
      );

      // 2. Submit with wrong password -> shows rejection error
      mockEmailAuthProviderCredential.mockReturnValueOnce({ providerId: 'password' });
      mockReauthenticateWithCredential.mockRejectedValueOnce({ code: 'auth/wrong-password' });

      fireEvent.change(screen.getByPlaceholderText(/enter your current admin password/i), {
        target: { value: 'wrong-admin-password' },
      });
      fireEvent.click(screen.getByRole('button', { name: /authorize & deactivate/i }));

      await waitFor(() => {
        expect(screen.getByText('Incorrect administrator password. Please verify your credentials.')).toBeTruthy();
      });
      expect(mockApiFetch).not.toHaveBeenCalledWith(
        '/api/staff/staff-1',
        expect.anything(),
        expect.objectContaining({ method: 'PATCH' }),
      );

      // 3. Submit with correct password -> succeeds and executes PATCH
      mockEmailAuthProviderCredential.mockReturnValueOnce({ providerId: 'password' });
      mockReauthenticateWithCredential.mockResolvedValueOnce(undefined);
      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.change(screen.getByPlaceholderText(/enter your current admin password/i), {
        target: { value: 'valid-admin-password' },
      });
      fireEvent.click(screen.getByRole('button', { name: /authorize & deactivate/i }));

      await waitFor(() => {
        expect(mockReauthenticateWithCredential).toHaveBeenCalled();
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-1',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ active: false }),
          }),
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining('Juan Dela Cruz deactivated without altering task history'),
        );
        expect(screen.queryByRole('dialog', { name: /deactivate staff member/i })).toBeNull();
      });
    });

    it('removes Deactivate Account option entirely from UI action menu for administrator accounts and self', async () => {
      // Set current logged-in admin user to match staff-3 (Antonio Luna)
      mockUseAuth.mockReturnValue({
        user: { uid: 'staff-3', email: 'aluna@sdca.edu.ph' },
        role: 'admin',
        roleLoading: false,
      });

      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Antonio Luna')).toBeTruthy();
      });

      // Open Antonio Luna's action menu (index 2 in mockStaff - role is admin, isSelf is true)
      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[2]);

      // Deactivate Account button should NOT be rendered in the menu at all
      expect(screen.queryByRole('menuitem', { name: /deactivate account/i })).toBeNull();
      expect(screen.queryByText(/deactivate account/i)).toBeNull();

      // Only Edit Assignment and Send Password Reset are available
      expect(screen.getByRole('menuitem', { name: /edit assignment/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /send password reset/i })).toBeTruthy();

      // Close menu
      fireEvent.click(menuButtons[2]);

      // Open Juan Dela Cruz's action menu (index 0 - supervisor, not self)
      fireEvent.click(menuButtons[0]);

      // Non-admin account retains Deactivate Account option
      expect(screen.getByRole('menuitem', { name: /deactivate account/i })).toBeTruthy();
      fireEvent.click(menuButtons[0]);

      // Verify that another admin account (not self) also does NOT render Deactivate Account
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-other', email: 'other@sdca.edu.ph' },
        role: 'admin',
        roleLoading: false,
      });
      fireEvent.click(menuButtons[2]);
      expect(screen.queryByRole('menuitem', { name: /deactivate account/i })).toBeNull();
    });

    it('normalizes legacy phantom building (e.g. Main Campus) to SDCA Annex Building on edit and save', async () => {
      const legacyStaff: StaffMember[] = [
        {
          id: 'staff-legacy',
          uid: 'staff-legacy',
          displayName: 'Legacy Staff Member',
          email: 'legacy@sdca.edu.ph',
          role: 'technician',
          building: 'Main Campus',
          shift: '1st',
          active: true,
          isAvailable: true,
          currentTaskId: null,
        },
      ];

      mockApiFetch.mockResolvedValueOnce({
        success: true,
        data: legacyStaff,
      });

      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Legacy Staff Member')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);
      fireEvent.click(screen.getByText('Edit Assignment'));

      const editDialog = screen.getByRole('dialog', { name: /edit assignment/i });
      const facilityInput = within(editDialog).getByLabelText(/assigned facility/i) as HTMLInputElement;
      expect(facilityInput.value).toBe('SDCA Annex Building');

      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-legacy',
          expect.anything(),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
              building: 'SDCA Annex Building',
              shift: '1st',
            }),
          }),
        );
      });
    });

    it('handles rate-limiting (auth/too-many-requests) with accessible error message', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      fireEvent.click(screen.getByRole('menuitem', { name: /deactivate account/i }));

      mockEmailAuthProviderCredential.mockReturnValueOnce({ providerId: 'password' });
      mockReauthenticateWithCredential.mockRejectedValueOnce({ code: 'auth/too-many-requests' });

      fireEvent.change(screen.getByPlaceholderText(/enter your current admin password/i), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /authorize & deactivate/i }));

      await waitFor(() => {
        expect(screen.getByText(/too many failed attempts/i)).toBeTruthy();
      });
    });

    it('safely reactivates an inactive staff member directly without password challenge', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Pedro Penduko')).toBeTruthy();
      });

      // Pedro Penduko is inactive (active: false, index 3)
      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[3]);

      expect(screen.getByText('Reactivate Account')).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.click(screen.getByText('Reactivate Account'));

      // Reactivation should NOT open step-up modal and should directly execute PATCH
      expect(screen.queryByRole('dialog', { name: /deactivate staff member/i })).toBeNull();
      expect(mockReauthenticateWithCredential).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-4',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ active: true }),
          }),
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining('Pedro Penduko reactivated'),
        );
      });
    });

    it('requests password reset link via POST /api/staff/:id', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      mockApiFetch.mockResolvedValueOnce({
        success: true,
        resetLink: 'https://example.com/reset',
      });

      fireEvent.click(screen.getByText('Send Password Reset'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-1',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Password setup link generated'),
      );
    });
  });

  describe('Modal Viewport Constraints & Body Scroll Lock', () => {
    beforeEach(() => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1' },
        role: 'admin',
        roleLoading: false,
      });
      mockApiFetch.mockResolvedValue({
        success: true,
        data: mockStaff,
      });
    });

    it('locks body scroll when Add Staff modal opens and restores on Cancel button click', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');

      fireEvent.click(screen.getByText('Add Staff Member'));
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.documentElement.style.overflow).toBe('hidden');

      const modalDialog = screen.getByRole('dialog', { name: /provision new staff member/i });
      expect(modalDialog.className).toContain('fixed');
      expect(modalDialog.className).toContain('inset-0');
      expect(modalDialog.className).toContain('overflow-hidden');
      expect(modalDialog.className).toContain('overscroll-contain');

      // Verify card constraints prevent overflow
      const card = modalDialog.querySelector('.overflow-hidden');
      expect(card).toBeTruthy();
      expect(card?.className).toContain('max-h-[calc(100vh-2rem)]');

      // Verify internal scrolling container exists for form fields
      const scrollableBody = card?.querySelector('.overflow-y-auto');
      expect(scrollableBody).toBeTruthy();
      expect(scrollableBody?.className).toContain('min-h-0');
      expect(scrollableBody?.className).toContain('pr-2');

      // Click Cancel button
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('locks body scroll when Add Staff modal opens and restores on backdrop click', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.documentElement.style.overflow).toBe('hidden');

      const modalDialog = screen.getByRole('dialog', { name: /provision new staff member/i });

      // Clicking directly on backdrop should close modal
      fireEvent.click(modalDialog);
      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('locks body scroll when Edit Assignment modal opens and restores on close', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      fireEvent.click(screen.getByText('Edit Assignment'));
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.documentElement.style.overflow).toBe('hidden');

      const editDialog = screen.getByRole('dialog', { name: /edit assignment/i });
      expect(editDialog.className).toContain('fixed');
      expect(editDialog.className).toContain('inset-0');
      expect(editDialog.className).toContain('overflow-hidden');
      expect(editDialog.className).toContain('overscroll-contain');

      const editCard = editDialog.querySelector('.overflow-hidden');
      expect(editCard).toBeTruthy();
      expect(editCard?.className).toContain('max-h-[calc(100vh-2rem)]');

      const editScrollableBody = editCard?.querySelector('.overflow-y-auto');
      expect(editScrollableBody).toBeTruthy();
      expect(editScrollableBody?.className).toContain('min-h-0');
      expect(editScrollableBody?.className).toContain('pr-2');

      // Close modal
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('freezes and restores main element overflow when main is present in DOM', async () => {
      const main = document.createElement('main');
      main.style.overflow = 'auto';
      document.body.appendChild(main);

      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));
      expect(main.style.overflow).toBe('hidden');

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(main.style.overflow).toBe('auto');

      document.body.removeChild(main);
    });

    it('portals modal dialog to document.body with z-[100] covering the entire viewport and top header', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Add Staff Member'));

      const dialog = screen.getByRole('dialog', { name: /provision new staff member/i });
      expect(dialog).toBeTruthy();
      expect(dialog.parentElement).toBe(document.body);
      expect(dialog.className).toContain('z-[100]');
      expect(dialog.className).toContain('fixed');
      expect(dialog.className).toContain('inset-0');
      expect(dialog.className).toContain('bg-slate-900/60');
    });

    it('locks body scroll when Deactivation modal opens and restores on Cancel', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      fireEvent.click(screen.getByText('Deactivate Account'));
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.documentElement.style.overflow).toBe('hidden');

      const deactDialog = screen.getByRole('dialog', { name: /deactivate staff member/i });
      expect(deactDialog.className).toContain('fixed');
      expect(deactDialog.className).toContain('z-[100]');

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');
      expect(screen.queryByRole('dialog', { name: /deactivate staff member/i })).toBeNull();
    });
  });
});
