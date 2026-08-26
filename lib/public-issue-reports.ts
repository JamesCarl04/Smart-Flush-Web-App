import { createHash, createHmac, randomUUID } from 'node:crypto';

export const ISSUE_REPORT_CATEGORIES = [
  'lid_malfunction',
  'no_water',
  'continuous_leak',
  'uv_light_failure',
  'blockage_or_dirty',
  'physical_damage',
  'other',
] as const;

export const ISSUE_REPORT_STATUSES = [
  'pending_review',
  'confirmed',
  'dismissed',
] as const;

export type IssueReportCategory = (typeof ISSUE_REPORT_CATEGORIES)[number];
export type IssueReportStatus = (typeof ISSUE_REPORT_STATUSES)[number];

export interface PublicReportingDevice {
  id: string;
  name: string;
  building: string;
  floor: string;
  location: string;
}

export type IssueReportEvidence =
  | { state: 'none' }
  | {
      state: 'pending';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
    }
  | {
      state: 'stored';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
      objectPath: string;
      storedAt: unknown;
    }
  | {
      state: 'upload_failed';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
      failureCode: 'storage_unavailable';
      failedAt: unknown;
    };

export interface IssueReportSubmission {
  id: string;
  description: string | null;
  evidence: IssueReportEvidence;
  submittedAt: unknown;
}

export interface IssueReportAggregate {
  id: string;
  referenceCode: string;
  deviceId: string;
  device: PublicReportingDevice;
  category: IssueReportCategory;
  status: IssueReportStatus;
  confirmationCount: number;
  firstReportedAt: unknown;
  lastReportedAt: unknown;
  lastAdminNotifiedAt: unknown | null;
  linkedTaskId: string | null;
  evidenceRetention: {
    state: 'active' | 'scheduled';
    terminalReason: 'dismissed' | 'linked_task_completed' | null;
    terminalAt: unknown | null;
    expiresAt: unknown | null;
  };
}

export class PublicIssueReportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PublicIssueReportError';
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sanitizePublicDevice(
  id: string,
  data: Record<string, unknown> | null | undefined,
): PublicReportingDevice {
  if (!data || data.publicReportingEnabled === false) {
    throw new PublicIssueReportError(
      'Public reporting is unavailable for this device',
      404,
      'device_unavailable',
    );
  }

  const name = requiredString(data.name);
  if (!name) {
    throw new PublicIssueReportError(
      'Public reporting is unavailable for this device',
      404,
      'device_unavailable',
    );
  }

  return {
    id,
    name,
    building: requiredString(data.building) ?? '',
    floor: requiredString(data.floor) ?? '',
    location: requiredString(data.location) ?? '',
  };
}

export function validateIssueReportInput(
  input: Record<string, unknown>,
  nowMs = Date.now(),
): { category: IssueReportCategory; description: string | null } {
  if (requiredString(input.website)) {
    throw new PublicIssueReportError(
      'Unable to submit report',
      400,
      'automated_submission',
    );
  }

  const startedAt =
    typeof input.startedAt === 'string' && input.startedAt.trim()
      ? Number(input.startedAt)
      : Number.NaN;
  if (
    !Number.isFinite(startedAt) ||
    startedAt > nowMs ||
    nowMs - startedAt < 3_000
  ) {
    throw new PublicIssueReportError(
      'Unable to submit report',
      400,
      'invalid_completion_time',
    );
  }

  if (
    typeof input.category !== 'string' ||
    !ISSUE_REPORT_CATEGORIES.includes(input.category as IssueReportCategory)
  ) {
    throw new PublicIssueReportError(
      'Invalid report category',
      400,
      'invalid_category',
    );
  }

  if (input.description != null && typeof input.description !== 'string') {
    throw new PublicIssueReportError(
      'Description must be text',
      400,
      'invalid_description',
    );
  }

  const description = (input.description as string | undefined)?.trim() ?? '';
  if (description.length > 500) {
    throw new PublicIssueReportError(
      'Description must be 500 characters or fewer',
      400,
      'description_too_long',
    );
  }

  return {
    category: input.category as IssueReportCategory,
    description: description || null,
  };
}

