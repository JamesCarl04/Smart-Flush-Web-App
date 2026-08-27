const mockVerify = jest.fn();
const mockRequireAdmin = jest.fn();
const mockList = jest.fn();
const mockConfirm = jest.fn();
const mockDismiss = jest.fn();
const mockEvidence = jest.fn();

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: (...args: unknown[]) => mockVerify(...args),
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));
jest.mock('@/lib/issue-report-moderation', () => ({
  listIssueReports: (...args: unknown[]) => mockList(...args),
  confirmIssueReport: (...args: unknown[]) => mockConfirm(...args),
  dismissIssueReport: (...args: unknown[]) => mockDismiss(...args),
  readIssueReportEvidence: (...args: unknown[]) => mockEvidence(...args),
  parseIssueReportStatus: (value: string | null) => value ?? 'pending_review',
  parseDismissal: (value: unknown) => value,
}));

import { GET as listReports } from '@/app/api/issue-reports/route';
import { POST as confirmReport } from '@/app/api/issue-reports/[id]/confirm/route';
import { POST as dismissReport } from '@/app/api/issue-reports/[id]/dismiss/route';
import { GET as getEvidence } from '@/app/api/issue-reports/[id]/evidence/[submissionId]/route';

const forbidden = () => new Response(JSON.stringify({ success: false, error: 'Forbidden: admin only' }), { status: 403 });

describe('administrator-only issue report APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockResolvedValue({ uid: 'admin-1', email: 'admin@example.com' });
    mockRequireAdmin.mockResolvedValue(undefined);
    mockList.mockResolvedValue([]);
    mockConfirm.mockResolvedValue({ reportId: 'r1', taskId: 't1', status: 'confirmed' });
    mockDismiss.mockResolvedValue({ reportId: 'r1', status: 'dismissed' });
    mockEvidence.mockResolvedValue({ bytes: Buffer.from('png'), contentType: 'image/png', filename: 'evidence.png' });
  });

  it.each(['supervisor', 'maintenance', 'viewer', 'user'])('returns no listing data to %s', async () => {
    mockRequireAdmin.mockRejectedValueOnce(forbidden());
    const response = await listReports(new Request('http://localhost/api/issue-reports'));
    expect(response.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns 401 before listing for an unauthenticated request', async () => {
    mockVerify.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const response = await listReports(new Request('http://localhost/api/issue-reports'));
    expect(response.status).toBe(401);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('guards every action and evidence path before touching report data', async () => {
    for (const invoke of [
      () => confirmReport(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'r1' }) }),
      () => dismissReport(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'invalid_report' }) }), { params: Promise.resolve({ id: 'r1' }) }),
      () => getEvidence(new Request('http://localhost'), { params: Promise.resolve({ id: 'r1', submissionId: 's1' }) }),
    ]) {
      mockRequireAdmin.mockRejectedValueOnce(forbidden());
      const response = await invoke();
      expect(response.status).toBe(403);
    }
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockEvidence).not.toHaveBeenCalled();
  });

  it('lists safe data and streams evidence with defensive headers for an admin', async () => {
    mockList.mockResolvedValueOnce([{ id: 'r1', status: 'pending_review' }]);
    const listing = await listReports(new Request('http://localhost/api/issue-reports?status=pending_review'));
    expect(await listing.json()).toEqual({ success: true, data: [{ id: 'r1', status: 'pending_review' }] });

    const evidence = await getEvidence(new Request('http://localhost'), { params: Promise.resolve({ id: 'r1', submissionId: 's1' }) });
    expect(evidence.headers.get('Content-Type')).toBe('image/png');
    expect(evidence.headers.get('Content-Disposition')).toContain('inline');
    expect(evidence.headers.get('Cache-Control')).toContain('no-store');
    expect(evidence.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
