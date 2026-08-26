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
const SWEEP_MS = readPositiveIntEnv('AUTOMATION_UNASSIGNED_SWEEP_MS', 15_000);
const SWEEP_LIMIT = 25;

let sweepInterval: NodeJS.Timeout | null = null;
let sweepInFlight = false;

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
  const now = Timestamp.now();
  const snapshot = await adminDb
    .collection('tasks')
    .where('status', '==', 'unassigned')
    .where('autoAssignmentEligibleAt', '<=', now)
    .orderBy('autoAssignmentEligibleAt', 'asc')
    .limit(SWEEP_LIMIT)
    .get();

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
      console.error(`[AutomationRetry] Failed to process task ${candidate.id}:`, error);
    }
  }

  return { scanned: snapshot.docs.length, assigned, rescheduled };
}

export function startUnassignedTaskSweeper(): NodeJS.Timeout {
  if (sweepInterval) return sweepInterval;

  const run = async () => {
    if (sweepInFlight) return;
    sweepInFlight = true;
    try {
      await sweepUnassignedAutomationTasks();
    } catch (error) {
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
