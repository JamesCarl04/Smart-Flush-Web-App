const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
  adminStorage: {
    bucket: jest.fn(),
  },
}));

jest.mock('@/lib/fcm', () => ({
  sendTaskNotification: jest.fn().mockResolvedValue(undefined),
}));

import {
  ISSUE_REPORT_DISMISSAL_REASONS,
  confirmIssueReport,
  parseDismissal,
  parseIssueReportStatus,
  safeSerializeIssueReport,
  scheduleLinkedReportRetention,
} from '@/lib/issue-report-moderation';

describe('issue report moderation contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      referenceCode: 'IR-ABC',
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

  it('falls back to deterministic reference code when missing from report data', () => {
    const value = safeSerializeIssueReport('report-99-abc', {
      deviceId: 'stall-1',
      category: 'no_water',
      status: 'pending_review',
    }, []);

    expect(value.referenceCode).toBe('IR-REPORT99');
  });

  it('preserves existing reference code when present in report data', () => {
    const value = safeSerializeIssueReport('report-99-abc', {
      referenceCode: 'IR-CUSTOM1',
      deviceId: 'stall-1',
      category: 'no_water',
      status: 'pending_review',
    }, []);

    expect(value.referenceCode).toBe('IR-CUSTOM1');
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

  it('confirms pending report, sets ticket prefix in message, and records reference code in task', async () => {
    let committedTask: Record<string, unknown> | null = null;
    let committedReportUpdate: Record<string, unknown> | null = null;

    const mockTransaction = {
      get: jest.fn((ref: { _type?: string }) => {
        if (ref._type === 'report') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              status: 'pending_review',
              deviceId: 'stall-1',
              referenceCode: 'IR-TEST1234',
              category: 'water_leak',
              device: { name: 'Restroom 4F', building: 'Engineering', floor: '4' },
              confirmationCount: 2,
              lastReportedAt: 1000,
            }),
          });
        }
        if (ref._type === 'submissions') {
          return Promise.resolve({
            docs: [{ data: () => ({ description: 'Water pipe leaking badly' }) }],
          });
        }
        if (ref._type === 'users' || ref._type === 'tasks') {
          return Promise.resolve({ docs: [] });
        }
        return Promise.resolve({ exists: false });
      }),
      set: jest.fn((_ref: unknown, data: Record<string, unknown>) => {
        committedTask = data;
      }),
      update: jest.fn((_ref: unknown, data: Record<string, unknown>) => {
        committedReportUpdate = data;
      }),
      delete: jest.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: (tx: typeof mockTransaction) => Promise<unknown>) => {
      return cb(mockTransaction);
    });

    const reportRef = { _type: 'report', collection: jest.fn(() => ({ _type: 'submissions' })) };
    const taskDocRef = { id: 'task-new-123' };
    const usersColRef = { where: jest.fn(() => ({ _type: 'users' })) };
    const tasksColRef = { where: jest.fn(() => ({ _type: 'tasks' })) };
    const openKeysColRef = { doc: jest.fn(() => ({ _type: 'openKey' })) };

    mockCollection.mockImplementation((name: string) => {
      if (name === 'issueReports') return { doc: jest.fn(() => reportRef) };
      if (name === 'tasks') return { doc: jest.fn(() => taskDocRef), where: tasksColRef.where };
      if (name === 'users') return usersColRef;
      if (name === 'publicIssueReportOpenKeys') return openKeysColRef;
      return { doc: jest.fn(() => ({})) };
    });

    const outcome = await confirmIssueReport('report-1', { uid: 'admin-1', email: 'admin@test.com' });

    expect(outcome).toEqual({ reportId: 'report-1', taskId: 'task-new-123', status: 'confirmed' });
    expect(committedTask).toBeTruthy();
    expect((committedTask as unknown as { message: string }).message).toContain('[Ticket #IR-TEST1234]');
    expect((committedTask as unknown as { message: string }).message).toContain('Water pipe leaking badly');
    expect((committedTask as unknown as { issueReportReferenceCode: string }).issueReportReferenceCode).toBe('IR-TEST1234');
    expect((committedTask as unknown as { referenceCode: string }).referenceCode).toBe('IR-TEST1234');
    expect(committedReportUpdate).toMatchObject({
      status: 'confirmed',
      linkedTaskId: 'task-new-123',
      reviewedBy: 'admin-1',
    });
  });

  it('confirms report with deterministic ticket fallback when referenceCode was missing', async () => {
    let committedTask: Record<string, unknown> | null = null;
    let committedReportUpdate: Record<string, unknown> | null = null;

    const mockTransaction = {
      get: jest.fn((ref: { _type?: string }) => {
        if (ref._type === 'report') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              status: 'pending_review',
              deviceId: 'stall-2',
              // referenceCode intentionally missing
              category: 'no_water',
              device: { name: 'Restroom 2F' },
              confirmationCount: 1,
            }),
          });
        }
        if (ref._type === 'submissions') {
          return Promise.resolve({ docs: [] });
        }
        return Promise.resolve({ docs: [] });
      }),
      set: jest.fn((_ref: unknown, data: Record<string, unknown>) => {
        committedTask = data;
      }),
      update: jest.fn((_ref: unknown, data: Record<string, unknown>) => {
        committedReportUpdate = data;
      }),
      delete: jest.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: (tx: typeof mockTransaction) => Promise<unknown>) => {
      return cb(mockTransaction);
    });

    const reportRef = { _type: 'report', collection: jest.fn(() => ({ _type: 'submissions' })) };
    const taskDocRef = { id: 'task-fallback-456' };

    mockCollection.mockImplementation((name: string) => {
      if (name === 'issueReports') return { doc: jest.fn(() => reportRef) };
      if (name === 'tasks') return { doc: jest.fn(() => taskDocRef), where: jest.fn(() => ({ docs: [] })) };
      if (name === 'users') return { where: jest.fn(() => ({ docs: [] })) };
      if (name === 'publicIssueReportOpenKeys') return { doc: jest.fn(() => ({})) };
      return { doc: jest.fn(() => ({})) };
    });

    await confirmIssueReport('rep-fallback-1', { uid: 'admin-1' });

    // Fallback: rep-fallback-1 -> REPFALLB
    expect((committedTask as unknown as { message: string }).message).toContain('[Ticket #IR-REPFALLB]');
    expect((committedTask as unknown as { issueReportReferenceCode: string }).issueReportReferenceCode).toBe('IR-REPFALLB');
    expect((committedTask as unknown as { referenceCode: string }).referenceCode).toBe('IR-REPFALLB');
    // Backfills referenceCode on report
    expect(committedReportUpdate).toMatchObject({
      referenceCode: 'IR-REPFALLB',
    });
  });
});
