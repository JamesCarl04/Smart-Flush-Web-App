import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { sendTaskNotification } from './fcm';
import type {
  CreateAutomatedTaskInput,
  CreateTaskInput,
  TaskDoc,
} from './task-types';

const ACTIVE_ASSIGNMENT_STATUSES = [
  'assigned',
  'acknowledged',
  'pending',
  'rechecking',
] as const;

const ACTIVE_AUTOMATION_TASK_STATUSES = [
  ...ACTIVE_ASSIGNMENT_STATUSES,
  'unassigned',
  'reassignment_needed',
  'flagged',
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

function isActiveAutomationTaskStatus(value: unknown): boolean {
  return (ACTIVE_AUTOMATION_TASK_STATUSES as readonly string[]).includes(
    typeof value === 'string' ? value : '',
  );
}

function activeAssigneeIds(
  docs: Array<{ data: () => Record<string, unknown> }>,
): Set<string> {
  const ids = new Set<string>();

  for (const doc of docs) {
    const data = doc.data();
    if (!isActiveAssignmentStatus(data.status)) {
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
  const result = await adminDb.runTransaction(async (transaction) => {
    const now = Timestamp.now();
    const tasks = adminDb.collection('tasks');
    const users = adminDb.collection('users');
    const guardRef = adminDb
      .collection('automationTaskGuards')
      .doc(`${input.deviceId}--${input.automationTrigger}`);
    const guardSnapshot = await transaction.get(guardRef);

    if (guardSnapshot.exists) {
      const taskId = guardSnapshot.data()?.taskId;
      if (typeof taskId === 'string' && taskId) {
        const existingTaskSnapshot = await transaction.get(tasks.doc(taskId));
        const existingTask = existingTaskSnapshot.data() as TaskDoc | undefined;
        if (existingTask && isActiveAutomationTaskStatus(existingTask.status)) {
          return { task: existingTask, created: false };
        }
      }
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
      createdBy: 'system:mqtt',
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
      updatedAt: now,
    });
    if (technician) {
      transaction.update(users.doc(technician.uid), {
        lastAutoAssignedAt: now,
        currentTaskId: task.id,
        isAvailable: false,
        updatedAt: now,
      });
    }

    return { task, created: true };
  });

  if (result.created) {
    try {
      await sendTaskNotification(result.task);
    } catch (error) {
      console.error('[TaskService] FCM notification failed after task persistence:', error);
    }
  }

  return result.task;
}
