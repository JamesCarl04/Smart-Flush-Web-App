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

  it('automatically refetches reports every 10 seconds and on refresh triggers', async () => {
    jest.useFakeTimers();
    try {
      mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' }, role: 'admin', roleLoading: false, roleError: null });
      mockApiFetch.mockResolvedValue({ success: true, data: [] });

      render(<IssueReportsPage />);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);

      // Advance 10 seconds for polling interval
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(mockApiFetch).toHaveBeenCalledTimes(2);

      // Click manual refresh button
      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      await act(async () => {
        fireEvent.click(refreshBtn);
      });
      expect(mockApiFetch).toHaveBeenCalledTimes(3);

      // Dispatch issue-reports:refresh event
      await act(async () => {
        window.dispatchEvent(new Event('issue-reports:refresh'));
      });
      expect(mockApiFetch).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });
});
