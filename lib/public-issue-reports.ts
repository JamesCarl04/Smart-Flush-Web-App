import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { getStallById, SDCA_RESTROOM_ROOMS } from './restrooms';

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
export const PHOTO_CAPTURE_STATUSES = ['captured', 'unavailable'] as const;
export type PhotoCaptureStatus = (typeof PHOTO_CAPTURE_STATUSES)[number];

export interface PublicReportingDevice {
  id: string;
  name: string;
  building: string;
  floor: string;
  location: string;
  stallId?: string | null;
  stallNumber?: string | null;
  isSmartHardware?: boolean;
  isCommonArea?: boolean;
}

export type IssueReportEvidence =
  | { state: 'none' }
  | {
      state: 'upload_pending';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
      jobId: string;
      objectPath: string;
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
      failureCode: 'storage_unavailable' | 'upload_timeout';
      failedAt: unknown;
    };

export interface IssueReportSubmission {
  id: string;
  description: string | null;
  evidence: IssueReportEvidence;
  submittedAt: unknown;
  photoCaptureStatus?: PhotoCaptureStatus;
  photoCapturedAt?: unknown | null;
  deviceSnapshot?: PublicReportingDevice;
}

export interface IssueReportAggregate {
  id: string;
  referenceCode: string;
  deviceId: string;
  device: PublicReportingDevice;
  category: IssueReportCategory;
  categories?: IssueReportCategory[];
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
  if (data && data.publicReportingEnabled === false) {
    throw new PublicIssueReportError(
      'Public reporting is unavailable for this device',
      404,
      'device_unavailable',
    );
  }

  if (data) {
    const name = requiredString(data.name);
    if (!name) {
      throw new PublicIssueReportError(
        'Public reporting is unavailable for this device',
        404,
        'device_unavailable',
      );
    }

    const device: PublicReportingDevice = {
      id,
      name,
      building: requiredString(data.building) ?? '',
      floor: requiredString(data.floor) ?? '',
      location: requiredString(data.location) ?? '',
    };

    const stallId = requiredString(data.stallId);
    if (stallId) device.stallId = stallId;
    const stallNumber = requiredString(data.stallNumber);
    if (stallNumber) device.stallNumber = stallNumber;
    if (data.isSmartHardware === true) device.isSmartHardware = true;
    if (data.isCommonArea === true) device.isCommonArea = true;

    return device;
  }

  // Fallback to SDCA Annex Restroom / Stall Inventory
  const stall = getStallById(id);
  if (stall) {
    return {
      id: stall.id,
      name: stall.fullLabel,
      building: stall.building,
      floor: stall.floor,
      location: `${stall.floor} • ${stall.roomName} • ${stall.stallLabel}`,
      stallId: stall.id,
      stallNumber: String(stall.stallNumber),
      isSmartHardware: stall.id === 'toilet-01',
      isCommonArea: false,
    };
  }

  const room = SDCA_RESTROOM_ROOMS.find(
    (r) => r.id === id || r.aliases?.includes(id),
  );
  if (room) {
    return {
      id: room.id,
      name: `${room.roomName} • Common Area`,
      building: room.building,
      floor: room.floor,
      location: `${room.floor} • ${room.roomName} • Sinks & Entrance`,
      isSmartHardware: false,
      isCommonArea: true,
    };
  }

  throw new PublicIssueReportError(
    'Public reporting is unavailable for this device',
    404,
    'device_unavailable',
  );
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
  const raw = headers.get(header)?.trim();
  if (raw) {
    const candidate = raw.split(',')[0].trim();
    if (candidate && isIP(candidate) !== 0) return candidate;
  }

