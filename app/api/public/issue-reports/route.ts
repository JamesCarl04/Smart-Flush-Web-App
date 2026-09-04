import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { resolveFirebaseAdminConfig } from '@/lib/firebase-admin-config';
import {
  issueReportEvidenceExists,
  notifyIssueReportAdmins,
  uploadIssueReportEvidence,
} from '@/lib/public-issue-report-runtime';
import {
  PublicIssueReportError,
  createPublicReportFingerprint,
  extractClientIp,
  submitPublicIssueReport,
  validateIssueReportInput,
  validatePhotoCaptureMetadata,
  validateIssueReportPhoto,
  type IssueReportCategory,
  type PublicIssueReportFirestore,
  type PublicIssueReportReceipt,
  type PhotoCaptureStatus,
  type ValidatedIssueReportPhoto,
} from '@/lib/public-issue-reports';

interface IntakeInput {
  deviceId: string;
  fingerprint: string;
  category: IssueReportCategory;
  description: string | null;
  photo: ValidatedIssueReportPhoto | null;
  photoCaptureStatus?: PhotoCaptureStatus;
  photoCapturedAt?: number | null;
}

interface HandlerDependencies {
  secret: string | undefined;
  trustedIpHeader?: string;
  maxRequestBytes?: number;
  now?: () => number;
  submit: (input: IntakeInput) => Promise<PublicIssueReportReceipt>;
}

const DEFAULT_MAX_REQUEST_BYTES = 6 * 1024 * 1024;

async function submitWithFirebase(
  input: IntakeInput,
): Promise<PublicIssueReportReceipt> {
  return submitPublicIssueReport({
    db: adminDb as unknown as PublicIssueReportFirestore,
    uploadEvidence: uploadIssueReportEvidence,
    evidenceExists: issueReportEvidenceExists,
    notifyAdmins: notifyIssueReportAdmins,
    timestampFromMillis: (milliseconds) => Timestamp.fromMillis(milliseconds),
    ...input,
  });
}

function formString(form: FormData, field: string): string | undefined {
  const value = form.get(field);
  return typeof value === 'string' ? value : undefined;
}

function requestTooLarge(): PublicIssueReportError {
  return new PublicIssueReportError(
    'Request is too large',
    413,
    'request_too_large',
  );
}

function enforceDeclaredRequestSize(headers: Headers, maxBytes: number): void {
  const declared = headers.get('content-length');
  if (declared === null) return;
  if (!/^\d+$/.test(declared.trim())) {
    throw new PublicIssueReportError(
      'Invalid request size',
      400,
      'invalid_content_length',
    );
  }
  if (Number(declared) > maxBytes) throw requestTooLarge();
}

function enforceParsedRequestSize(form: FormData, maxBytes: number): void {
  let bytes = 0;
  for (const [field, value] of form.entries()) {
    bytes += Buffer.byteLength(field, 'utf8');
    bytes +=
      typeof value === 'string'
        ? Buffer.byteLength(value, 'utf8')
        : value.size;
    if (bytes > maxBytes) throw requestTooLarge();
  }
}

function errorResponse(error: PublicIssueReportError): NextResponse {
  return NextResponse.json(
    { success: false, error: error.message },
    {
      status: error.status,
      ...(error.status === 429
        ? { headers: { 'Retry-After': '600' } }
        : {}),
    },
  );
}

