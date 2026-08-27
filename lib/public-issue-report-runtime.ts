import { adminStorage } from '@/lib/firebase-admin';
import { sendAdminNotification } from '@/lib/fcm';
import type {
  AdminIssueReportNotification,
  ValidatedIssueReportPhoto,
} from '@/lib/public-issue-reports';

export async function uploadIssueReportEvidence(
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

export async function issueReportEvidenceExists(
  objectPath: string,
): Promise<boolean> {
  const [exists] = await adminStorage.bucket().file(objectPath).exists();
  return exists;
}

export async function notifyIssueReportAdmins(
  notification: AdminIssueReportNotification,
): Promise<void> {
  await sendAdminNotification({
    title: 'Continuous leak reported',
    body: `${notification.deviceName} has a public continuous-leak report (${notification.referenceCode}).`,
    data: {
      issueReportId: notification.issueReportId,
      notificationId: notification.notificationId,
      deviceId: notification.deviceId,
      category: notification.category,
      referenceCode: notification.referenceCode,
      confirmationCount: String(notification.confirmationCount),
    },
  });
}