  for (const fallbackHeader of ['x-vercel-forwarded-for', 'x-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
    const candidateRaw = headers.get(fallbackHeader)?.trim();
    if (candidateRaw) {
      const candidate = candidateRaw.split(',')[0].trim();
      if (candidate && isIP(candidate) !== 0) return candidate;
    }
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

export function createOpenKey(deviceId: string, _category?: IssueReportCategory): string {
  return createHash('sha256').update(deviceId).digest('hex');
}

export function createCooldownKey(
  fingerprint: string,
  deviceId: string,
  _category?: IssueReportCategory,
): string {
  return createHash('sha256')
    .update(`${fingerprint}\0${deviceId}`)
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
  uploadEvidence: (
    objectPath: string,
    bytes: Buffer,
    contentType: ValidatedIssueReportPhoto['contentType'],
  ) => Promise<void>;
  evidenceExists: (objectPath: string) => Promise<boolean>;
  notifyAdmins: (notification: AdminIssueReportNotification) => Promise<void>;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
  deviceId: string;
  fingerprint: string;
  category: IssueReportCategory;
  description: string | null;
  photo: ValidatedIssueReportPhoto | null;
  photoCaptureStatus?: PhotoCaptureStatus;
  photoCapturedAt?: number | null;
}

export type AcceptPublicIssueReportOptions = Omit<
  SubmitPublicIssueReportOptions,
  'uploadEvidence' | 'evidenceExists' | 'notifyAdmins'
>;

export interface PublicIssueReportReceipt {
  aggregateId: string;
  submissionId: string;
  referenceCode: string;
  confirmationCount: number;
  submittedAt: number;
  photoCaptureStatus: PhotoCaptureStatus;
  photoCapturedAt: number | null;
  evidenceJobId?: string;
  notificationOutboxId?: string;
}

export function validatePhotoCaptureMetadata(
  input: { photoCaptureStatus?: unknown; photoCapturedAt?: unknown },
  photo: ValidatedIssueReportPhoto | null,
  nowMs = Date.now(),
): { photoCaptureStatus: PhotoCaptureStatus; photoCapturedAt: number | null } {
  const status = input.photoCaptureStatus == null || input.photoCaptureStatus === ''
    ? (photo ? 'captured' : 'unavailable')
    : input.photoCaptureStatus;
  if (!(PHOTO_CAPTURE_STATUSES as readonly unknown[]).includes(status)) {
    throw new PublicIssueReportError('Invalid photo capture status', 400, 'invalid_photo_capture_status');
  }
  if (status === 'captured' && !photo) {
    throw new PublicIssueReportError('A captured photo is required', 400, 'missing_captured_photo');
  }
  if (status === 'unavailable' && photo) {
    throw new PublicIssueReportError('Photo capture status does not match the image', 400, 'inconsistent_photo_capture_status');
  }

  if (input.photoCapturedAt == null || input.photoCapturedAt === '') {
    if (status === 'captured') return { photoCaptureStatus: 'captured', photoCapturedAt: null };
    return { photoCaptureStatus: 'unavailable', photoCapturedAt: null };
  }
  const capturedAt = typeof input.photoCapturedAt === 'number'
    ? input.photoCapturedAt
    : typeof input.photoCapturedAt === 'string' && input.photoCapturedAt.trim()
      ? Number(input.photoCapturedAt)
      : Number.NaN;
  if (!Number.isFinite(capturedAt) || capturedAt <= 0 || capturedAt > nowMs + 5 * 60 * 1_000) {
    throw new PublicIssueReportError('Invalid photo capture time', 400, 'invalid_photo_capture_time');
  }
  if (status !== 'captured') {
    throw new PublicIssueReportError('A photo capture time requires a captured image', 400, 'inconsistent_photo_capture_time');
  }
  return { photoCaptureStatus: 'captured', photoCapturedAt: Math.floor(capturedAt) };
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

export async function acceptPublicIssueReport(
  options: AcceptPublicIssueReportOptions,
): Promise<PublicIssueReportReceipt> {
  const nowMs = (options.now ?? Date.now)();
  const photoMetadata = validatePhotoCaptureMetadata(options, options.photo, nowMs);
  const now = options.timestampFromMillis(nowMs);
  const candidateAggregateId = randomUUID();
  const submissionId = randomUUID();
  const candidateEvidenceJobId = options.photo ? randomUUID() : null;
  const candidateNotificationOutboxId =
    options.category === 'continuous_leak' ? randomUUID() : null;

  const deviceRef = options.db.collection('devices').doc(options.deviceId);
  const rateRef = options.db
    .collection('publicIssueReportRateLimits')
    .doc(options.fingerprint);
  const cooldownRef = options.db
    .collection('publicIssueReportCooldowns')
    .doc(createCooldownKey(options.fingerprint, options.deviceId));
  const openRef = options.db
    .collection('publicIssueReportOpenKeys')
    .doc(createOpenKey(options.deviceId));

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
        candidateData.deviceId === options.deviceId
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
      const existingCategories = Array.isArray(aggregateData.categories)
        ? (aggregateData.categories as string[])
        : typeof aggregateData.category === 'string'
          ? [aggregateData.category]
          : [];
      const mergedCategories = Array.from(
        new Set([...existingCategories, options.category]),
      );

      transaction.set(
        aggregateRef,
        {
          confirmationCount: count,
          categories: mergedCategories,
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
        categories: [options.category],
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

    const evidenceJobId = options.photo ? candidateEvidenceJobId : null;
    const objectPath = evidenceJobId
      ? createEvidencePath(aggregateId, submissionId)
      : null;
    const evidence: IssueReportEvidence = options.photo
      ? evidenceJobId && objectPath
        ? {
            state: 'upload_pending',
            contentType: options.photo.contentType,
            size: options.photo.size,
            jobId: evidenceJobId,
            objectPath,
          }
        : { state: 'none' }
      : { state: 'none' };
    const submission: IssueReportSubmission = {
      id: submissionId,
      description: options.description,
      evidence,
      submittedAt: now,
      photoCaptureStatus: photoMetadata.photoCaptureStatus,
      photoCapturedAt: photoMetadata.photoCapturedAt === null
        ? null
        : options.timestampFromMillis(photoMetadata.photoCapturedAt),
      deviceSnapshot: device,
    };
    transaction.set(submissionRef, submission as unknown as Record<string, unknown>);
    if (evidenceJobId && objectPath) {
      transaction.set(
        options.db.collection('publicIssueReportEvidenceJobs').doc(evidenceJobId),
        {
          id: evidenceJobId,
          status: 'pending',
          phase: 'reserved',
          aggregateId,
          submissionId,
          objectPath,
          contentType: options.photo?.contentType,
          size: options.photo?.size,
          attemptCount: 0,
          reservedAt: now,
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
      submissionId,
      referenceCode: code,
      confirmationCount: count,
      submittedAt: nowMs,
      photoCaptureStatus: photoMetadata.photoCaptureStatus,
      photoCapturedAt: photoMetadata.photoCapturedAt,
      evidenceJobId,
      notificationOutboxId,
    };
  });

  return {
    aggregateId: committed.aggregateId,
    submissionId: committed.submissionId,
    referenceCode: committed.referenceCode,
    confirmationCount: committed.confirmationCount,
    submittedAt: committed.submittedAt,
    photoCaptureStatus: committed.photoCaptureStatus,
    photoCapturedAt: committed.photoCapturedAt,
    ...(committed.evidenceJobId
      ? { evidenceJobId: committed.evidenceJobId }
      : {}),
    ...(committed.notificationOutboxId
      ? { notificationOutboxId: committed.notificationOutboxId }
      : {}),
  };
}

export async function submitPublicIssueReport(
  options: SubmitPublicIssueReportOptions,
): Promise<PublicIssueReportReceipt> {
  const committed = await acceptPublicIssueReport(options);

  if (committed.evidenceJobId) {
    try {
      await processIssueReportEvidenceJob({
        db: options.db,
        jobId: committed.evidenceJobId,
        uploadEvidence: options.uploadEvidence,
        evidenceExists: options.evidenceExists,
        photo: options.photo,
        timestampFromMillis: options.timestampFromMillis,
        now: options.now,
      });
    } catch {
      console.error('[Public Reports] Evidence processing deferred');
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

  return committed;
}

export interface ProcessEvidenceJobOptions {
  db: PublicIssueReportFirestore;
  jobId: string;
  uploadEvidence: (
    objectPath: string,
    bytes: Buffer,
    contentType: ValidatedIssueReportPhoto['contentType'],
  ) => Promise<void>;
  evidenceExists: (objectPath: string) => Promise<boolean>;
  photo?: ValidatedIssueReportPhoto | null;
  reservationTimeoutMs?: number;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
}

async function recordPendingEvidenceFailure(
  options: ProcessEvidenceJobOptions,
  failureCode: 'metadata_write_failed',
): Promise<void> {
  const now = options.timestampFromMillis((options.now ?? Date.now)());
  const jobRef = options.db
    .collection('publicIssueReportEvidenceJobs')
    .doc(options.jobId);
  await options.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || job?.status !== 'pending') return;
    transaction.set(
      jobRef,
      {
        status: 'pending',
        phase: 'uploaded',
        failureCode,
        updatedAt: now,
      },
      { merge: true },
    );
  });
}

async function markEvidenceUploadFailed(
  options: ProcessEvidenceJobOptions,
  failureCode: 'storage_unavailable' | 'upload_timeout',
): Promise<void> {
  const failedAt = options.timestampFromMillis((options.now ?? Date.now)());
  const jobRef = options.db
    .collection('publicIssueReportEvidenceJobs')
    .doc(options.jobId);
  await options.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || job?.status !== 'pending') return;
    const aggregateId = requiredString(job.aggregateId);
    const submissionId = requiredString(job.submissionId);
    const contentType = job.contentType;
    const size = nonnegativeInteger(job.size);
    if (
      !aggregateId ||
      !submissionId ||
      !isIssueReportImageMime(contentType) ||
      size === 0
    ) {
      return;
    }
    transaction.set(
      options.db
        .collection('issueReports')
        .doc(aggregateId)
        .collection('submissions')
        .doc(submissionId),
      {
        evidence: {
          state: 'upload_failed',
          contentType,
          size,
          failureCode,
          failedAt,
        } satisfies IssueReportEvidence,
      },
      { merge: true },
    );
    transaction.set(
      jobRef,
      {
        status: 'failed',
        phase: 'failed',
        failureCode,
        failedAt,
        leaseExpiresAt: null,
        updatedAt: failedAt,
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
  if (!snapshot.exists || job?.status !== 'pending') return;

  const aggregateId = requiredString(job?.aggregateId);
  const submissionId = requiredString(job?.submissionId);
  const objectPath = requiredString(job?.objectPath);
  const contentType = job?.contentType;
  const size = nonnegativeInteger(job?.size);
  if (
    !aggregateId ||
    !submissionId ||
    !objectPath ||
    !isIssueReportImageMime(contentType) ||
    size === 0
  ) {
    return;
  }

  const nowMs = (options.now ?? Date.now)();
  const phase = requiredString(job.phase) ?? 'reserved';
  const leaseExpiresAt = milliseconds(job.leaseExpiresAt);
  let objectExists: boolean;
  try {
    objectExists = await options.evidenceExists(objectPath);
  } catch {
    console.error('[Public Reports] Evidence existence check deferred');
    return;
  }

  if (!objectExists && options.photo) {
    if (
      options.photo.contentType !== contentType ||
      options.photo.size !== size
    ) {
      return;
    }
    const attemptId = randomUUID();
    const claimed = await options.db.runTransaction(async (transaction) => {
      const latest = await transaction.get(jobRef);
      const latestJob = latest.data();
      if (!latest.exists || latestJob?.status !== 'pending') return false;
      const latestLease = milliseconds(latestJob.leaseExpiresAt);
      if (
        latestJob.phase === 'uploading' &&
        latestLease !== null &&
        latestLease > nowMs
      ) {
        return false;
      }
      const claimedAt = options.timestampFromMillis(nowMs);
      transaction.set(
        jobRef,
        {
          phase: 'uploading',
          attemptId,
          attemptCount: nonnegativeInteger(latestJob.attemptCount) + 1,
          lastAttemptAt: claimedAt,
          leaseExpiresAt: options.timestampFromMillis(nowMs + 60_000),
          updatedAt: claimedAt,
        },
        { merge: true },
      );
      return true;
    });
    if (!claimed) return;

    try {
      await options.uploadEvidence(
        objectPath,
        options.photo.bytes,
        contentType,
      );
      objectExists = true;
    } catch {
      try {
        objectExists = await options.evidenceExists(objectPath);
      } catch {
        console.error('[Public Reports] Evidence upload outcome is ambiguous');
        return;
      }
      if (!objectExists) {
        try {
          await markEvidenceUploadFailed(options, 'storage_unavailable');
        } catch {
          console.error('[Public Reports] Evidence failure-state write failed');
        }
        console.error('[Public Reports] Evidence upload failed');
        return;
      }
    }
  }

  if (!objectExists) {
    if (phase === 'uploading' && leaseExpiresAt !== null && leaseExpiresAt > nowMs) {
      return;
    }
    const reservedAt = milliseconds(job.reservedAt);
    const reservationTimeoutMs = options.reservationTimeoutMs ?? 2 * 60 * 1_000;
    const reservationExpired =
      phase === 'uploading'
        ? leaseExpiresAt === null || leaseExpiresAt <= nowMs
        : reservedAt !== null && nowMs - reservedAt >= reservationTimeoutMs;
    if (!reservationExpired) return;
    try {
      await markEvidenceUploadFailed(options, 'upload_timeout');
    } catch {
      console.error('[Public Reports] Evidence timeout-state write failed');
    }
    return;
  }

  const completedAt = options.timestampFromMillis(nowMs);
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
            objectPath,
            storedAt: completedAt,
          } satisfies IssueReportEvidence,
        },
        { merge: true },
      );
      transaction.set(
        jobRef,
        {
          status: 'completed',
          phase: 'stored',
          failureCode: null,
          leaseExpiresAt: null,
          completedAt,
          updatedAt: completedAt,
        },
        { merge: true },
      );
    });
  } catch {
    try {
      await recordPendingEvidenceFailure(options, 'metadata_write_failed');
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

export interface PublicIssueReportRecoveryBatchOptions {
  db: PublicIssueReportFirestore;
  evidenceJobIds: string[];
  notificationOutboxIds: string[];
  maxJobsPerType?: number;
  uploadEvidence: ProcessEvidenceJobOptions['uploadEvidence'];
  evidenceExists: ProcessEvidenceJobOptions['evidenceExists'];
  notifyAdmins: (notification: AdminIssueReportNotification) => Promise<void>;
  timestampFromMillis: (milliseconds: number) => unknown;
  now?: () => number;
}

export async function processPublicIssueReportRecoveryBatch(
  options: PublicIssueReportRecoveryBatchOptions,
): Promise<{ evidenceProcessed: number; notificationsProcessed: number }> {
  const limit = Math.min(Math.max(options.maxJobsPerType ?? 20, 1), 50);
  const evidenceJobIds = [...new Set(options.evidenceJobIds)].slice(0, limit);
  const notificationOutboxIds = [
    ...new Set(options.notificationOutboxIds),
  ].slice(0, limit);

  await Promise.allSettled(
    evidenceJobIds.map((jobId) =>
      processIssueReportEvidenceJob({
        db: options.db,
        jobId,
        uploadEvidence: options.uploadEvidence,
        evidenceExists: options.evidenceExists,
        timestampFromMillis: options.timestampFromMillis,
        now: options.now,
      }),
    ),
  );
  await Promise.allSettled(
    notificationOutboxIds.map((jobId) =>
      processIssueReportNotificationOutbox({
        db: options.db,
        jobId,
        notifyAdmins: options.notifyAdmins,
        timestampFromMillis: options.timestampFromMillis,
        now: options.now,
      }),
    ),
  );

  return {
    evidenceProcessed: evidenceJobIds.length,
    notificationsProcessed: notificationOutboxIds.length,
  };
}
