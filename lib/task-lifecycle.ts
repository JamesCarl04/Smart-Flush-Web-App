import { adminDb } from '@/lib/firebase-admin';

const UNFINISHED_STATUSES = [
  'pending', 'unassigned', 'assigned', 'acknowledged', 'flagged', 'rechecking', 'reassignment_needed',
] as const;

interface TimestampLike { toMillis(): number }

export interface LifecycleTask {
  id?: string;
  status?: unknown;
  assignedTo?: unknown;
  assignedToIds?: unknown;
  completedAt?: TimestampLike | null;
}

export function isUnfinishedTask(task: LifecycleTask): boolean {
  return task.completedAt == null && typeof task.status === 'string' && (UNFINISHED_STATUSES as readonly string[]).includes(task.status);
}

function isAssigned(task: LifecycleTask, uid: string): boolean {
  return task.assignedTo === uid || (Array.isArray(task.assignedToIds) && task.assignedToIds.includes(uid));
}

export function technicianAvailabilityAfterRelease(
  uid: string,
  releasedTaskId: string,
  tasks: LifecycleTask[],
): { currentTaskId: string | null; isAvailable: boolean } {
  const remaining = tasks.find((task) => task.id !== releasedTaskId && isUnfinishedTask(task) && isAssigned(task, uid));
  return remaining?.id
    ? { currentTaskId: remaining.id, isAvailable: false }
    : { currentTaskId: null, isAvailable: true };
}

export function shouldClearAutomationGuard(
  taskId: string,
  guard: { taskId?: unknown } | undefined,
): boolean {
  return guard?.taskId === taskId;
}

export async function syncTechnicianAfterTaskRelease(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  releasedTaskId: string,
  now: unknown,
): Promise<void> {
  await syncTechniciansAfterTaskRelease(transaction, [uid], releasedTaskId, now);
}

export async function syncTechniciansAfterTaskRelease(
  transaction: FirebaseFirestore.Transaction,
  uids: Iterable<string>,
  releasedTaskId: string,
  now: unknown,
): Promise<void> {
  const uniqueUids = new Set(uids);
  if (uniqueUids.size === 0) return;
  const tasks = await transaction.get(adminDb.collection('tasks').where('status', 'in', UNFINISHED_STATUSES));
  const lifecycleTasks = tasks.docs.map((doc) => ({ id: doc.id, ...(doc.data() as LifecycleTask) }));
  for (const uid of uniqueUids) {
    const next = technicianAvailabilityAfterRelease(uid, releasedTaskId, lifecycleTasks);
    transaction.set(adminDb.collection('users').doc(uid), { ...next, updatedAt: now }, { merge: true });
  }
}