const MIME_MAGIC: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) =>
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff,
  'image/png': (bytes) =>
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ),
  'image/webp': (bytes) =>
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP',
};

export interface ValidatedIssueReportPhoto {
  bytes: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
}

export async function validateIssueReportPhoto(
  file: Pick<File, 'type' | 'size' | 'arrayBuffer'>,
): Promise<ValidatedIssueReportPhoto> {
  if (file.size > 5 * 1024 * 1024) {
    throw new PublicIssueReportError(
      'Photo must be 5 MB or smaller',
      400,
      'photo_too_large',
    );
  }

  if (!(file.type in MIME_MAGIC)) {
    throw new PublicIssueReportError(
      'Photo must be a JPEG, PNG, or WebP image',
      400,
      'unsupported_photo_type',
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length === 0 || !MIME_MAGIC[file.type](bytes)) {
    throw new PublicIssueReportError(
      'Photo contents do not match its declared type',
      400,
      'invalid_photo_contents',
    );
  }

  return {
    bytes,
    contentType: file.type as ValidatedIssueReportPhoto['contentType'],
    size: bytes.length,
  };
}

export function extractClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for'),
  ];

  for (const candidate of candidates) {
    const first = candidate?.split(',')[0]?.trim();
    if (first) return first;
  }
  return null;
}

