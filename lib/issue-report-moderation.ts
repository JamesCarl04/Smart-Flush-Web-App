import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { createOpenKey, ISSUE_REPORT_STATUSES, type IssueReportStatus } from '@/lib/public-issue-reports';
import { sendTaskNotification } from '@/lib/fcm';
import {
  selectLeastRecentlyAssignedTechnician,
  type AvailableTechnician,
} from '@/lib/task-assignment';
import type { TaskDoc } from '@/lib/task-types';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const RETRY_MS = 60_000;
const UNFINISHED_STATUSES = [
  'pending', 'unassigned', 'assigned', 'acknowledged', 'flagged', 'rechecking', 'reassignment_needed',
];

export const ISSUE_REPORT_DISMISSAL_REASONS = [
  'invalid_report',
  'unable_to_verify',
  'already_resolved',
  'other',
] as const;
export type IssueReportDismissalReason = (typeof ISSUE_REPORT_DISMISSAL_REASONS)[number];

export class IssueReportModerationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'IssueReportModerationError';
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function millis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function parseIssueReportStatus(value: string | null): IssueReportStatus {
  const status = value ?? 'pending_review';
  if (!(ISSUE_REPORT_STATUSES as readonly string[]).includes(status)) {
    throw new IssueReportModerationError('Invalid status filter', 400);
  }
  return status as IssueReportStatus;
}

export function parseDismissal(value: unknown): { reason: IssueReportDismissalReason; note: string | null } {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof body.reason !== 'string' || !(ISSUE_REPORT_DISMISSAL_REASONS as readonly string[]).includes(body.reason)) {
    throw new IssueReportModerationError('Invalid dismissal reason', 400);
  }
  const note = text(body.note);
  if (body.reason === 'other' && !note) {
    throw new IssueReportModerationError('An administrator note is required for other', 400);
  }
  return { reason: body.reason as IssueReportDismissalReason, note };
}

interface SubmissionShape {
  id: string;
  description?: unknown;
  evidence?: unknown;
  photoCaptureStatus?: unknown;
  photoCapturedAt?: unknown;
  submittedAt?: unknown;
}

export function safeSerializeIssueReport(
  id: string,
  data: Record<string, unknown>,
  submissions: SubmissionShape[],
): Record<string, unknown> {
  const device = data.device && typeof data.device === 'object'
    ? data.device as Record<string, unknown>
    : {};
  const descriptions = submissions.map((submission) => text(submission.description)).filter((value): value is string => value !== null);
  const evidence = submissions.flatMap((submission) => {
    const item = submission.evidence && typeof submission.evidence === 'object'
      ? submission.evidence as Record<string, unknown>
      : {};
    return item.state === 'stored' && text(item.contentType)
      ? [{ submissionId: submission.id, contentType: text(item.contentType), size: count(item.size) }]
      : [];
  });
  const submissionDetails = submissions.map((submission) => ({
    submissionId: submission.id,
    photoCaptureStatus: submission.photoCaptureStatus === 'captured' || submission.photoCaptureStatus === 'unavailable'
      ? submission.photoCaptureStatus
      : submission.evidence && typeof submission.evidence === 'object' && (submission.evidence as Record<string, unknown>).state === 'stored'
        ? 'captured'
        : 'unavailable',
    photoCapturedAt: millis(submission.photoCapturedAt),
    submittedAt: millis(submission.submittedAt),
  }));
  return {
    id,
    referenceCode: text(data.referenceCode),
    deviceId: text(data.deviceId),
    device: {
      id: text(device.id),
      name: text(device.name),
      building: text(device.building),
      floor: text(device.floor),
      location: text(device.location),
    },
    category: text(data.category),
    categories: Array.isArray(data.categories)
      ? data.categories.map((c) => text(c)).filter((c): c is string => c !== null)
      : text(data.category) ? [text(data.category) as string] : [],
    status: text(data.status),
    confirmationCount: count(data.confirmationCount),
    firstReportedAt: millis(data.firstReportedAt),
    lastReportedAt: millis(data.lastReportedAt),
    descriptions,
    evidence,
    submissions: submissionDetails,
    linkedTaskId: text(data.linkedTaskId),
    reviewedBy: text(data.reviewedBy),
    reviewedAt: millis(data.reviewedAt),
    dismissalReason: text(data.dismissalReason),
    dismissalNote: text(data.dismissalNote),
  };
}

