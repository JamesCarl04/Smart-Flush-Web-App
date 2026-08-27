import {
  PublicIssueReportError,
  acceptPublicIssueReport,
  createOpenKey,
  processIssueReportEvidenceJob,
  processIssueReportNotificationOutbox,
  processPublicIssueReportRecoveryBatch,
  submitPublicIssueReport,
  type PublicIssueReportFirestore,
  type ValidatedIssueReportPhoto,
} from '@/lib/public-issue-reports';

type Stored = Record<string, unknown>;

class MemoryDocumentRef {
  constructor(
    readonly id: string,
    readonly path: string,
    private readonly db: MemoryFirestore,
  ) {}

  collection(name: string): MemoryCollectionRef {
    return new MemoryCollectionRef(`${this.path}/${name}`, this.db);
  }

  async set(data: Stored, options?: { merge?: boolean }): Promise<void> {
    this.db.write(this.path, data, options?.merge === true);
  }

  async get(): Promise<{ exists: boolean; data: () => Stored | undefined }> {
    return {
      exists: this.db.data.has(this.path),
      data: () => this.db.data.get(this.path),
    };
  }
}

class MemoryCollectionRef {
  constructor(
    private readonly path: string,
    private readonly db: MemoryFirestore,
  ) {}

  doc(id?: string): MemoryDocumentRef {
    const resolved = id ?? `generated-${this.db.nextId()}`;
    return new MemoryDocumentRef(resolved, `${this.path}/${resolved}`, this.db);
  }
}

class MemoryFirestore implements PublicIssueReportFirestore {
  readonly data = new Map<string, Stored>();
  private sequence = 0;
  private transactionTail: Promise<unknown> = Promise.resolve();
  readonly failTransactionAttempts = new Set<number>();
  transactionAttempts = 0;

  nextId(): number {
    this.sequence += 1;
    return this.sequence;
  }

  collection(name: string): MemoryCollectionRef {
    return new MemoryCollectionRef(name, this);
  }

  write(path: string, data: Stored, merge: boolean): void {
    this.data.set(path, merge ? { ...(this.data.get(path) ?? {}), ...data } : { ...data });
  }

