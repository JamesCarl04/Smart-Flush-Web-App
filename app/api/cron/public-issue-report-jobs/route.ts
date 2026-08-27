import { createHash, timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  processPublicIssueReportRecoveryBatch,
  type PublicIssueReportFirestore,
} from '@/lib/public-issue-reports';
import {
  issueReportEvidenceExists,
  notifyIssueReportAdmins,
  uploadIssueReportEvidence,
} from '@/lib/public-issue-report-runtime';

const JOBS_PER_TYPE = 20;

interface CronHandlerDependencies {
  secret: string | undefined;
  runBatch: () => Promise<{
    evidenceProcessed: number;
    notificationsProcessed: number;
  }>;
}

function equalSecret(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

export function createPublicIssueReportJobsCronHandler(
  dependencies: CronHandlerDependencies,
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    if (!dependencies.secret?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Cron recovery is not configured' },
        { status: 503 },
      );
    }

    const expected = `Bearer ${dependencies.secret}`;
    const authorization = request.headers.get('authorization') ?? '';
    if (!equalSecret(authorization, expected)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    try {
      const data = await dependencies.runBatch();
      return NextResponse.json({ success: true, data });
    } catch {
      console.error('[Public Reports] Cron recovery batch failed');
      return NextResponse.json(
        { success: false, error: 'Recovery batch failed' },
        { status: 500 },
      );
    }
  };
}

async function listJobIds(
  collection: string,
  statuses: string[],
): Promise<string[]> {
  const snapshot = await adminDb
    .collection(collection)
    .where('status', 'in', statuses)
    .limit(JOBS_PER_TYPE)
    .get();
  return snapshot.docs.map((document) => document.id);
}

async function runProductionBatch() {
  const [evidenceJobIds, notificationOutboxIds] = await Promise.all([
    listJobIds('publicIssueReportEvidenceJobs', ['pending']),
    listJobIds('publicIssueReportNotificationOutbox', ['pending', 'sending']),
  ]);
  return processPublicIssueReportRecoveryBatch({
    db: adminDb as unknown as PublicIssueReportFirestore,
    evidenceJobIds,
    notificationOutboxIds,
    maxJobsPerType: JOBS_PER_TYPE,
    uploadEvidence: uploadIssueReportEvidence,
    evidenceExists: issueReportEvidenceExists,
    notifyAdmins: notifyIssueReportAdmins,
    timestampFromMillis: (milliseconds) => Timestamp.fromMillis(milliseconds),
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = createPublicIssueReportJobsCronHandler({
  secret: process.env.CRON_SECRET,
  runBatch: runProductionBatch,
});