export async function listIssueReports(status: IssueReportStatus): Promise<Record<string, unknown>[]> {
  const snapshot = await adminDb.collection('issueReports').where('status', '==', status).limit(100).get();
  const values = await Promise.all(snapshot.docs.map(async (doc) => {
    const submissions = await doc.ref.collection('submissions').orderBy('submittedAt', 'asc').get();
    return safeSerializeIssueReport(doc.id, doc.data() as Record<string, unknown>, submissions.docs.map((submission) => ({
      id: submission.id,
      ...(submission.data() as Record<string, unknown>),
    })));
  }));
  return values.sort((left, right) => Number(right.lastReportedAt ?? 0) - Number(left.lastReportedAt ?? 0));
}

function taskDescription(category: string, categories: string[], descriptions: string[]): string {
  const approved = descriptions.find((value) => value.trim())?.trim();
  const allCategories = categories.length > 0 ? categories : [category];
  const formattedCategories = allCategories.map((c) => c.replaceAll('_', ' ')).join(', ');
  return approved
    ? `[${formattedCategories}] ${approved}`
    : `Investigate administrator-confirmed report: ${formattedCategories}.`;
}

function technicianFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): AvailableTechnician | null {
  const data = doc.data() as Record<string, unknown>;
  if (data.isOnline === false || data.status === 'offline' || data.status === 'inactive' || data.isActive === false || data.isAvailable === false) return null;
  return {
    id: doc.id,
    displayName: text(data.displayName) ?? text(data.name) ?? text(data.email) ?? doc.id,
    email: text(data.email),
    shift: text(data.shift),
    workload: 0,
    lastAutoAssignedAt: millis(data.lastAutoAssignedAt),
  };
}

export interface ModerationReviewer { uid: string; email?: string | null; name?: string | null }

export async function confirmIssueReport(reportId: string, reviewer: ModerationReviewer): Promise<Record<string, unknown>> {
  const reportRef = adminDb.collection('issueReports').doc(reportId);
  const candidateTaskRef = adminDb.collection('tasks').doc();
  const outcome = await adminDb.runTransaction(async (transaction) => {
    const reportSnapshot = await transaction.get(reportRef);
    if (!reportSnapshot.exists) throw new IssueReportModerationError('Issue report not found', 404);
    const report = reportSnapshot.data() as Record<string, unknown>;
    if (report.status === 'confirmed' && text(report.linkedTaskId)) {
      return { created: false, taskId: text(report.linkedTaskId) as string, task: null };
    }
    if (report.status !== 'pending_review') throw new IssueReportModerationError('Issue report is no longer pending', 409);

    const submissionsSnapshot = await transaction.get(reportRef.collection('submissions'));
    const usersSnapshot = await transaction.get(adminDb.collection('users').where('role', '==', 'maintenance'));
    const tasksSnapshot = await transaction.get(adminDb.collection('tasks').where('status', 'in', UNFINISHED_STATUSES));
    const busy = new Set<string>();
    for (const taskDoc of tasksSnapshot.docs) {
      const task = taskDoc.data();
      if (task.completedAt != null) continue;
      if (text(task.assignedTo)) busy.add(text(task.assignedTo) as string);
      if (Array.isArray(task.assignedToIds)) task.assignedToIds.forEach((uid) => { if (text(uid)) busy.add(text(uid) as string); });
    }
    const technicians = usersSnapshot.docs.map(technicianFromDoc).filter((item): item is AvailableTechnician => item !== null && !busy.has(item.id));
    const selected = selectLeastRecentlyAssignedTechnician(technicians);
    const now = Timestamp.now();
    const device = report.device && typeof report.device === 'object' ? report.device as Record<string, unknown> : {};
    const category = text(report.category) ?? 'other';
    const categories = Array.isArray(report.categories)
      ? report.categories.map((c) => text(c)).filter((c): c is string => c !== null)
      : [category];
    const descriptions = submissionsSnapshot.docs.map((doc) => text(doc.data().description)).filter((value): value is string => value !== null);
    const assignedToIds = selected ? [selected.id] : [];
    const task: TaskDoc = {
      id: candidateTaskRef.id,
      deviceId: text(report.deviceId) ?? 'unknown',
      restroomName: text(device.name),
      building: text(device.building),
      floor: text(device.floor),
      location: text(device.location),
      triggerType: 'student_report',
      message: taskDescription(category, categories, descriptions),
      status: selected ? 'assigned' : 'unassigned',
      assignedTo: selected?.id ?? null,
      assignedToIds,
      isBroadcast: false,
      ...(selected ? { assignmentType: 'individual' as const, assignmentSource: 'initial_auto' as const } : {}),
      requiresSupervisorAssignment: !selected,
      autoAssignmentEligibleAt: selected ? null : Timestamp.fromMillis(now.toMillis() + RETRY_MS),
      occurrenceCount: Math.max(1, count(report.confirmationCount)),
      latestOccurrenceAt: Timestamp.fromMillis(millis(report.lastReportedAt) ?? now.toMillis()),
      taskOrigin: 'public_report',
      issueReportId: reportId,
      reportCategory: category,
      createdAt: now,
      assignedAt: selected ? now : null,
      acknowledgedAt: null,
      completedAt: null,
      acknowledgedBy: {},
      completedBy: {},
      createdBy: `admin:${reviewer.uid}`,
    };
    transaction.set(candidateTaskRef, task);
    if (selected) transaction.set(adminDb.collection('users').doc(selected.id), { currentTaskId: candidateTaskRef.id, isAvailable: false, lastAutoAssignedAt: now, updatedAt: now }, { merge: true });
    transaction.update(reportRef, {
      status: 'confirmed',
      linkedTaskId: candidateTaskRef.id,
      reviewedBy: reviewer.uid,
      reviewerEmail: reviewer.email ?? null,
      reviewedAt: now,
    });
    const deviceId = text(report.deviceId);
    if (deviceId) transaction.delete(adminDb.collection('publicIssueReportOpenKeys').doc(createOpenKey(deviceId)));
    return { created: true, taskId: candidateTaskRef.id, task };
  });

  if (outcome.created && outcome.task) {
    try {
      await sendTaskNotification(outcome.task, outcome.task.assignedTo, outcome.task.assignedToIds);
    } catch (error) {
      console.error('[Issue Reports] Task notification failed after commit:', error);
    }
  }
  return { reportId, taskId: outcome.taskId, status: 'confirmed' };
}

