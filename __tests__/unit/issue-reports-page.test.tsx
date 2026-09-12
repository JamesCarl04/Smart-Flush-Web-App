/** @jest-environment jsdom */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const mockUseAuth = jest.fn();
const mockApiFetch = jest.fn();
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import IssueReportsPage from '@/app/(dashboard)/issue-reports/page';

describe('issue reports page authority gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    { role: null, roleLoading: true, label: 'loading' },
    { role: 'supervisor', roleLoading: false, label: 'supervisor' },
    { role: 'maintenance', roleLoading: false, label: 'maintenance' },
    { role: 'viewer', roleLoading: false, label: 'viewer' },
    { role: 'user', roleLoading: false, label: 'ordinary user' },
  ])('does not call report APIs for $label', ({ role, roleLoading }) => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, role, roleLoading, roleError: null });
    render(<IssueReportsPage />);
    expect(mockApiFetch).not.toHaveBeenCalled();
    if (!roleLoading) expect(screen.getByText(/access denied/i)).toBeTruthy();
  });

  it('shows access denied without data for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, roleLoading: false, roleError: null });
    render(<IssueReportsPage />);
    expect(screen.getByText(/access denied/i)).toBeTruthy();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('loads pending report details for an exact admin only', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' }, role: 'admin', roleLoading: false, roleError: null });
    mockApiFetch.mockResolvedValue({ success: true, data: [{
      id: 'r1', deviceId: 'stall-1', category: 'no_water', confirmationCount: 3,
      firstReportedAt: 100, lastReportedAt: 200, descriptions: ['No water at all'], evidence: [],
      submissions: [{ submissionId: 's1', photoCaptureStatus: 'unavailable', photoCapturedAt: null, submittedAt: 200 }],
      device: { name: 'Stall 1', location: '4F Restroom' }, status: 'pending_review',
    }] });
    render(<IssueReportsPage />);
    await waitFor(() => expect(screen.getByText('Stall 1')).toBeTruthy());
    expect(screen.getByText('No water at all')).toBeTruthy();
    expect(screen.getByText('Submitted without photo')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/issue-reports?status=pending_review', expect.objectContaining({ uid: 'admin-1' }));
  });

    it('automatically refetches reports every 10 seconds and on refresh events', async () => {
    jest.useFakeTimers();
    try {
      mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' }, role: 'admin', roleLoading: false, roleError: null });
      mockApiFetch.mockResolvedValue({ success: true, data: [] });

      await act(async () => {
        render(<IssueReportsPage />);
      });
      // All 3 statuses are preloaded on mount for instant tab switching
      expect(mockApiFetch).toHaveBeenCalledTimes(3);

      // Advance 10 seconds for polling interval
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(mockApiFetch).toHaveBeenCalledTimes(4);

      // Dispatch issue-reports:refresh event
      await act(async () => {
        window.dispatchEvent(new Event('issue-reports:refresh'));
      });
      expect(mockApiFetch).toHaveBeenCalledTimes(7);
    } finally {
      jest.useRealTimers();
    }
  });

  it('switches tabs instantaneously without showing Loading reports text', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' }, role: 'admin', roleLoading: false, roleError: null });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('dismissed')) {
        return Promise.resolve({ success: true, data: [{
          id: 'r-dismissed', deviceId: 'stall-2', category: 'odor', confirmationCount: 1,
          firstReportedAt: 100, lastReportedAt: 200, descriptions: ['Mild odor reported'], evidence: [],
          device: { name: 'Stall 2', location: '1F Restroom' }, status: 'dismissed',
        }] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    await act(async () => {
      render(<IssueReportsPage />);
    });

    // Clicking Dismissed tab
    const dismissedTab = screen.getByRole('tab', { name: /dismissed/i });
    await act(async () => {
      fireEvent.click(dismissedTab);
    });

    // Report content is instantly rendered from preloaded cache
    expect(screen.getByText('Stall 2')).toBeTruthy();
    expect(screen.getByText('Mild odor reported')).toBeTruthy();
    // Ensure "Loading reports…" never appears
    expect(screen.queryByText(/loading reports/i)).toBeNull();
  });
});
