import { adminDb } from '@/lib/firebase-admin';
import {
  createOpenKey,
  PublicIssueReportError,
  sanitizePublicDevice,
  type PublicReportingDevice,
} from '@/lib/public-issue-reports';
import { PublicIssueReportForm } from './PublicIssueReportForm';

export const dynamic = 'force-dynamic';

export async function loadPublicReportingDevice(
  deviceId: string,
): Promise<PublicReportingDevice> {
  const snapshot = await adminDb.collection('devices').doc(deviceId).get();
  return sanitizePublicDevice(
    deviceId,
    snapshot.exists ? snapshot.data() : null,
  );
}

export async function checkStallHasPendingReport(deviceId: string): Promise<boolean> {
  try {
    const openKey = createOpenKey(deviceId);
    const snapshot = await adminDb
      .collection('publicIssueReportOpenKeys')
      .doc(openKey)
      .get();
    return snapshot.exists;
  } catch {
    return false;
  }
}

function UnavailableReportPage() {
  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-4 py-8 text-slate-900">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">Reporting unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This restroom is not accepting public reports. Please contact facility staff.
        </p>
      </section>
    </main>
  );
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  let device: PublicReportingDevice;
  try {
    device = await loadPublicReportingDevice(deviceId);
  } catch (error) {
    if (!(error instanceof PublicIssueReportError)) {
      console.error('[Public Reports] Device validation failed');
    }
    return <UnavailableReportPage />;
  }

  const hasPendingReport = await checkStallHasPendingReport(deviceId);

  return (
    <PublicIssueReportForm
      device={device}
      hasPendingReport={hasPendingReport}
    />
  );
}
