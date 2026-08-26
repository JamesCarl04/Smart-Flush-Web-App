import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { sendTaskNotification } from './fcm';
import type {
  CreateAutomatedTaskInput,
  CreateTaskInput,
  TaskDoc,
} from './task-types';
import { normalizeRepeatIntervalMinutes, planThresholdDispatch } from './automation-policy';

const ACTIVE_ASSIGNMENT_STATUSES = [
  'unassigned',
  'assigned',
  'acknowledged',
  'pending',
  'rechecking',
  'flagged',
  'reassignment_needed',
] as const;

const AUTOMATION_RETRY_MS = readPositiveIntEnv(
  'AUTOMATION_UNASSIGNED_RETRY_MS',
  60_000,
);

export interface AvailableMaintenancePersonnel {
  uid: string;
  lastAutoAssignedAt: number | null;
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

function isActiveAssignmentStatus(value: unknown): boolean {
  return (ACTIVE_ASSIGNMENT_STATUSES as readonly string[]).includes(
    typeof value === 'string' ? value : '',
  );
}

function activeAssigneeIds(
  docs: Array<{ data: () => Record<string, unknown> }>,
): Set<string> {
  const ids = new Set<string>();

  for (const doc of docs) {
    const data = doc.data();
    if (!isActiveAssignmentStatus(data.status) || timestampToMillis(data.completedAt) !== null) {
      continue;
    }

    if (typeof data.assignedTo === 'string' && data.assignedTo.trim()) {
      ids.add(data.assignedTo.trim());
    }
    if (Array.isArray(data.assignedToIds)) {
      for (const uid of data.assignedToIds) {
        if (typeof uid === 'string' && uid.trim()) {
          ids.add(uid.trim());
        }
      }
    }
  }

  return ids;
}

export function chooseAvailableMaintenancePersonnel(
  users: Array<{ id: string; data: () => Record<string, unknown> }>,
  activeTaskDocs: Array<{ data: () => Record<string, unknown> }>,
): AvailableMaintenancePersonnel[] {
  const busyUids = activeAssigneeIds(activeTaskDocs);

  return users
    .filter((user) => {
      const data = user.data();
      return (
        data.isOnline !== false &&
        data.isActive !== false &&
        data.isAvailable !== false &&
        data.status !== 'offline' &&
        data.status !== 'inactive' &&
        !busyUids.has(user.id)
      );
    })
    .map((user) => ({
      uid: user.id,
      lastAutoAssignedAt: timestampToMillis(user.data().lastAutoAssignedAt),
    }))
    .sort(
      (left, right) =>
        (left.lastAutoAssignedAt ?? 0) - (right.lastAutoAssignedAt ?? 0) ||
        left.uid.localeCompare(right.uid),
    );
}

export async function findAvailableMaintenancePersonnel(): Promise<
  AvailableMaintenancePersonnel[]
> {
  const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
    adminDb.collection('users').where('role', '==', 'maintenance').get(),
    adminDb
      .collection('tasks')
      .where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES)
      .get(),
  ]);

  return chooseAvailableMaintenancePersonnel(
    usersSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
    activeTasksSnapshot.docs as Array<{ data: () => Record<string, unknown> }>,
  );
}

export async function createTaskDocument(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const docRef = adminDb.collection('tasks').doc();
  const now = Timestamp.now();
  const task: TaskDoc = {
    id: docRef.id,
    deviceId: input.deviceId,
    triggerType: input.triggerType,
    message: input.message,
    status: input.assignedTo ? 'assigned' : 'unassigned',
    assignedTo: input.assignedTo?.trim() || null,
    assignedToIds: input.assignedTo?.trim()
      ? [input.assignedTo.trim()]
      : input.assignedToIds ?? [],
    isBroadcast: false,
    createdAt: now,
    updatedAt: now,
    assignedAt: input.assignedTo ? now : null,
    acknowledgedAt: null,
    completedAt: null,
    createdBy: input.createdBy,
    taskOrigin: input.taskOrigin ?? 'manual',
  };

  await docRef.set(task);
  return task;
}

export async function createTaskAndNotify(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const task = await createTaskDocument(input);
  try {
    await sendTaskNotification(task);
  } catch (error) {
    console.error('[TaskService] FCM notification failed after task persistence:', error);
  }
  return task;
}

/**
 * Creates a telemetry-driven task and its assignment in one Firestore
 * transaction. The stable guard document prevents concurrent duplicate work for
 * the same device/automation trigger pair.
 */
export async function createAutomatedTaskAndNotify(
  input: CreateAutomatedTaskInput,
): Promise<TaskDoc> {
  const result = await dispatchAutomatedTaskAndNotify(input);
  if (!result.task) throw new Error('Automation event persisted for later dispatch');
  return result.task;
}

export interface AutomatedDispatchResult {
  outcome: 'created' | 'merged' | 'pending';
  task?: TaskDoc;
}

