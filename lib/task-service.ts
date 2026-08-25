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

export function serializeTaskData(
  docId: string,
  data: Record<string, unknown>,
): TaskApiData {
  return {
    id: stringOrFallback(data.id, docId),
    deviceId: stringOrFallback(data.deviceId, 'unknown'),
    restroomName: nullableString(data.restroomName),
    floor: nullableString(data.floor),
    building: nullableString(data.building),
    location: nullableString(data.location),
    component: nullableString(data.component),
    shift: nullableString(data.shift),
    triggerType: triggerTypeOrManual(data.triggerType),
    message: stringOrFallback(data.message, ''),
    status: statusOrPending(data.status),
    assignedTo: nullableString(data.assignedTo),
    assignedToIds: stringArray(data.assignedToIds),
    createdAt: timestampToMillis(data.createdAt),
    assignedAt: timestampToMillis(data.assignedAt),
    acknowledgedAt: timestampToMillis(data.acknowledgedAt),
    completedAt: timestampToMillis(data.completedAt),
    acknowledgedBy: timestampMapToMillis(data.acknowledgedBy),
    completedBy: timestampMapToMillis(data.completedBy),
    submissions:
      data.submissions && typeof data.submissions === 'object'
        ? (data.submissions as Record<string, unknown>)
        : undefined,
    createdBy: stringOrFallback(data.createdBy, 'unknown'),
    beforePhotoUrl: nullableString(data.beforePhotoUrl),
    beforePhotoCapturedAt: timestampToMillis(data.beforePhotoCapturedAt),
    afterPhotoUrl: nullableString(data.afterPhotoUrl),
    afterPhotoCapturedAt: timestampToMillis(data.afterPhotoCapturedAt),
    additionalPhotos: Array.isArray(data.additionalPhotos)
      ? data.additionalPhotos
      : undefined,
    checklist:
      data.checklist && typeof data.checklist === 'object'
        ? (data.checklist as Record<string, unknown>)
        : undefined,
    remarks: typeof data.remarks === 'string' ? data.remarks : undefined,
    workDuration: typeof data.workDuration === 'number' ? data.workDuration : null,
    responseTime: typeof data.responseTime === 'number' ? data.responseTime : null,
    totalTime: typeof data.totalTime === 'number' ? data.totalTime : null,
    biometricVerified: data.biometricVerified === true,

    // QA & Supervisor Audit Fields
    inspectionStatus:
      data.inspectionStatus === 'approved' ||
      data.inspectionStatus === 'flagged' ||
      data.inspectionStatus === 'pending_review'
        ? data.inspectionStatus
        : undefined,
    inspectedBy: nullableString(data.inspectedBy),
    inspectedByName: nullableString(data.inspectedByName),
    inspectedAt: timestampToMillis(data.inspectedAt),
    flagReason: nullableString(data.flagReason),
    flagPhotoUrls: Array.isArray(data.flagPhotoUrls)
      ? data.flagPhotoUrls.filter((url): url is string => typeof url === 'string')
      : undefined,
    recheckCount: typeof data.recheckCount === 'number' ? data.recheckCount : 0,
    recheckedBy: nullableString(data.recheckedBy),
    recheckedAt: timestampToMillis(data.recheckedAt),
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

  let restroomName: string | null = null;
  let floor: string | null = null;
  let building: string = 'SDCA Annex Building';
  let location: string | null = null;

  try {
    const deviceSnap = await adminDb.collection('devices').doc(input.deviceId).get();
    if (deviceSnap.exists) {
      const devData = deviceSnap.data();
      restroomName = typeof devData?.name === 'string' ? devData.name : null;
      floor = typeof devData?.floor === 'string' ? devData.floor : null;
      building = typeof devData?.building === 'string' ? devData.building : 'SDCA Annex Building';
      location = typeof devData?.location === 'string' ? devData.location : null;
    }
  } catch (err) {
    console.warn('[task-service] Could not fetch device doc for metadata:', err);
  }

  const isAssigned = Boolean(
    (input.assignedTo && input.assignedTo.trim()) ||
    input.assignedToIds.length > 0,
  );

  const task: TaskDoc = {
    id: docRef.id,
    deviceId: input.deviceId,
    restroomName,
    floor: floor ?? 'Ground',
    building,
    location: location ?? restroomName ?? input.deviceId,
    triggerType: input.triggerType,
    message: input.message,
    status: isAssigned ? 'assigned' : 'unassigned',
    assignedTo: input.assignedTo,
    assignedToIds: input.assignedToIds,
    isBroadcast: !isAssigned,
    assignmentType: isAssigned ? 'individual' : 'broadcast',
    createdAt: now,
    assignedAt: isAssigned ? now : null,
    acknowledgedAt: null,
    completedAt: null,
    acknowledgedBy: {},
    completedBy: {},
    createdBy: input.createdBy,
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
