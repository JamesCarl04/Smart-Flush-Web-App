import {
  ISSUE_REPORT_DISMISSAL_REASONS,
  parseDismissal,
  parseIssueReportStatus,
  safeSerializeIssueReport,
  scheduleLinkedReportRetention,
} from '@/lib/issue-report-moderation';

describe('issue report moderation contracts', () => {
  it('validates list statuses and rejects unknown filters', () => {
    expect(parseIssueReportStatus(null)).toBe('pending_review');
    expect(parseIssueReportStatus('confirmed')).toBe('confirmed');
    expect(() => parseIssueReportStatus('all')).toThrow('Invalid status');
  });

  it('serializes dashboard data without abuse-control or private evidence paths', () => {
    const value = safeSerializeIssueReport('report-1', {
      referenceCode: 'IR-ABC',
      deviceId: 'stall-1',
      device: { id: 'stall-1', name: 'Stall 1', building: 'Annex', floor: '4F', location: 'Male Restroom' },
      category: 'no_water',
      status: 'pending_review',
      confirmationCount: 2,
      firstReportedAt: { toMillis: () => 100 },
      lastReportedAt: { toMillis: () => 200 },
      fingerprint: 'secret',
      rateLimitKey: 'internal',
      openKey: 'private-lock',
    }, [{ id: 'submission-1', description: 'No water', evidence: { state: 'stored', objectPath: 'private/path', contentType: 'image/png', size: 42 } }]);

    expect(value).toEqual(expect.objectContaining({
      id: 'report-1',
      deviceId: 'stall-1',
      category: 'no_water',
      confirmationCount: 2,
      firstReportedAt: 100,
      lastReportedAt: 200,
      descriptions: ['No water'],
      evidence: [{ submissionId: 'submission-1', contentType: 'image/png', size: 42 }],
    }));
    expect(JSON.stringify(value)).not.toMatch(/fingerprint|rateLimit|openKey|private\/path/);
  });

  it('enforces dismissal reasons and a note for other', () => {
    expect(ISSUE_REPORT_DISMISSAL_REASONS).toContain('invalid_report');
    expect(parseDismissal({ reason: 'already_resolved' })).toEqual({ reason: 'already_resolved', note: null });
    expect(() => parseDismissal({ reason: 'other', note: '   ' })).toThrow('note');
    expect(() => parseDismissal({ reason: 'not_allowed' })).toThrow('reason');
  });

  it('schedules linked report evidence retention in the task transaction', () => {
    const update = jest.fn();
    const transaction = { update } as unknown as FirebaseFirestore.Transaction;
    const db = { collection: jest.fn(() => ({ doc: jest.fn((id: string) => ({ id })) })) } as unknown as FirebaseFirestore.Firestore;
    const terminalAt = { toMillis: () => 1_000 };

    scheduleLinkedReportRetention(transaction, db, { issueReportId: 'report-1' }, terminalAt, 'linked_task_completed');

    expect(update).toHaveBeenCalledWith(
      { id: 'report-1' },
      expect.objectContaining({
        'evidenceRetention.state': 'scheduled',
        'evidenceRetention.terminalReason': 'linked_task_completed',
        'evidenceRetention.expiresAt': expect.objectContaining({ toMillis: expect.any(Function) }),
      }),
    );
    expect((update.mock.calls[0][1]['evidenceRetention.expiresAt'] as { toMillis(): number }).toMillis()).toBe(7_776_001_000);
  });
});