  async runTransaction<T>(
    callback: (transaction: {
      get: (ref: MemoryDocumentRef) => Promise<{ exists: boolean; data: () => Stored | undefined }>;
      set: (ref: MemoryDocumentRef, data: Stored, options?: { merge?: boolean }) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const run = async () => {
      this.transactionAttempts += 1;
      if (this.failTransactionAttempts.has(this.transactionAttempts)) {
        throw new Error(`transaction ${this.transactionAttempts} failed`);
      }
      const pending: Array<{ ref: MemoryDocumentRef; data: Stored; merge: boolean }> = [];
      const result = await callback({
        get: async (ref) => ({
          exists: this.data.has(ref.path),
          data: () => this.data.get(ref.path),
        }),
        set: (ref, data, options) => pending.push({ ref, data, merge: options?.merge === true }),
      });
      for (const write of pending) this.write(write.ref.path, write.data, write.merge);
      return result;
    };

    const result = this.transactionTail.then(run, run);
    this.transactionTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function photo(): ValidatedIssueReportPhoto {
  return {
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    contentType: 'image/jpeg',
    size: 3,
  };
}

function makeHarness() {
  const db = new MemoryFirestore();
  db.data.set('devices/toilet-01', {
    name: 'Main Restroom',
    building: 'Annex',
    floor: '4th Floor',
    location: 'North Wing',
  });
  const storedEvidence = new Set<string>();
  const uploadEvidence = jest.fn(
    async (objectPath: string) => void storedEvidence.add(objectPath),
  );
  const evidenceExists = jest.fn(
    async (objectPath: string) => storedEvidence.has(objectPath),
  );
  const notifyAdmins = jest.fn().mockResolvedValue(undefined);
  let now = 1_800_000_000_000;

  const submit = (overrides: Partial<Parameters<typeof submitPublicIssueReport>[0]> = {}) =>
    submitPublicIssueReport({
      db,
      uploadEvidence,
      evidenceExists,
      notifyAdmins,
      timestampFromMillis: (value: number) => value,
      now: () => now,
      deviceId: 'toilet-01',
      fingerprint: 'a'.repeat(64),
      category: 'no_water',
      description: 'No water after flushing',
      photo: null,
      ...overrides,
    } as unknown as Parameters<typeof submitPublicIssueReport>[0]);

  const accept = (
    overrides: Partial<Parameters<typeof acceptPublicIssueReport>[0]> = {},
  ) =>
    acceptPublicIssueReport({
      db,
      timestampFromMillis: (value) => value,
      now: () => now,
      deviceId: 'toilet-01',
      fingerprint: 'a'.repeat(64),
      category: 'no_water',
      description: 'No water after flushing',
      photo: null,
      ...overrides,
    } as Parameters<typeof acceptPublicIssueReport>[0]);

  return {
    db,
    storedEvidence,
    uploadEvidence,
    evidenceExists,
    notifyAdmins,
    submit,
    accept,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function valuesForCollection(db: MemoryFirestore, collection: string): Stored[] {
  const prefix = `${collection}/`;
  return [...db.data.entries()]
    .filter(([path]) => path.startsWith(prefix) && path.split('/').length === 2)
    .map(([, value]) => value);
}

describe('public issue report transactional intake', () => {
  it('rejects nonexistent and explicitly disabled devices while accepting legacy devices', async () => {
    const harness = makeHarness();

    await expect(harness.submit({ deviceId: 'missing' })).rejects.toMatchObject({
      status: 404,
      code: 'device_unavailable',
    });
    harness.db.data.set('devices/disabled', { name: 'Disabled', publicReportingEnabled: false });
    await expect(harness.submit({ deviceId: 'disabled' })).rejects.toMatchObject({ status: 404 });
    await expect(harness.submit()).resolves.toMatchObject({ confirmationCount: 1 });
  });

  it('persists camera status, capture time, and an immutable device snapshot', async () => {
    const harness = makeHarness();
    const capturedAt = 1_799_999_999_000;
    const result = await harness.submit({
      photo: photo(),
      photoCaptureStatus: 'captured',
      photoCapturedAt: capturedAt,
    });
    expect(harness.db.data.get(`issueReports/${result.aggregateId}/submissions/${result.submissionId}`)).toEqual(
      expect.objectContaining({
        photoCaptureStatus: 'captured',
        photoCapturedAt: capturedAt,
        submittedAt: 1_800_000_000_000,
        deviceSnapshot: expect.objectContaining({ name: 'Main Restroom', location: 'North Wing' }),
      }),
    );
  });

  it('atomically merges concurrent reports into one pending aggregate and preserves submissions', async () => {
    const harness = makeHarness();

    const [first, second] = await Promise.all([
      harness.submit({ fingerprint: 'a'.repeat(64), description: 'First description' }),
      harness.submit({ fingerprint: 'b'.repeat(64), description: 'Second description' }),
    ]);

    expect(first.referenceCode).toBe(second.referenceCode);
    expect(new Set([first.aggregateId, second.aggregateId]).size).toBe(1);
    expect(second.confirmationCount).toBe(2);
    expect(valuesForCollection(harness.db, 'issueReports')).toHaveLength(1);
    const submissions = [...harness.db.data.entries()].filter(([path]) =>
      path.includes('/submissions/'),
    );
    expect(submissions).toHaveLength(2);
    expect(submissions.map(([, value]) => value.description).sort()).toEqual([
      'First description',
      'Second description',
    ]);
  });

  it('allows a future aggregate after the open aggregate is confirmed or dismissed', async () => {
    const harness = makeHarness();
    const first = await harness.submit();
    harness.db.write(`issueReports/${first.aggregateId}`, { status: 'confirmed' }, true);
    harness.advance(10 * 60 * 1_000);

    const second = await harness.submit();
    expect(second.aggregateId).not.toBe(first.aggregateId);

    harness.db.write(`issueReports/${second.aggregateId}`, { status: 'dismissed' }, true);
    harness.advance(10 * 60 * 1_000);
    const third = await harness.submit();
    expect(third.aggregateId).not.toBe(second.aggregateId);
  });

  it('does not merge through a stale or corrupt open-key linked to another device/category', async () => {
    const harness = makeHarness();
    harness.db.data.set('issueReports/wrong-report', {
      id: 'wrong-report',
      referenceCode: 'IR-WRONG',
      deviceId: 'another-device',
      category: 'physical_damage',
      status: 'pending_review',
      confirmationCount: 7,
    });
    harness.db.data.set(
      `publicIssueReportOpenKeys/${createOpenKey('toilet-01', 'no_water')}`,
      { aggregateId: 'wrong-report' },
    );

    const result = await harness.submit();

    expect(result.aggregateId).not.toBe('wrong-report');
    expect(result.confirmationCount).toBe(1);
  });

  it('limits accepted attempts to five per fingerprint in fifteen server-time minutes', async () => {
    const harness = makeHarness();
    const categories = [
      'lid_malfunction',
      'no_water',
      'continuous_leak',
      'uv_light_failure',
      'blockage_or_dirty',
      'physical_damage',
    ] as const;

    for (const category of categories.slice(0, 5)) {
      await harness.submit({ category });
    }

    await expect(harness.submit({ category: categories[5] })).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    });

    harness.advance(15 * 60 * 1_000);
    await expect(harness.submit({ category: categories[5] })).resolves.toMatchObject({
      confirmationCount: 1,
    });
  });

  it('limits one accepted fingerprint/device/category confirmation per ten minutes', async () => {
    const harness = makeHarness();
    await harness.submit();

    harness.advance(9 * 60 * 1_000 + 59_999);
    await expect(harness.submit()).rejects.toMatchObject({ status: 429 });

    harness.advance(1);
    await expect(harness.submit()).resolves.toMatchObject({ confirmationCount: 2 });
  });

  it('never persists the raw IP or public evidence URL and stores evidence under a random private path', async () => {
    const harness = makeHarness();
    const result = await harness.submit({
      fingerprint: 'f'.repeat(64),
      photo: photo(),
    });

    const persisted = JSON.stringify([...harness.db.data.entries()]);
    expect(persisted).not.toContain('198.51.100.9');
    expect(persisted).not.toContain('downloadUrl');
    expect(persisted).not.toContain('https://');
    expect(harness.uploadEvidence).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^issue-report-evidence/${result.aggregateId}/${result.submissionId}/[0-9a-f-]{36}$`),
      ),
      expect.any(Buffer),
      'image/jpeg',
    );
    const submission = harness.db.data.get(
      `issueReports/${result.aggregateId}/submissions/${result.submissionId}`,
    );
    expect(submission?.evidence).toEqual(
      expect.objectContaining({ state: 'stored', objectPath: expect.any(String) }),
    );
  });

  it('records the exact evidence object path transactionally before writing bytes', async () => {
    const harness = makeHarness();
    let pathWasDurableBeforeStorage = false;
    harness.uploadEvidence.mockImplementationOnce(async (objectPath: string) => {
      pathWasDurableBeforeStorage = valuesForCollection(
        harness.db,
        'publicIssueReportEvidenceJobs',
      ).some((job) => job.objectPath === objectPath);
      harness.storedEvidence.add(objectPath);
    });

    await harness.submit({ photo: photo() });

    expect(pathWasDurableBeforeStorage).toBe(true);
  });

  it('performs zero Storage operations for invalid devices and rate-limited reports', async () => {
    const harness = makeHarness();

    await expect(
      harness.submit({ deviceId: 'missing', photo: photo() }),
    ).rejects.toMatchObject({ code: 'device_unavailable' });
    harness.db.data.set('devices/disabled-photo', {
      name: 'Disabled',
      publicReportingEnabled: false,
    });
    await expect(
      harness.submit({ deviceId: 'disabled-photo', photo: photo() }),
    ).rejects.toMatchObject({ code: 'device_unavailable' });
    expect(harness.uploadEvidence).not.toHaveBeenCalled();
    expect(harness.evidenceExists).not.toHaveBeenCalled();

    await harness.submit({ photo: null });
    await expect(harness.submit({ photo: photo() })).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect(harness.uploadEvidence).not.toHaveBeenCalled();
    expect(harness.evidenceExists).not.toHaveBeenCalled();
  });

  it('keeps the accepted text report and persists a safe failure state when evidence upload fails', async () => {
    const harness = makeHarness();
    harness.uploadEvidence.mockRejectedValueOnce(new Error('bucket leaked a provider detail'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const result = await harness.submit({ photo: photo() });

    expect(result.referenceCode).toMatch(/^IR-/);
    expect(
      harness.db.data.get(`issueReports/${result.aggregateId}/submissions/${result.submissionId}`),
    ).toEqual(
      expect.objectContaining({
        description: 'No water after flushing',
        evidence: expect.objectContaining({
          state: 'upload_failed',
          failureCode: 'storage_unavailable',
        }),
      }),
    );
    expect(valuesForCollection(harness.db, 'publicIssueReportEvidenceJobs')).toEqual([
      expect.objectContaining({ status: 'failed', failureCode: 'storage_unavailable' }),
    ]);
    expect(consoleError).toHaveBeenCalledWith('[Public Reports] Evidence upload failed');
    consoleError.mockRestore();
  });

  it('notifies admins for a new continuous leak and at most once per aggregate per ten minutes', async () => {
    const harness = makeHarness();

    const first = await harness.submit({ category: 'continuous_leak' });
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(harness.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ issueReportId: first.aggregateId, category: 'continuous_leak' }),
    );

    harness.advance(10 * 60 * 1_000);
    await harness.submit({ category: 'continuous_leak' });
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(2);

    harness.advance(10 * 60 * 1_000);
    harness.notifyAdmins.mockRejectedValueOnce(new Error('FCM unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    await expect(harness.submit({ category: 'continuous_leak' })).resolves.toMatchObject({
      confirmationCount: 3,
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[Public Reports] Administrator notification failed',
    );
    consoleError.mockRestore();
  });

  it('does not notify administrators for non-leak categories', async () => {
    const harness = makeHarness();
    await harness.submit({ category: 'physical_damage' });
    expect(harness.notifyAdmins).not.toHaveBeenCalled();
  });

  it('stores active retention metadata without creating a maintenance task', async () => {
    const harness = makeHarness();
    await harness.submit();
    const [aggregate] = valuesForCollection(harness.db, 'issueReports');

    expect(aggregate).toEqual(
      expect.objectContaining({
        status: 'pending_review',
        linkedTaskId: null,
        evidenceRetention: {
          state: 'active',
          terminalReason: null,
          terminalAt: null,
          expiresAt: null,
        },
      }),
    );
    expect(valuesForCollection(harness.db, 'tasks')).toHaveLength(0);
  });

  it('returns a generic rate-limit error without fingerprint data', async () => {
    const error = new PublicIssueReportError('Too many reports. Please try again later.', 429, 'rate_limited');
    expect(error.message).not.toContain('fingerprint');
  });

  it('keeps exact evidence paths durable when final storage succeeds but metadata finalization fails', async () => {
    const harness = makeHarness();
    harness.db.failTransactionAttempts.add(3);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ photo: photo() });

    expect(receipt.evidenceJobId).toEqual(expect.any(String));
    const jobPath = `publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`;
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({
        status: 'pending',
        objectPath: expect.stringMatching(/^issue-report-evidence\//),
      }),
    );
    expect(harness.uploadEvidence).toHaveBeenCalledTimes(1);
    expect(
      harness.db.data.get(
        `issueReports/${receipt.aggregateId}/submissions/${receipt.submissionId}`,
      )?.evidence,
    ).toEqual(
      expect.objectContaining({
        state: 'upload_pending',
        jobId: receipt.evidenceJobId,
        objectPath: expect.any(String),
      }),
    );

    harness.db.failTransactionAttempts.clear();
    await processIssueReportEvidenceJob({
      db: harness.db,
      jobId: receipt.evidenceJobId!,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_000_000,
    });
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'completed' }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('recovers an ambiguous upload by checking the tracked object and remains idempotent', async () => {
    const harness = makeHarness();
    harness.uploadEvidence.mockImplementationOnce(async (objectPath: string) => {
      harness.storedEvidence.add(objectPath);
      throw new Error('connection closed after upload');
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ photo: photo() });
    const jobPath = `publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`;
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'completed', attemptCount: 1 }),
    );

    const processOptions = {
      db: harness.db,
      jobId: receipt.evidenceJobId!,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      timestampFromMillis: (value: number) => value,
      now: () => 1_800_000_000_100,
    };
    await processIssueReportEvidenceJob(processOptions);

    expect(harness.uploadEvidence).toHaveBeenCalledTimes(1);
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'completed', attemptCount: 1 }),
    );
    consoleError.mockRestore();
  });

  it('marks a stale crash-before-upload reservation failed without touching Storage early', async () => {
    const harness = makeHarness();
    const receipt = await harness.accept({ photo: photo() });
    const jobPath = `publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`;

    expect(harness.uploadEvidence).not.toHaveBeenCalled();
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'pending', phase: 'reserved' }),
    );

    await processIssueReportEvidenceJob({
      db: harness.db,
      jobId: receipt.evidenceJobId!,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      reservationTimeoutMs: 120_000,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_119_999,
    });
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'pending', phase: 'reserved' }),
    );

    await processIssueReportEvidenceJob({
      db: harness.db,
      jobId: receipt.evidenceJobId!,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      reservationTimeoutMs: 120_000,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_120_000,
    });
    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'failed', failureCode: 'upload_timeout' }),
    );
    expect(
      harness.db.data.get(
        `issueReports/${receipt.aggregateId}/submissions/${receipt.submissionId}`,
      )?.evidence,
    ).toEqual(expect.objectContaining({ state: 'upload_failed' }));
    expect(harness.uploadEvidence).not.toHaveBeenCalled();
  });

  it('leaves the originally tracked evidence job retryable when fallback metadata writing fails', async () => {
    const harness = makeHarness();
    harness.uploadEvidence.mockRejectedValueOnce(new Error('storage unavailable'));
    harness.db.failTransactionAttempts.add(3);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ photo: photo() });

    expect(harness.db.data.get(`publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`)).toEqual(
      expect.objectContaining({
        status: 'pending',
        objectPath: expect.any(String),
      }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('persists a retryable leak-notification outbox and marks delivery separately', async () => {
    const harness = makeHarness();
    harness.notifyAdmins.mockRejectedValueOnce(new Error('FCM unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ category: 'continuous_leak' });
    const outboxPath = `publicIssueReportNotificationOutbox/${receipt.notificationOutboxId}`;
    expect(harness.db.data.get(outboxPath)).toEqual(
      expect.objectContaining({ status: 'pending', attemptCount: 1 }),
    );

    const processOptions = {
      db: harness.db,
      jobId: receipt.notificationOutboxId!,
      notifyAdmins: harness.notifyAdmins,
      timestampFromMillis: (value: number) => value,
      now: () => 1_800_000_000_100,
    };
    await processIssueReportNotificationOutbox(processOptions);
    await processIssueReportNotificationOutbox(processOptions);

    expect(harness.notifyAdmins).toHaveBeenCalledTimes(2);
    expect(harness.db.data.get(outboxPath)).toEqual(
      expect.objectContaining({ status: 'delivered', attemptCount: 2 }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('creates at most one leak outbox per aggregate per ten minutes', async () => {
    const harness = makeHarness();
    await harness.submit({ category: 'continuous_leak', fingerprint: 'a'.repeat(64) });
    harness.advance(5 * 60 * 1_000);
    await harness.submit({ category: 'continuous_leak', fingerprint: 'b'.repeat(64) });

    expect(valuesForCollection(harness.db, 'publicIssueReportNotificationOutbox')).toHaveLength(1);
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('reuses an undelivered leak outbox after the cadence window instead of creating a duplicate send', async () => {
    const harness = makeHarness();
    harness.notifyAdmins.mockRejectedValueOnce(new Error('FCM unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const first = await harness.submit({
      category: 'continuous_leak',
      fingerprint: 'a'.repeat(64),
    });
    harness.advance(10 * 60 * 1_000);

    const second = await harness.submit({
      category: 'continuous_leak',
      fingerprint: 'b'.repeat(64),
    });

    expect(second.notificationOutboxId).toBe(first.notificationOutboxId);
    expect(valuesForCollection(harness.db, 'publicIssueReportNotificationOutbox')).toHaveLength(1);
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns the accepted report when notification processing is interrupted before send', async () => {
    const harness = makeHarness();
    harness.db.failTransactionAttempts.add(2);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ category: 'continuous_leak' });

    expect(receipt.referenceCode).toMatch(/^IR-/);
    expect(harness.notifyAdmins).not.toHaveBeenCalled();
    expect(
      harness.db.data.get(
        `publicIssueReportNotificationOutbox/${receipt.notificationOutboxId}`,
      ),
    ).toEqual(expect.objectContaining({ status: 'pending', attemptCount: 0 }));
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('keeps a sent notification durably claimed if delivered metadata cannot be written', async () => {
    const harness = makeHarness();
    harness.db.failTransactionAttempts.add(3);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const receipt = await harness.submit({ category: 'continuous_leak' });

    expect(receipt.referenceCode).toMatch(/^IR-/);
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(
      harness.db.data.get(
        `publicIssueReportNotificationOutbox/${receipt.notificationOutboxId}`,
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'sending',
        attemptCount: 1,
        notification: expect.objectContaining({
          notificationId: receipt.notificationOutboxId,
        }),
      }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('recovers a crash-before-upload reservation through a bounded recovery batch', async () => {
    const harness = makeHarness();
    const receipt = await harness.accept({ photo: photo() });
    harness.advance(120_000);

    const result = await processPublicIssueReportRecoveryBatch({
      db: harness.db,
      evidenceJobIds: [receipt.evidenceJobId!, 'ignored-over-limit'],
      notificationOutboxIds: [],
      maxJobsPerType: 1,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      notifyAdmins: harness.notifyAdmins,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_120_000,
    });

    expect(result).toEqual({ evidenceProcessed: 1, notificationsProcessed: 0 });
    expect(
      harness.db.data.get(`publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`),
    ).toEqual(expect.objectContaining({ status: 'failed', failureCode: 'upload_timeout' }));
    expect(harness.uploadEvidence).not.toHaveBeenCalled();
  });

  it('recovers an ambiguous tracked object after an upload lease expires', async () => {
    const harness = makeHarness();
    const receipt = await harness.accept({ photo: photo() });
    const jobPath = `publicIssueReportEvidenceJobs/${receipt.evidenceJobId}`;
    const job = harness.db.data.get(jobPath)!;
    harness.storedEvidence.add(job.objectPath as string);
    harness.db.write(
      jobPath,
      { phase: 'uploading', leaseExpiresAt: 1_799_999_999_999 },
      true,
    );

    await processPublicIssueReportRecoveryBatch({
      db: harness.db,
      evidenceJobIds: [receipt.evidenceJobId!],
      notificationOutboxIds: [],
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      notifyAdmins: harness.notifyAdmins,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_000_000,
    });

    expect(harness.db.data.get(jobPath)).toEqual(
      expect.objectContaining({ status: 'completed', phase: 'stored' }),
    );
    expect(harness.uploadEvidence).not.toHaveBeenCalled();
  });

  it('retries a failed leak outbox through recovery without accepting a new report', async () => {
    const harness = makeHarness();
    const receipt = await harness.accept({ category: 'continuous_leak' });
    harness.notifyAdmins.mockRejectedValueOnce(new Error('FCM unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const options = {
      db: harness.db,
      evidenceJobIds: [],
      notificationOutboxIds: [receipt.notificationOutboxId!],
      maxJobsPerType: 10,
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      notifyAdmins: harness.notifyAdmins,
      timestampFromMillis: (value: number) => value,
      now: () => 1_800_000_000_000,
    };

    await processPublicIssueReportRecoveryBatch(options);
    await processPublicIssueReportRecoveryBatch(options);

    expect(valuesForCollection(harness.db, 'issueReports')).toHaveLength(1);
    expect(valuesForCollection(harness.db, 'publicIssueReportNotificationOutbox')).toHaveLength(1);
    expect(harness.notifyAdmins).toHaveBeenCalledTimes(2);
    expect(
      harness.db.data.get(
        `publicIssueReportNotificationOutbox/${receipt.notificationOutboxId}`,
      ),
    ).toEqual(expect.objectContaining({ status: 'delivered', attemptCount: 2 }));
    consoleError.mockRestore();
  });

  it('reclaims an expired leak-notification lease through recovery', async () => {
    const harness = makeHarness();
    const receipt = await harness.accept({ category: 'continuous_leak' });
    const outboxPath = `publicIssueReportNotificationOutbox/${receipt.notificationOutboxId}`;
    harness.db.write(
      outboxPath,
      {
        status: 'sending',
        attemptId: 'interrupted-attempt',
        attemptCount: 1,
        leaseExpiresAt: 1_799_999_999_999,
      },
      true,
    );

    await processPublicIssueReportRecoveryBatch({
      db: harness.db,
      evidenceJobIds: [],
      notificationOutboxIds: [receipt.notificationOutboxId!],
      uploadEvidence: harness.uploadEvidence,
      evidenceExists: harness.evidenceExists,
      notifyAdmins: harness.notifyAdmins,
      timestampFromMillis: (value) => value,
      now: () => 1_800_000_000_000,
    });

    expect(harness.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(harness.db.data.get(outboxPath)).toEqual(
      expect.objectContaining({ status: 'delivered', attemptCount: 2 }),
    );
  });
});
