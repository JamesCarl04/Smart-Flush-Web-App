/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockUseAuth = jest.fn();
const mockApiFetch = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

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
  {
    id: 'staff-4',
    uid: 'staff-4',
    displayName: 'Pedro Penduko',
    email: 'ppenduko@sdca.edu.ph',
    role: 'technician',
    building: 'SDCA Annex',
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

    it('filters staff by facility dropdown', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const facilitySelect = screen.getByLabelText(/filter by facility/i);

      fireEvent.change(facilitySelect, { target: { value: 'SDCA Annex' } });
      expect(screen.getByText('Maria Santos')).toBeTruthy();
      expect(screen.getByText('Pedro Penduko')).toBeTruthy();
      expect(screen.queryByText('Juan Dela Cruz')).toBeNull();

      fireEvent.change(facilitySelect, { target: { value: 'Central Storage' } });
      expect(screen.queryByText('Maria Santos')).toBeNull();
      expect(screen.queryByText('Juan Dela Cruz')).toBeNull();
    });

    it('dismisses modal on Escape key press', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));
      expect(screen.getByText('Provision New Staff Member')).toBeTruthy();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Provision New Staff Member')).toBeNull();
    });
  });

  describe('Provisioning Modal (+ Add Staff Member)', () => {
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

    it('opens modal on primary CTA click and validates required fields', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));

      expect(screen.getByText('Provision New Staff Member')).toBeTruthy();

      // Submit without filling
      fireEvent.click(screen.getByText('Provision Staff Member'));

      expect(screen.getByText('Full name is required')).toBeTruthy();
      expect(screen.getByText('Institutional email is required')).toBeTruthy();
    });

    it('successfully provisions new staff and calls POST /api/staff', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));

      // Fill in fields
      fireEvent.change(screen.getByPlaceholderText('Maria Santos'), {
        target: { value: 'Clara Del Rosario' },
      });
      fireEvent.change(screen.getByPlaceholderText('msantos@sdca.edu.ph'), {
        target: { value: 'cdelrosario@sdca.edu.ph' },
      });

      mockApiFetch.mockResolvedValueOnce({
        success: true,
        uid: 'new-staff-uid',
        resetLink: 'https://example.com/reset',
      });

      fireEvent.click(screen.getByText('Provision Staff Member'));

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
              building: 'Main Campus',
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

  describe('Action Handlers (Edit, Reset, Deactivate)', () => {
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

    it('toggles deactivation of staff member via PATCH /api/staff/:id', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      // Open action menu for Juan Dela Cruz
      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      expect(screen.getByText('Deactivate Account')).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.click(screen.getByText('Deactivate Account'));

      await waitFor(() => {
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
          expect.stringContaining('Juan Dela Cruz deactivated'),
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

    it('opens edit modal and updates building and shift assignment', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
      });

      const menuButtons = screen.getAllByLabelText(/action menu for/i);
      fireEvent.click(menuButtons[0]);

      fireEvent.click(screen.getByText('Edit Assignment'));

      expect(screen.getByText('Edit Assignment')).toBeTruthy();
      expect(screen.getByText(/Updating facility, shift, and role for/)).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce({ success: true });

      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/staff/staff-1',
          expect.objectContaining({ uid: 'admin-1' }),
          expect.objectContaining({
            method: 'PATCH',
          }),
        );
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Updated assignment for Juan Dela Cruz'),
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
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      expect(document.body.style.overflow).toBe('');
      expect(document.documentElement.style.overflow).toBe('');

      fireEvent.click(screen.getByText('+ Add Staff Member'));
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
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));
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
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));
      expect(main.style.overflow).toBe('hidden');

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(main.style.overflow).toBe('auto');

      document.body.removeChild(main);
    });

    it('portals modal dialog to document.body with z-[100] covering the entire viewport and top header', async () => {
      render(<StaffManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('+ Add Staff Member')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('+ Add Staff Member'));

      const dialog = screen.getByRole('dialog', { name: /provision new staff member/i });
      expect(dialog).toBeTruthy();
      expect(dialog.parentElement).toBe(document.body);
      expect(dialog.className).toContain('z-[100]');
      expect(dialog.className).toContain('fixed');
      expect(dialog.className).toContain('inset-0');
      expect(dialog.className).toContain('bg-slate-900/60');
    });
  });
});
