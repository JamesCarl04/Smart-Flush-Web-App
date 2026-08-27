/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';

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
      device: { name: 'Stall 1', location: '4F Restroom' }, status: 'pending_review',
    }] });
    render(<IssueReportsPage />);
    await waitFor(() => expect(screen.getByText('Stall 1')).toBeTruthy());
    expect(screen.getByText('No water at all')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/issue-reports?status=pending_review', expect.objectContaining({ uid: 'admin-1' }));
  });
});
