import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

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
      state: 'finalization_pending';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
      jobId: string;
      tempObjectPath: string;
      finalObjectPath: string;
      failureCode?: 'storage_unavailable' | 'metadata_write_failed';
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
  lastAdminNotificationEnqueuedAt: unknown | null;
  pendingAdminNotificationOutboxId: string | null;
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

export function isIssueReportImageMime(
  value: unknown,
): value is ValidatedIssueReportPhoto['contentType'] {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MIME_MAGIC, value)
  );
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

  if (!isIssueReportImageMime(file.type)) {
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
    contentType: file.type,
    size: bytes.length,
  };
}

export const TRUSTED_PROXY_IP_HEADERS = [
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
] as const;

export type TrustedProxyIpHeader = (typeof TRUSTED_PROXY_IP_HEADERS)[number];

export function resolveTrustedProxyIpHeader(
  configured: string | undefined,
): TrustedProxyIpHeader {
  const normalized = configured?.trim().toLowerCase() || 'x-vercel-forwarded-for';
  if (
    !TRUSTED_PROXY_IP_HEADERS.includes(normalized as TrustedProxyIpHeader)
  ) {
    throw new PublicIssueReportError(
      'Public reporting is temporarily unavailable due to server configuration',
      503,
      'invalid_trusted_ip_header',
    );
  }
  return normalized as TrustedProxyIpHeader;
}

