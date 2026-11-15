import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { sendTaskNotification } from './fcm';
import { chooseAvailableMaintenancePersonnel } from './task-service';
import type { TaskDoc } from './task-types';

const ACTIVE_ASSIGNMENT_STATUSES = [
  'unassigned',
  'assigned',
  'acknowledged',
  'pending',
  'rechecking',
  'flagged',
  'reassignment_needed',
] as const;

const RETRY_MS = readPositiveIntEnv('AUTOMATION_UNASSIGNED_RETRY_MS', 60_000);
const SWEEP_MS = readPositiveIntEnv('AUTOMATION_UNASSIGNED_SWEEP_MS', 120_000);
const QUOTA_BACKOFF_MS = readPositiveIntEnv('AUTOMATION_QUOTA_BACKOFF_MS', 120_000);
const SWEEP_LIMIT = 25;

let sweepInterval: NodeJS.Timeout | null = null;
let sweepInFlight = false;
let quotaBackoffUntilMs = 0;

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.includes('RESOURCE_EXHAUSTED');
  }
  const err = error as { code?: unknown; message?: unknown };
  if (err.code === 8 || err.code === '8' || err.code === 'resource-exhausted') {
    return true;
  }
  const msg = typeof err.message === 'string' ? err.message : '';
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function timestampToMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    return value.toMillis();
  }
  return null;
}

interface RetryResult {
  outcome: 'assigned' | 'rescheduled' | 'skipped';
  task?: TaskDoc;
}

async function retryOneTask(taskId: string, now: Timestamp): Promise<RetryResult> {
  return adminDb.runTransaction(async (transaction) => {
    const tasks = adminDb.collection('tasks');
    const users = adminDb.collection('users');
    const taskRef = tasks.doc(taskId);
    const taskSnapshot = await transaction.get(taskRef);
    const data = taskSnapshot.data() as Partial<TaskDoc> | undefined;
    const eligibleAt = timestampToMillis(data?.autoAssignmentEligibleAt);

    // A supervisor assignment, cancellation, or a newer retry always wins.
    if (
      !taskSnapshot.exists ||
      data?.completedAt != null ||
      data?.status !== 'unassigned' ||
      data.assignedTo !== null ||
      data.isBroadcast !== false ||
      eligibleAt === null ||
      eligibleAt > now.toMillis()
    ) {
      return { outcome: 'skipped' };
    }

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      transaction.get(users.where('role', '==', 'maintenance')),
      transaction.get(tasks.where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES)),
    ]);
    const technician = chooseAvailableMaintenancePersonnel(
      usersSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
      activeTasksSnapshot.docs as Array<{ data: () => Record<string, unknown> }>,
    )[0];

    if (!technician) {
      transaction.update(taskRef, {
        status: 'unassigned',
        assignedTo: null,
        assignedToIds: [],
        isBroadcast: false,
        requiresSupervisorAssignment: true,
        autoAssignmentEligibleAt: Timestamp.fromMillis(now.toMillis() + RETRY_MS),
        updatedAt: now,
      });
      return { outcome: 'rescheduled' };
    }

    const assignedTask = {
      ...data,
      id: taskId,
      status: 'assigned' as const,
      assignedTo: technician.uid,
      assignedToIds: [technician.uid],
      isBroadcast: false,
      assignmentType: 'individual' as const,
      requiresSupervisorAssignment: false,
      assignmentSource: 'retry_auto' as const,
      autoAssignmentEligibleAt: null,
      assignedAt: now,
      updatedAt: now,
    } as TaskDoc;

    transaction.update(taskRef, {
      status: assignedTask.status,
      assignedTo: assignedTask.assignedTo,
      assignedToIds: assignedTask.assignedToIds,
      isBroadcast: false,
      assignmentType: 'individual',
      requiresSupervisorAssignment: false,
      assignmentSource: 'retry_auto',
      autoAssignmentEligibleAt: null,
      assignedAt: now,
      updatedAt: now,
    });
    transaction.update(users.doc(technician.uid), {
      lastAutoAssignedAt: now,
      currentTaskId: taskId,
      isAvailable: false,
      updatedAt: now,
    });
    return { outcome: 'assigned', task: assignedTask };
  });
}

export async function sweepUnassignedAutomationTasks(): Promise<{
  scanned: number;
  assigned: number;
  rescheduled: number;
}> {
  if (process.env.NODE_ENV !== 'test' && Date.now() < quotaBackoffUntilMs) {
    return { scanned: 0, assigned: 0, rescheduled: 0 };
  }

  const now = Timestamp.now();
  let snapshot;
  try {
    snapshot = await adminDb
      .collection('tasks')
      .where('status', '==', 'unassigned')
      .where('autoAssignmentEligibleAt', '<=', now)
      .orderBy('autoAssignmentEligibleAt', 'asc')
      .limit(SWEEP_LIMIT)
      .get();
  } catch (error) {
    if (isQuotaError(error) && process.env.NODE_ENV !== 'test') {
      quotaBackoffUntilMs = Date.now() + QUOTA_BACKOFF_MS;
      console.warn('[AutomationRetry] Quota exhausted; pausing sweep for backoff');
      return { scanned: 0, assigned: 0, rescheduled: 0 };
    }
    throw error;
  }

  let assigned = 0;
  let rescheduled = 0;
  for (const candidate of snapshot.docs) {
    try {
      const result = await retryOneTask(candidate.id, now);
      if (result.outcome === 'assigned' && result.task) {
        assigned += 1;
        try {
          await sendTaskNotification(result.task);
        } catch (error) {
          console.error('[AutomationRetry] FCM failed after assignment:', error);
        }
      } else if (result.outcome === 'rescheduled') {
        rescheduled += 1;
      }
    } catch (error) {
      if (isQuotaError(error) && process.env.NODE_ENV !== 'test') {
        quotaBackoffUntilMs = Date.now() + QUOTA_BACKOFF_MS;
        console.warn('[AutomationRetry] Quota exhausted during task retry; backing off');
        break;
      }
      console.error(`[AutomationRetry] Failed to process task ${candidate.id}:`, error);
    }
  }

  return { scanned: snapshot.docs.length, assigned, rescheduled };
}

export function startUnassignedTaskSweeper(): NodeJS.Timeout {
  if (sweepInterval) return sweepInterval;

  const run = async () => {
    if (sweepInFlight) return;
    if (process.env.NODE_ENV !== 'test' && Date.now() < quotaBackoffUntilMs) return;
    sweepInFlight = true;
    try {
      await sweepUnassignedAutomationTasks();
    } catch (error) {
      if (isQuotaError(error) && process.env.NODE_ENV !== 'test') {
        quotaBackoffUntilMs = Date.now() + QUOTA_BACKOFF_MS;
      }
      console.error('[AutomationRetry] Sweep failed:', error);
    } finally {
      sweepInFlight = false;
    }
  };

  void run();
  sweepInterval = setInterval(() => void run(), SWEEP_MS);
  return sweepInterval;
}

export function stopUnassignedTaskSweeper(): void {
  if (!sweepInterval) return;
  clearInterval(sweepInterval);
  sweepInterval = null;
}