export async function dismissIssueReport(
  reportId: string,
  dismissal: { reason: IssueReportDismissalReason; note: string | null },
  reviewer: ModerationReviewer,
): Promise<Record<string, unknown>> {
  const reportRef = adminDb.collection('issueReports').doc(reportId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reportRef);
    if (!snapshot.exists) throw new IssueReportModerationError('Issue report not found', 404);
    const report = snapshot.data() as Record<string, unknown>;
    if (report.status === 'dismissed') return { reportId, status: 'dismissed', reason: text(report.dismissalReason) };
    if (report.status !== 'pending_review') throw new IssueReportModerationError('Issue report is no longer pending', 409);
    const now = Timestamp.now();
    transaction.update(reportRef, {
      status: 'dismissed',
      dismissalReason: dismissal.reason,
      dismissalNote: dismissal.note,
      reviewedBy: reviewer.uid,
      reviewerEmail: reviewer.email ?? null,
      reviewedAt: now,
      evidenceRetention: {
        state: 'scheduled', terminalReason: 'dismissed', terminalAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + RETENTION_MS),
      },
    });
    const deviceId = text(report.deviceId);
    if (deviceId) transaction.delete(adminDb.collection('publicIssueReportOpenKeys').doc(createOpenKey(deviceId)));
    return { reportId, status: 'dismissed', reason: dismissal.reason };
  });
}

export async function readIssueReportEvidence(reportId: string, submissionId: string): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
  const report = await adminDb.collection('issueReports').doc(reportId).get();
  if (!report.exists) throw new IssueReportModerationError('Issue report not found', 404);
  const submission = await report.ref.collection('submissions').doc(submissionId).get();
  const evidence = submission.data()?.evidence as Record<string, unknown> | undefined;
  const objectPath = text(evidence?.objectPath);
  const contentType = text(evidence?.contentType);
  if (!submission.exists || evidence?.state !== 'stored' || !objectPath || !contentType || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new IssueReportModerationError('Evidence not found', 404);
  }
  const [bytes] = await adminStorage.bucket().file(objectPath).download();
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return { bytes, contentType, filename: `issue-report-${submissionId}.${extension}` };
}

export function scheduleLinkedReportRetention(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  task: { issueReportId?: unknown },
  terminalAt: { toMillis(): number },
  reason: 'linked_task_completed',
): void {
  const issueReportId = text(task.issueReportId);
  if (!issueReportId) return;
  transaction.update(db.collection('issueReports').doc(issueReportId), {
    'evidenceRetention.state': 'scheduled',
    'evidenceRetention.terminalReason': reason,
    'evidenceRetention.terminalAt': terminalAt,
    'evidenceRetention.expiresAt': Timestamp.fromMillis(terminalAt.toMillis() + RETENTION_MS),
  });
}
