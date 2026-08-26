import {
  PublicIssueReportError,
  createOpenKey,
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
  const saveEvidence = jest.fn().mockResolvedValue(undefined);
  const notifyAdmins = jest.fn().mockResolvedValue(undefined);
  let now = 1_800_000_000_000;

  const submit = (overrides: Partial<Parameters<typeof submitPublicIssueReport>[0]> = {}) =>
    submitPublicIssueReport({
      db,
      saveEvidence,
      notifyAdmins,
      timestampFromMillis: (value) => value,
      now: () => now,
      deviceId: 'toilet-01',
      fingerprint: 'a'.repeat(64),
      category: 'no_water',
      description: 'No water after flushing',
      photo: null,
      ...overrides,
    });

  return {
    db,
    saveEvidence,
    notifyAdmins,
    submit,
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
    expect(harness.saveEvidence).toHaveBeenCalledWith(
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

  it('keeps the accepted text report and persists a safe failure state when evidence upload fails', async () => {
    const harness = makeHarness();
    harness.saveEvidence.mockRejectedValueOnce(new Error('bucket leaked a provider detail'));
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
});
