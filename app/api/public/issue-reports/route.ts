import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { sendAdminNotification } from '@/lib/fcm';
import {
  PublicIssueReportError,
  createPublicReportFingerprint,
  extractClientIp,
  submitPublicIssueReport,
  validateIssueReportInput,
  validateIssueReportPhoto,
  type IssueReportCategory,
  type PublicIssueReportFirestore,
  type PublicIssueReportReceipt,
  type ValidatedIssueReportPhoto,
} from '@/lib/public-issue-reports';

interface IntakeInput {
  deviceId: string;
  fingerprint: string;
  category: IssueReportCategory;
  description: string | null;
  photo: ValidatedIssueReportPhoto | null;
}

interface HandlerDependencies {
  secret: string | undefined;
  now?: () => number;
  submit: (input: IntakeInput) => Promise<PublicIssueReportReceipt>;
}

async function saveEvidence(
  objectPath: string,
  bytes: Buffer,
  contentType: ValidatedIssueReportPhoto['contentType'],
): Promise<void> {
  await adminStorage.bucket().file(objectPath).save(bytes, {
    resumable: false,
    validation: 'crc32c',
    metadata: {
      contentType,
      cacheControl: 'private, no-store, max-age=0',
    },
  });
}

async function submitWithFirebase(
  input: IntakeInput,
): Promise<PublicIssueReportReceipt> {
  return submitPublicIssueReport({
    db: adminDb as unknown as PublicIssueReportFirestore,
    saveEvidence,
    notifyAdmins: async (notification) => {
      await sendAdminNotification({
        title: 'Continuous leak reported',
        body: `${notification.deviceName} has a public continuous-leak report (${notification.referenceCode}).`,
        data: {
          issueReportId: notification.issueReportId,
          deviceId: notification.deviceId,
          category: notification.category,
          referenceCode: notification.referenceCode,
          confirmationCount: String(notification.confirmationCount),
        },
      });
    },
    timestampFromMillis: (milliseconds) => Timestamp.fromMillis(milliseconds),
    ...input,
  });
}

function formString(form: FormData, field: string): string | undefined {
  const value = form.get(field);
  return typeof value === 'string' ? value : undefined;
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
      const fingerprint = createPublicReportFingerprint(
        extractClientIp(request.headers),
        dependencies.secret,
      );
      const form = await request.formData();
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
      const receipt = await dependencies.submit({
        deviceId,
        fingerprint,
        category: validated.category,
        description: validated.description,
        photo,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            referenceCode: receipt.referenceCode,
            confirmation:
              'Your report has been received for administrator review.',
          },
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof PublicIssueReportError) return errorResponse(error);
      console.error('[Public Reports] Intake failed');
      return NextResponse.json(
        { success: false, error: 'Unable to submit report' },
        { status: 500 },
      );
    }
  };
}

export const POST = createPublicIssueReportPostHandler({
  secret: process.env.PUBLIC_REPORT_FINGERPRINT_SECRET,
  submit: submitWithFirebase,
});
