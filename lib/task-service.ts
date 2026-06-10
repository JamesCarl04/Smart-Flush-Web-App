import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendTaskNotification } from '@/lib/fcm';
import {
  isTaskStatus,
  isTaskTriggerType,
  type CreateTaskInput,
  type TaskApiData,
  type TaskDoc,
  type TaskStatus,
  type TaskTriggerType,
} from '@/lib/task-types';

function timestampToMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    return value.toMillis();
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as { seconds?: unknown; _seconds?: unknown };
    if (typeof record.seconds === 'number') {
      return record.seconds * 1000;
    }

    if (typeof record._seconds === 'number') {
      return record._seconds * 1000;
    }
  }

  return null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
}

function timestampMapToMillis(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, number>
  >((result, [key, timestamp]) => {
    const millis = timestampToMillis(timestamp);
    if (millis !== null) {
      result[key] = millis;
    }
    return result;
  }, {});
}

function statusOrPending(value: unknown): TaskStatus {
  return isTaskStatus(value) ? value : 'pending';
}

function triggerTypeOrManual(value: unknown): TaskTriggerType {
  return isTaskTriggerType(value) ? value : 'manual';
}

function parseChecklist(value: unknown): Record<string, boolean> | string[] | null {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = Boolean(val);
    }
    return result;
  }
  return null;
}

export function serializeTaskData(
  docId: string,
  data: Record<string, unknown>,
): TaskApiData {
  return {
    id: stringOrFallback(data.id, docId),
    deviceId: stringOrFallback(data.deviceId, 'unknown'),
    triggerType: triggerTypeOrManual(data.triggerType),
    message: stringOrFallback(data.message, ''),
    status: statusOrPending(data.status),
    assignedTo: nullableString(data.assignedTo),
    assignedToIds: stringArray(data.assignedToIds),
    createdAt: timestampToMillis(data.createdAt),
    acknowledgedAt: timestampToMillis(data.acknowledgedAt),
    completedAt: timestampToMillis(data.completedAt),
    acknowledgedBy: timestampMapToMillis(data.acknowledgedBy),
    completedBy: timestampMapToMillis(data.completedBy),
    createdBy: stringOrFallback(data.createdBy, 'unknown'),
    photos: stringArray(data.photos),
    component: nullableString(data.component),
    location: nullableString(data.location),
    floor: nullableString(data.floor),
    building: nullableString(data.building),
    shift: nullableString(data.shift),
    remarks: nullableString(data.remarks),
    flagged: typeof data.flagged === 'boolean' ? data.flagged : false,
    biometricVerified: typeof data.biometricVerified === 'boolean' ? data.biometricVerified : false,
    offlineSynced: typeof data.offlineSynced === 'boolean' ? data.offlineSynced : false,
    checklist: parseChecklist(data.checklist),
    assignedAt: timestampToMillis(data.assignedAt),
  };
}

export function serializeTaskSnapshot(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): TaskApiData {
  return serializeTaskData(doc.id, doc.data() as Record<string, unknown>);
}

export async function createTaskDocument(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const docRef = adminDb.collection('tasks').doc();
  const now = Timestamp.now();
  const hasAssignee = input.assignedTo != null || (input.assignedToIds && input.assignedToIds.length > 0);
  const task: TaskDoc = {
    id: docRef.id,
    deviceId: input.deviceId,
    triggerType: input.triggerType,
    message: input.message,
    status: 'pending',
    assignedTo: input.assignedTo,
    assignedToIds: input.assignedToIds,
    createdAt: now,
    acknowledgedAt: null,
    completedAt: null,
    acknowledgedBy: {},
    completedBy: {},
    createdBy: input.createdBy,
    photos: input.photos,
    component: input.component ?? null,
    location: input.location ?? null,
    floor: input.floor ?? null,
    building: input.building ?? null,
    shift: input.shift ?? null,
    remarks: input.remarks ?? null,
    flagged: input.flagged ?? false,
    biometricVerified: input.biometricVerified ?? false,
    offlineSynced: input.offlineSynced ?? false,
    checklist: input.checklist ?? null,
    assignedAt: input.assignedAt ?? (hasAssignee ? now : null),
  };

  await docRef.set(task);
  return task;
}

export async function createTaskAndNotify(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const task = await createTaskDocument(input);
  await sendTaskNotification(task, task.assignedTo, task.assignedToIds);
  return task;
}