export async function dispatchAutomatedTaskAndNotify(
  input: CreateAutomatedTaskInput,
): Promise<AutomatedDispatchResult> {
  const result = await adminDb.runTransaction(async (transaction): Promise<AutomatedDispatchResult> => {
    const now = Timestamp.now();
    const tasks = adminDb.collection('tasks');
    const users = adminDb.collection('users');
    const guardRef = adminDb
      .collection('automationTaskGuards')
      .doc(`${input.deviceId}--${input.automationTrigger}`);
    const guardSnapshot = await transaction.get(guardRef);

    let guardedTask: TaskDoc | undefined;
    if (guardSnapshot.exists) {
      const taskId = guardSnapshot.data()?.taskId;
      if (typeof taskId === 'string' && taskId) {
        const existingTaskSnapshot = await transaction.get(tasks.doc(taskId));
        guardedTask = existingTaskSnapshot.data() as TaskDoc | undefined;
      }
    }

    const guardData = typeof guardSnapshot.data === 'function' ? guardSnapshot.data() ?? {} : {};
    const plan = planThresholdDispatch({
      nowMs: now.toMillis(),
      nextEligibleAtMs: timestampToMillis(guardData.nextEligibleAt),
      guardedTask: guardedTask ? {
        id: guardedTask.id,
        status: guardedTask.status,
        completedAtMs: timestampToMillis(guardedTask.completedAt),
      } : null,
    });
    const resetCounter = input.automationTrigger === 'maintenance_due'
      ? { routineCycleCount: 0 }
      : input.automationTrigger === 'no_water_after_flush'
        ? { noWaterConsecutiveCycles: 0, pendingWaterCheck: false, noWaterDueAt: null }
        : {};
    const stateRef = Object.keys(resetCounter).length > 0 ? automationStateRef(input) : null;
    if (stateRef) await transaction.get(stateRef);

    if (plan.kind === 'merge' && guardedTask) {
      const taskRef = tasks.doc(guardedTask.id);
      const occurrenceCount = Number.isFinite((guardedTask as TaskDoc & { occurrenceCount?: number }).occurrenceCount)
        ? Number((guardedTask as TaskDoc & { occurrenceCount?: number }).occurrenceCount) + 1
        : 2;
      transaction.update(taskRef, { occurrenceCount, latestOccurrenceAt: now, updatedAt: now });
      transaction.set(guardRef, { pending: false, pendingAt: null, pendingCycleCount: null, updatedAt: now }, { merge: true });
      if (stateRef) transaction.set(stateRef, resetCounter, { merge: true });
      return { outcome: 'merged', task: { ...guardedTask, occurrenceCount, latestOccurrenceAt: now } as TaskDoc };
    }

    if (plan.kind === 'pending') {
      transaction.set(guardRef, {
        deviceId: input.deviceId,
        automationTrigger: input.automationTrigger,
        automationRuleId: input.automationRuleId,
        pending: true,
        pendingAt: now,
        pendingCycleCount: input.cycleCountAtTrigger ?? null,
        nextEligibleAt: Timestamp.fromMillis(plan.eligibleAtMs),
        updatedAt: now,
      }, { merge: true });
      if (stateRef) transaction.set(stateRef, resetCounter, { merge: true });
      return { outcome: 'pending' };
    }

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      transaction.get(users.where('role', '==', 'maintenance')),
      transaction.get(
        tasks.where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES),
      ),
    ]);
    const technician = chooseAvailableMaintenancePersonnel(
      usersSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
      activeTasksSnapshot.docs as Array<{ data: () => Record<string, unknown> }>,
    )[0];
    const taskRef = tasks.doc();
    const assigned = technician !== undefined;
    const task: TaskDoc = {
      id: taskRef.id,
      deviceId: input.deviceId,
      triggerType: input.triggerType,
      message: input.message,
      status: assigned ? 'assigned' : 'unassigned',
      assignedTo: technician?.uid ?? null,
      assignedToIds: technician ? [technician.uid] : [],
      isBroadcast: false,
      ...(assigned ? { assignmentType: 'individual' as const } : {}),
      createdAt: now,
      updatedAt: now,
      assignedAt: assigned ? now : null,
      acknowledgedAt: null,
      completedAt: null,
      occurrenceCount: 1,
      latestOccurrenceAt: now,
      createdBy: 'system:mqtt',
      taskOrigin: 'automation',
      automationRuleId: input.automationRuleId,
      automationTrigger: input.automationTrigger,
      requiresSupervisorAssignment: !assigned,
      assignmentSource: input.assignmentSource ?? 'initial_auto',
      autoAssignmentEligibleAt: assigned
        ? null
        : Timestamp.fromMillis(now.toMillis() + AUTOMATION_RETRY_MS),
      ...(typeof input.cycleCountAtTrigger === 'number'
        ? { cycleCountAtTrigger: input.cycleCountAtTrigger }
        : {}),
    };

    transaction.set(taskRef, task);
    transaction.set(guardRef, {
      taskId: task.id,
      deviceId: input.deviceId,
      automationTrigger: input.automationTrigger,
      automationRuleId: input.automationRuleId,
      pending: false,
      pendingAt: null,
      pendingCycleCount: null,
      lastDispatchAt: now,
      nextEligibleAt: Timestamp.fromMillis(
        now.toMillis() + normalizeRepeatIntervalMinutes(input.repeatIntervalMinutes) * 60_000,
      ),
      updatedAt: now,
    });
    if (stateRef) transaction.set(stateRef, resetCounter, { merge: true });
    if (technician) {
      transaction.update(users.doc(technician.uid), {
        lastAutoAssignedAt: now,
        currentTaskId: task.id,
        isAvailable: false,
        updatedAt: now,
      });
    }

    return { task, outcome: 'created' };
  });

  if (result.outcome === 'created' && result.task) {
    try {
      await sendTaskNotification(result.task);
    } catch (error) {
      console.error('[TaskService] FCM notification failed after task persistence:', error);
    }
  }

  return result;
}

function automationStateRef(input: CreateAutomatedTaskInput) {
  return adminDb.collection('devices').doc(input.deviceId).collection('automationState').doc(
    input.automationTrigger === 'no_water_after_flush' ? 'waterNoFlow' : 'runtime',
  );
}