export function extractClientIp(
  headers: Headers,
  trustedHeader: string | undefined,
): string | null {
  const header = resolveTrustedProxyIpHeader(trustedHeader);
  const value = headers.get(header)?.trim();
  return value && isIP(value) !== 0 ? value : null;
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

export function createTemporaryEvidencePath(submissionId: string): string {
  return `issue-report-evidence-temp/${submissionId}/${randomUUID()}`;
}

export interface PublicIssueReportDocumentSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface PublicIssueReportDocumentReference {
  readonly id: string;
  collection(name: string): PublicIssueReportCollectionReference;
  get(): Promise<PublicIssueReportDocumentSnapshot>;
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
  notificationId: string;
  issueReportId: string;
  referenceCode: string;
  deviceId: string;
  deviceName: string;
  category: 'continuous_leak';
  confirmationCount: number;
}

export interface SubmitPublicIssueReportOptions {
  db: PublicIssueReportFirestore;
  stageEvidence: (
    objectPath: string,
    bytes: Buffer,
    contentType: ValidatedIssueReportPhoto['contentType'],
  ) => Promise<void>;
  finalizeEvidence: (
    tempObjectPath: string,
    finalObjectPath: string,
  ) => Promise<void>;
  deleteEvidence: (objectPath: string) => Promise<void>;
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
  evidenceJobId?: string;
  notificationOutboxId?: string;
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
  const candidateEvidenceJobId = options.photo ? randomUUID() : null;
  const candidateNotificationOutboxId =
    options.category === 'continuous_leak' ? randomUUID() : null;
  const tempObjectPath = options.photo
    ? createTemporaryEvidencePath(submissionId)
    : null;
  const finalObjectNonce = options.photo ? randomUUID() : null;
  let evidenceStaged = false;

  if (options.photo && tempObjectPath) {
    try {
      await options.stageEvidence(
        tempObjectPath,
        options.photo.bytes,
        options.photo.contentType,
      );
      evidenceStaged = true;
    } catch {
      try {
        await options.deleteEvidence(tempObjectPath);
      } catch {
        console.error('[Public Reports] Temporary evidence cleanup failed');
      }
      console.error('[Public Reports] Evidence upload failed');
    }
  }

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

  let committed;
  try {
    committed = await options.db.runTransaction(async (transaction) => {
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
    const lastNotificationEnqueuedAt = milliseconds(
      aggregateData?.lastAdminNotificationEnqueuedAt ??
        aggregateData?.lastAdminNotifiedAt,
    );
    const pendingNotificationOutboxId = requiredString(
      aggregateData?.pendingAdminNotificationOutboxId,
    );
    const shouldEnqueueNotification =
      options.category === 'continuous_leak' &&
      pendingNotificationOutboxId === null &&
      candidateNotificationOutboxId !== null &&
      (lastNotificationEnqueuedAt === null ||
        nowMs - lastNotificationEnqueuedAt >= DUPLICATE_WINDOW_MS);
    const submissionRef = aggregateRef.collection('submissions').doc(submissionId);

    if (aggregateData) {
      transaction.set(
        aggregateRef,
        {
          confirmationCount: count,
          lastReportedAt: now,
          ...(shouldEnqueueNotification
            ? {
                lastAdminNotificationEnqueuedAt: now,
                pendingAdminNotificationOutboxId:
                  candidateNotificationOutboxId,
              }
            : {}),
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
        lastAdminNotificationEnqueuedAt: shouldEnqueueNotification
          ? now
          : null,
        pendingAdminNotificationOutboxId: shouldEnqueueNotification
          ? candidateNotificationOutboxId
          : null,
        lastAdminNotifiedAt: null,
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

    const evidenceJobId =
      options.photo &&
      evidenceStaged &&
      candidateEvidenceJobId &&
      tempObjectPath &&
      finalObjectNonce
        ? candidateEvidenceJobId
        : null;
    const finalObjectPath = evidenceJobId
      ? `issue-report-evidence/${aggregateId}/${submissionId}/${finalObjectNonce}`
      : null;
    const evidence: IssueReportEvidence = options.photo
      ? evidenceJobId && tempObjectPath && finalObjectPath
        ? {
            state: 'finalization_pending',
            contentType: options.photo.contentType,
            size: options.photo.size,
            jobId: evidenceJobId,
            tempObjectPath,
            finalObjectPath,
          }
        : {
            state: 'upload_failed',
            contentType: options.photo.contentType,
            size: options.photo.size,
            failureCode: 'storage_unavailable',
            failedAt: now,
          }
      : { state: 'none' };
    const submission: IssueReportSubmission = {
      id: submissionId,
      description: options.description,
      evidence,
      submittedAt: now,
    };
    transaction.set(submissionRef, submission as unknown as Record<string, unknown>);
    if (evidenceJobId && tempObjectPath && finalObjectPath) {
      transaction.set(
        options.db.collection('publicIssueReportEvidenceJobs').doc(evidenceJobId),
        {
          id: evidenceJobId,
          status: 'pending',
          aggregateId,
          submissionId,
          tempObjectPath,
          finalObjectPath,
          contentType: options.photo?.contentType,
          size: options.photo?.size,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      );
    }
    const notificationOutboxId =
      pendingNotificationOutboxId ??
      (shouldEnqueueNotification ? candidateNotificationOutboxId : null);
    if (shouldEnqueueNotification && notificationOutboxId) {
      const notification: AdminIssueReportNotification = {
        notificationId: notificationOutboxId,
        issueReportId: aggregateId,
        referenceCode: code,
        deviceId: options.deviceId,
        deviceName: device.name,
        category: 'continuous_leak',
        confirmationCount: count,
      };
      transaction.set(
        options.db
          .collection('publicIssueReportNotificationOutbox')
          .doc(notificationOutboxId),
        {
          id: notificationOutboxId,
          aggregateId,
          status: 'pending',
          notification,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      );
    }
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
      evidenceJobId,
      notificationOutboxId,
      device,
    };
    });
  } catch (error) {
    if (evidenceStaged && tempObjectPath) {
      try {
        await options.deleteEvidence(tempObjectPath);
      } catch {
        console.error('[Public Reports] Temporary evidence cleanup failed');
      }
    }
    throw error;
  }

  if (committed.evidenceJobId) {
    try {
      await processIssueReportEvidenceJob({
        db: options.db,
        jobId: committed.evidenceJobId,
        finalizeEvidence: options.finalizeEvidence,
        deleteEvidence: options.deleteEvidence,
        timestampFromMillis: options.timestampFromMillis,
        now: options.now,
      });
    } catch {
      console.error('[Public Reports] Evidence finalization deferred');
    }
  }

  if (committed.notificationOutboxId) {
    try {
      await processIssueReportNotificationOutbox({
        db: options.db,
        jobId: committed.notificationOutboxId,
        notifyAdmins: options.notifyAdmins,
        timestampFromMillis: options.timestampFromMillis,
        now: options.now,
      });
    } catch {
      console.error('[Public Reports] Administrator notification deferred');
    }
  }

  return {
    aggregateId: committed.aggregateId,
    submissionId: committed.submissionId,
    referenceCode: committed.referenceCode,
    confirmationCount: committed.confirmationCount,
    ...(committed.evidenceJobId
      ? { evidenceJobId: committed.evidenceJobId }
      : {}),
    ...(committed.notificationOutboxId
      ? { notificationOutboxId: committed.notificationOutboxId }
      : {}),
  };
}

export interface ProcessEvidenceJobOptions {
  db: PublicIssueReportFirestore;
  jobId: string;
  finalizeEvidence: (
    tempObjectPath: string,
    finalObjectPath: string,
  ) => Promise<void>;
  deleteEvidence: (objectPath: string) => Promise<void>;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
}

async function recordEvidenceJobFailure(
  options: ProcessEvidenceJobOptions,
  failureCode: 'storage_unavailable' | 'metadata_write_failed',
): Promise<void> {
  const now = options.timestampFromMillis((options.now ?? Date.now)());
  const jobRef = options.db
    .collection('publicIssueReportEvidenceJobs')
    .doc(options.jobId);
  await options.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || job?.status === 'completed') return;
    transaction.set(
      jobRef,
      {
        status: 'pending',
        attemptCount: nonnegativeInteger(job?.attemptCount) + 1,
        failureCode,
        lastAttemptAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  });
}

export async function processIssueReportEvidenceJob(
  options: ProcessEvidenceJobOptions,
): Promise<void> {
  const jobRef = options.db
    .collection('publicIssueReportEvidenceJobs')
    .doc(options.jobId);
  const snapshot = await jobRef.get();
  const job = snapshot.data();
  if (!snapshot.exists || job?.status === 'completed') return;

  const aggregateId = requiredString(job?.aggregateId);
  const submissionId = requiredString(job?.submissionId);
  const tempObjectPath = requiredString(job?.tempObjectPath);
  const finalObjectPath = requiredString(job?.finalObjectPath);
  const contentType = job?.contentType;
  const size = nonnegativeInteger(job?.size);
  if (
    !aggregateId ||
    !submissionId ||
    !tempObjectPath ||
    !finalObjectPath ||
    !isIssueReportImageMime(contentType) ||
    size === 0
  ) {
    return;
  }

  try {
    await options.finalizeEvidence(tempObjectPath, finalObjectPath);
  } catch {
    try {
      await recordEvidenceJobFailure(options, 'storage_unavailable');
    } catch {
      console.error('[Public Reports] Evidence failure-state write failed');
    }
    console.error('[Public Reports] Evidence finalization remains pending');
    return;
  }

  const completedAt = options.timestampFromMillis((options.now ?? Date.now)());
  try {
    await options.db.runTransaction(async (transaction) => {
      const latest = await transaction.get(jobRef);
      const latestJob = latest.data();
      if (!latest.exists || latestJob?.status === 'completed') return;
      const submissionRef = options.db
        .collection('issueReports')
        .doc(aggregateId)
        .collection('submissions')
        .doc(submissionId);
      transaction.set(
        submissionRef,
        {
          evidence: {
            state: 'stored',
            contentType,
            size,
            objectPath: finalObjectPath,
            storedAt: completedAt,
          } satisfies IssueReportEvidence,
        },
        { merge: true },
      );
      transaction.set(
        jobRef,
        {
          status: 'completed',
          attemptCount: nonnegativeInteger(latestJob?.attemptCount) + 1,
          failureCode: null,
          completedAt,
          updatedAt: completedAt,
        },
        { merge: true },
      );
    });
  } catch {
    try {
      await recordEvidenceJobFailure(options, 'metadata_write_failed');
    } catch {
      console.error('[Public Reports] Evidence failure-state write failed');
    }
    console.error('[Public Reports] Evidence finalization metadata failed');
  }
}

export interface ProcessNotificationOutboxOptions {
  db: PublicIssueReportFirestore;
  jobId: string;
  notifyAdmins: (notification: AdminIssueReportNotification) => Promise<void>;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
}

export async function processIssueReportNotificationOutbox(
  options: ProcessNotificationOutboxOptions,
): Promise<void> {
  const nowMs = (options.now ?? Date.now)();
  const now = options.timestampFromMillis(nowMs);
  const attemptId = randomUUID();
  const jobRef = options.db
    .collection('publicIssueReportNotificationOutbox')
    .doc(options.jobId);
  const claimed = await options.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || job?.status === 'delivered') return null;
    const leaseExpiresAt = milliseconds(job?.leaseExpiresAt);
    if (
      job?.status === 'sending' &&
      leaseExpiresAt !== null &&
      leaseExpiresAt > nowMs
    ) {
      return null;
    }
    const notification = job?.notification as
      | AdminIssueReportNotification
      | undefined;
    if (!notification || notification.notificationId !== options.jobId) {
      return null;
    }
    transaction.set(
      jobRef,
      {
        status: 'sending',
        attemptId,
        attemptCount: nonnegativeInteger(job?.attemptCount) + 1,
        lastAttemptAt: now,
        leaseExpiresAt: options.timestampFromMillis(nowMs + 30_000),
        updatedAt: now,
      },
      { merge: true },
    );
    return notification;
  });
  if (!claimed) return;

  try {
    await options.notifyAdmins(claimed);
  } catch {
    try {
      await options.db.runTransaction(async (transaction) => {
        const latest = await transaction.get(jobRef);
        const job = latest.data();
        if (!latest.exists || job?.attemptId !== attemptId) return;
        transaction.set(
          jobRef,
          {
            status: 'pending',
            failureCode: 'notification_failed',
            leaseExpiresAt: null,
            updatedAt: now,
          },
          { merge: true },
        );
      });
    } catch {
      console.error('[Public Reports] Notification outbox failure-state write failed');
    }
    console.error('[Public Reports] Administrator notification failed');
    return;
  }

  await options.db.runTransaction(async (transaction) => {
    const latest = await transaction.get(jobRef);
    const job = latest.data();
    if (!latest.exists || job?.attemptId !== attemptId) return;
    transaction.set(
      jobRef,
      {
        status: 'delivered',
        deliveredAt: now,
        leaseExpiresAt: null,
        failureCode: null,
        updatedAt: now,
      },
      { merge: true },
    );
    const aggregateId = requiredString(job?.aggregateId);
    if (aggregateId) {
      transaction.set(
        options.db.collection('issueReports').doc(aggregateId),
        {
          lastAdminNotifiedAt: now,
          pendingAdminNotificationOutboxId: null,
        },
        { merge: true },
      );
    }
  });
}