export function createPublicReportFingerprint(
  ip: string | null,
  secret: string | undefined,
): string {
  if (!secret?.trim()) {
    throw new PublicIssueReportError(
      'Public reporting is temporarily unavailable due to server configuration',
      503,
      'missing_fingerprint_secret',
    );
  }
  if (!ip) {
    throw new PublicIssueReportError(
      'Unable to submit report',
      400,
      'missing_client_address',
    );
  }
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function createOpenKey(deviceId: string, category: IssueReportCategory): string {
  return createHash('sha256').update(`${deviceId}\0${category}`).digest('hex');
}

export function createCooldownKey(
  fingerprint: string,
  deviceId: string,
  category: IssueReportCategory,
): string {
  return createHash('sha256')
    .update(`${fingerprint}\0${deviceId}\0${category}`)
    .digest('hex');
}

export function createEvidencePath(
  aggregateId: string,
  submissionId: string,
): string {
  return `issue-report-evidence/${aggregateId}/${submissionId}/${randomUUID()}`;
}

export interface PublicIssueReportDocumentSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface PublicIssueReportDocumentReference {
  readonly id: string;
  collection(name: string): PublicIssueReportCollectionReference;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
}

export interface PublicIssueReportCollectionReference {
  doc(id?: string): PublicIssueReportDocumentReference;
}

export interface PublicIssueReportTransaction {
  get(
    ref: PublicIssueReportDocumentReference,
  ): Promise<PublicIssueReportDocumentSnapshot>;
  set(
    ref: PublicIssueReportDocumentReference,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ): void;
}

export interface PublicIssueReportFirestore {
  collection(name: string): PublicIssueReportCollectionReference;
  runTransaction<T>(
    callback: (transaction: PublicIssueReportTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface AdminIssueReportNotification {
  issueReportId: string;
  referenceCode: string;
  deviceId: string;
  deviceName: string;
  category: 'continuous_leak';
  confirmationCount: number;
}

export interface SubmitPublicIssueReportOptions {
  db: PublicIssueReportFirestore;
  saveEvidence: (
    objectPath: string,
    bytes: Buffer,
    contentType: ValidatedIssueReportPhoto['contentType'],
  ) => Promise<void>;
  notifyAdmins: (notification: AdminIssueReportNotification) => Promise<void>;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
  deviceId: string;
  fingerprint: string;
  category: IssueReportCategory;
  description: string | null;
  photo: ValidatedIssueReportPhoto | null;
}

export interface PublicIssueReportReceipt {
  aggregateId: string;
  submissionId: string;
  referenceCode: string;
  confirmationCount: number;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const RATE_LIMIT_MAX_ACCEPTED = 5;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1_000;

function milliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const result = toMillis.call(value);
      return typeof result === 'number' && Number.isFinite(result) ? result : null;
    }
  }
  return null;
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function referenceCode(aggregateId: string): string {
  return `IR-${aggregateId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
}

function rateLimitError(): PublicIssueReportError {
  return new PublicIssueReportError(
    'Too many reports. Please try again later.',
    429,
    'rate_limited',
  );
}

export async function submitPublicIssueReport(
  options: SubmitPublicIssueReportOptions,
): Promise<PublicIssueReportReceipt> {
  const nowMs = (options.now ?? Date.now)();
  const now = options.timestampFromMillis(nowMs);
  const candidateAggregateId = randomUUID();
  const submissionId = randomUUID();

  const deviceRef = options.db.collection('devices').doc(options.deviceId);
  const rateRef = options.db
    .collection('publicIssueReportRateLimits')
    .doc(options.fingerprint);
  const cooldownRef = options.db
    .collection('publicIssueReportCooldowns')
    .doc(createCooldownKey(options.fingerprint, options.deviceId, options.category));
  const openRef = options.db
    .collection('publicIssueReportOpenKeys')
    .doc(createOpenKey(options.deviceId, options.category));

  const committed = await options.db.runTransaction(async (transaction) => {
    const [deviceSnapshot, rateSnapshot, cooldownSnapshot, openSnapshot] =
      await Promise.all([
        transaction.get(deviceRef),
        transaction.get(rateRef),
        transaction.get(cooldownRef),
        transaction.get(openRef),
      ]);

    const device = sanitizePublicDevice(
      options.deviceId,
      deviceSnapshot.exists ? deviceSnapshot.data() : null,
    );
    const rate = rateSnapshot.data() ?? {};
    const existingWindowStart = milliseconds(rate.windowStartedAt);
    const inCurrentRateWindow =
      existingWindowStart !== null &&
      nowMs - existingWindowStart < RATE_LIMIT_WINDOW_MS;
    const acceptedCount = inCurrentRateWindow
      ? nonnegativeInteger(rate.acceptedCount)
      : 0;
    if (acceptedCount >= RATE_LIMIT_MAX_ACCEPTED) throw rateLimitError();

    const cooldown = cooldownSnapshot.data() ?? {};
    const lastAcceptedAt = milliseconds(cooldown.lastAcceptedAt);
    if (
      lastAcceptedAt !== null &&
      nowMs - lastAcceptedAt < DUPLICATE_WINDOW_MS
    ) {
      throw rateLimitError();
    }

    const open = openSnapshot.data() ?? {};
    const openAggregateId = requiredString(open.aggregateId);
    let aggregateId: string = candidateAggregateId;
    let aggregateRef = options.db.collection('issueReports').doc(aggregateId);
    let aggregateData: Record<string, unknown> | undefined;

    if (openAggregateId) {
      const openAggregateRef = options.db
        .collection('issueReports')
        .doc(openAggregateId);
      const openAggregateSnapshot = await transaction.get(openAggregateRef);
      const candidateData = openAggregateSnapshot.data();
      if (
        openAggregateSnapshot.exists &&
        candidateData?.status === 'pending_review' &&
        candidateData.deviceId === options.deviceId &&
        candidateData.category === options.category
      ) {
        aggregateId = openAggregateId;
        aggregateRef = openAggregateRef;
        aggregateData = candidateData;
      }
    }

    const count = nonnegativeInteger(aggregateData?.confirmationCount) + 1;
    const code = requiredString(aggregateData?.referenceCode) ?? referenceCode(aggregateId);
    const lastNotifiedAt = milliseconds(aggregateData?.lastAdminNotifiedAt);
    const shouldNotify =
      options.category === 'continuous_leak' &&
      (lastNotifiedAt === null || nowMs - lastNotifiedAt >= DUPLICATE_WINDOW_MS);
    const submissionRef = aggregateRef.collection('submissions').doc(submissionId);

    if (aggregateData) {
      transaction.set(
        aggregateRef,
        {
          confirmationCount: count,
          lastReportedAt: now,
          ...(shouldNotify ? { lastAdminNotifiedAt: now } : {}),
        },
        { merge: true },
      );
    } else {
      const aggregate: IssueReportAggregate = {
        id: aggregateId,
        referenceCode: code,
        deviceId: options.deviceId,
        device,
        category: options.category,
        status: 'pending_review',
        confirmationCount: count,
        firstReportedAt: now,
        lastReportedAt: now,
        lastAdminNotifiedAt: shouldNotify ? now : null,
        linkedTaskId: null,
        evidenceRetention: {
          state: 'active',
          terminalReason: null,
          terminalAt: null,
          expiresAt: null,
        },
      };
      transaction.set(aggregateRef, aggregate as unknown as Record<string, unknown>);
      transaction.set(openRef, {
        aggregateId,
        deviceId: options.deviceId,
        category: options.category,
        openedAt: now,
      });
    }

    const evidence: IssueReportEvidence = options.photo
      ? {
          state: 'pending',
          contentType: options.photo.contentType,
          size: options.photo.size,
        }
      : { state: 'none' };
    const submission: IssueReportSubmission = {
      id: submissionId,
      description: options.description,
      evidence,
      submittedAt: now,
    };
    transaction.set(submissionRef, submission as unknown as Record<string, unknown>);
    transaction.set(rateRef, {
      windowStartedAt: inCurrentRateWindow
        ? rate.windowStartedAt
        : now,
      acceptedCount: acceptedCount + 1,
      updatedAt: now,
    });
    transaction.set(cooldownRef, {
      lastAcceptedAt: now,
      updatedAt: now,
    });

    return {
      aggregateId,
      aggregateRef,
      submissionId,
      submissionRef,
      referenceCode: code,
      confirmationCount: count,
      shouldNotify,
      device,
    };
  });

  if (options.photo) {
    const objectPath = createEvidencePath(
      committed.aggregateId,
      committed.submissionId,
    );
    try {
      await options.saveEvidence(
        objectPath,
        options.photo.bytes,
        options.photo.contentType,
      );
      await committed.submissionRef.set(
        {
          evidence: {
            state: 'stored',
            contentType: options.photo.contentType,
            size: options.photo.size,
            objectPath,
            storedAt: options.timestampFromMillis((options.now ?? Date.now)()),
          } satisfies IssueReportEvidence,
        },
        { merge: true },
      );
    } catch {
      await committed.submissionRef.set(
        {
          evidence: {
            state: 'upload_failed',
            contentType: options.photo.contentType,
            size: options.photo.size,
            failureCode: 'storage_unavailable',
            failedAt: options.timestampFromMillis((options.now ?? Date.now)()),
          } satisfies IssueReportEvidence,
        },
        { merge: true },
      );
      console.error('[Public Reports] Evidence upload failed');
    }
  }

  if (committed.shouldNotify) {
    try {
      await options.notifyAdmins({
        issueReportId: committed.aggregateId,
        referenceCode: committed.referenceCode,
        deviceId: options.deviceId,
        deviceName: committed.device.name,
        category: 'continuous_leak',
        confirmationCount: committed.confirmationCount,
      });
    } catch {
      console.error('[Public Reports] Administrator notification failed');
    }
  }

  return {
    aggregateId: committed.aggregateId,
    submissionId: committed.submissionId,
    referenceCode: committed.referenceCode,
    confirmationCount: committed.confirmationCount,
  };
}