export function createPublicIssueReportPostHandler(
  dependencies: HandlerDependencies,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const nowMs = (dependencies.now ?? Date.now)();
      const maxRequestBytes =
        dependencies.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
      enforceDeclaredRequestSize(request.headers, maxRequestBytes);
      const clientIp = extractClientIp(
        request.headers,
        dependencies.trustedIpHeader,
      );
      const fingerprint = createPublicReportFingerprint(
        clientIp,
        dependencies.secret,
      );
      const form = await request.formData();
      enforceParsedRequestSize(form, maxRequestBytes);
      const deviceId = formString(form, 'deviceId')?.trim();
      if (!deviceId || !/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
        throw new PublicIssueReportError(
          'Invalid device',
          400,
          'invalid_device',
        );
      }

      const validated = validateIssueReportInput(
        {
          category: formString(form, 'category'),
          description: formString(form, 'description'),
          website: formString(form, 'website'),
          startedAt: formString(form, 'startedAt'),
        },
        nowMs,
      );
      const photoEntry = form.get('photo');
      const photo =
        photoEntry instanceof File && photoEntry.size > 0
          ? await validateIssueReportPhoto(photoEntry)
          : null;
      const photoCaptureStatusInput = formString(form, 'photoCaptureStatus');
      const photoCapturedAtInput = formString(form, 'photoCapturedAt');
      const photoMetadata = validatePhotoCaptureMetadata(
        {
          photoCaptureStatus: photoCaptureStatusInput,
          photoCapturedAt: photoCapturedAtInput,
        },
        photo,
        nowMs,
      );
      const receipt = await dependencies.submit({
        deviceId,
        fingerprint,
        category: validated.category,
        description: validated.description,
        photo,
        ...(photoCaptureStatusInput !== undefined || photoCapturedAtInput !== undefined
          ? {
              photoCaptureStatus: photoMetadata.photoCaptureStatus,
              photoCapturedAt: photoMetadata.photoCapturedAt,
            }
          : {}),
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            referenceCode: receipt.referenceCode,
            confirmation:
              'Your report has been received for administrator review.',
            submittedAt: receipt.submittedAt,
            photoCaptureStatus: receipt.photoCaptureStatus,
            photoCapturedAt: receipt.photoCapturedAt,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof PublicIssueReportError) return errorResponse(error);
      console.error('[Public Reports] Intake failed:', error);
      const details = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to submit report',
          details,
        },
        { status: 500 },
      );
    }
  };
}

export const POST = createPublicIssueReportPostHandler({
  secret:
    process.env.PUBLIC_REPORT_FINGERPRINT_SECRET ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    'klir-public-report-default-salt',
  trustedIpHeader: process.env.PUBLIC_REPORT_TRUSTED_IP_HEADER,
  submit: submitWithFirebase,
});

/**
 * Diagnostic health check endpoint:
 * Allows administrators and developers to inspect Firebase Admin initialization,
 * Firestore connectivity, and storage bucket configuration in production.
 */
export async function GET(request: Request) {
  const { values, missing } = resolveFirebaseAdminConfig(process.env);
  const isAppInitialized = admin.apps.length > 0;
  let firestoreStatus = 'not_checked';
  let firestoreError: string | null = null;
  let storageStatus = 'not_checked';
  let storageError: string | null = null;

  if (isAppInitialized) {
    try {
      await adminDb.collection('devices').limit(1).get();
      firestoreStatus = 'connected';
    } catch (err: unknown) {
      firestoreStatus = 'error';
      firestoreError = err instanceof Error ? err.message : String(err);
    }

    try {
      if (values.storageBucket) {
        const bucket = adminStorage.bucket();
        storageStatus = bucket ? 'configured' : 'missing';
      } else {
        storageStatus = 'no_bucket_specified';
      }
    } catch (err: unknown) {
      storageStatus = 'error';
      storageError = err instanceof Error ? err.message : String(err);
    }
  }

  const clientIp = extractClientIp(
    request.headers,
    process.env.PUBLIC_REPORT_TRUSTED_IP_HEADER,
  );

  return NextResponse.json({
    status:
      missing.length === 0 && firestoreStatus === 'connected'
        ? 'healthy'
        : 'attention_required',
    timestamp: new Date().toISOString(),
    firebaseAdmin: {
      initialized: isAppInitialized,
      projectId: values.projectId ?? null,
      hasClientEmail: !!values.clientEmail,
      hasPrivateKey: !!values.privateKey,
      storageBucket: values.storageBucket ?? null,
      missingRequiredEnvVars: missing,
    },
    firestore: {
      status: firestoreStatus,
      error: firestoreError,
    },
    storage: {
      status: storageStatus,
      error: storageError,
    },
    clientIp,
    fingerprintSecretSet: !!process.env.PUBLIC_REPORT_FINGERPRINT_SECRET,
  });
}
