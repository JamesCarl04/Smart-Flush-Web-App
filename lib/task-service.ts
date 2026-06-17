import {
  FieldValue,
  Timestamp,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import {
  sendSupervisorEscalationNotification,
  sendTaskAssignedNotification,
  sendTaskAwarenessNotification,
  sendTimeoutWarningNotification,
} from '@/lib/fcm';
import {
  isTaskStatus,
  isTaskTriggerType,
  type CreateTaskInput,
  type Shift,
  type TaskApiData,
  type TaskChecklist,
  type TaskDoc,
  type TaskStatus,
  type TaskTriggerType,
} from '@/lib/task-types';

const DEFAULT_BUILDING = 'GB3';
const DEFAULT_FLOOR = 'Ground';
const ACK_TIMEOUT_MS =
  Number.parseInt(process.env.TASK_ACK_TIMEOUT_MS ?? '', 10) || 5 * 60 * 1000;
const MAX_REASSIGNMENTS =
  Number.parseInt(process.env.TASK_MAX_REASSIGNMENTS ?? '', 10) || 2;

export const DEFAULT_TASK_CHECKLIST: TaskChecklist = {
  removeCeilingDust: 'N/A',
  removeWallDust: 'N/A',
  removeLightBulbDust: 'N/A',
  cleanWindows: 'N/A',
  wipeDownFixtures: 'N/A',
  disinfectTouchedSurfaces: 'N/A',
  sweepAndDryFloors: 'N/A',
  emptyTrashBins: 'N/A',
  arrangeFixtures: 'N/A',
  disinfectUVLights: 'N/A',
};

interface HardwareFailurePayload {
  component?: unknown;
  deviceId?: unknown;
  errorCode?: unknown;
  consecutiveFailures?: unknown;
  timestamp?: unknown;
}

interface DeviceContext {
  deviceId: string;
  building: string;
  floor: string;
  location: string;
  supervisorUid: string | null;
}

interface MaintenanceCandidate {
  uid: string;
  name: string;
  fcmToken: string | null;
  supervisorUid: string | null;
}

interface SupervisorCandidate {
  uid: string;
  fcmToken: string | null;
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();

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
    if (typeof record.seconds === 'number') return record.seconds * 1000;
    if (typeof record._seconds === 'number') return record._seconds * 1000;
  }

  return null;
}

function timestampToSecondsBetween(
  earlier: unknown,
  later: Timestamp,
): number | null {
  const earlierMillis = timestampToMillis(earlier);
  if (earlierMillis === null) return null;
  return Math.max(0, Math.round((later.toMillis() - earlierMillis) / 1000));
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function timestampMapToMillis(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, number>
  >((result, [key, timestamp]) => {
    const millis = timestampToMillis(timestamp);
    if (millis !== null) result[key] = millis;
    return result;
  }, {});
}

function statusOrUnassigned(value: unknown): TaskStatus {
  if (value === 'pending') return 'unassigned';
  return isTaskStatus(value) ? value : 'unassigned';
}

function triggerTypeOrManual(value: unknown): TaskTriggerType {
  if (value === 'uv_complete' || value === 'flush_count') return 'maintenance';
  return isTaskTriggerType(value) ? value : 'manual';
}

function currentShift(now = new Date()): Shift {
  const hour = now.getHours();
  return hour >= 6 && hour < 14 ? '1st' : '2nd';
}

function humanizeComponent(component: string): string {
  return component
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFloor(floor: string): string {
  return /floor$/i.test(floor) ? floor : `${floor} Floor`;
}

function buildFailureMessage(component: string, context: DeviceContext): string {
  return `${humanizeComponent(component)} failure - ${context.location}, ${formatFloor(context.floor)}, ${context.building}`;
}

function cleanNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function readDeviceContext(deviceId: string): Promise<DeviceContext> {
  const snapshot = await adminDb.collection('devices').doc(deviceId).get();
  const data = snapshot.data() as Record<string, unknown> | undefined;

  return {
    deviceId,
    building: stringOrFallback(data?.building, DEFAULT_BUILDING),
    floor: stringOrFallback(data?.floor, DEFAULT_FLOOR),
    location: stringOrFallback(data?.location, stringOrFallback(data?.name, deviceId)),
    supervisorUid: nullableString(data?.supervisorUid),
  };
}

async function findSupervisor(
  building: string,
  preferredUid: string | null,
): Promise<SupervisorCandidate | null> {
  if (preferredUid) {
    const snapshot = await adminDb.collection('users').doc(preferredUid).get();
    const data = snapshot.data() as Record<string, unknown> | undefined;
    if (data?.role === 'supervisor') {
      return { uid: snapshot.id, fcmToken: nullableString(data.fcmToken) };
    }
  }

  const buildingSnap = await adminDb
    .collection('users')
    .where('role', '==', 'supervisor')
    .where('building', '==', building)
    .limit(1)
    .get();
  const doc = buildingSnap.docs[0];
  if (doc) {
    const data = doc.data() as Record<string, unknown>;
    return { uid: doc.id, fcmToken: nullableString(data.fcmToken) };
  }

  const anySnap = await adminDb
    .collection('users')
    .where('role', '==', 'supervisor')
    .limit(1)
    .get();
  const anyDoc = anySnap.docs[0];
  if (!anyDoc) return null;
  const anyData = anyDoc.data() as Record<string, unknown>;
  return { uid: anyDoc.id, fcmToken: nullableString(anyData.fcmToken) };
}

async function findAvailableMaintenance(
  building: string,
  shift: Shift,
  excludeUid?: string | null,
): Promise<MaintenanceCandidate | null> {
  const snapshot = await adminDb
    .collection('maintenancePersonnel')
    .where('isAvailable', '==', true)
    .where('shift', '==', shift)
    .where('building', '==', building)
    .orderBy('lastTaskCompletedAt', 'asc')
    .limit(10)
    .get();

  for (const doc of snapshot.docs) {
    if (doc.id === excludeUid) continue;
    const data = doc.data() as Record<string, unknown>;
    return {
      uid: doc.id,
      name: stringOrFallback(data.name, doc.id),
      fcmToken: nullableString(data.fcmToken),
      supervisorUid: nullableString(data.supervisorUid),
    };
  }

  return null;
}

function buildTaskRecord(params: {
  taskId: string;
  alertId: string | null;
  deviceId: string;
  type: 'maintenance' | 'cleaning';
  component: string;
  message: string;
  context: DeviceContext;
  shift: Shift;
  assignedTo: string | null;
  status: TaskStatus;
  createdBy: string;
  supervisorUid: string | null;
}): Record<string, unknown> {
  const assigned = params.assignedTo !== null;

  return {
    id: params.taskId,
    alertId: params.alertId,
    deviceId: params.deviceId,
    type: params.type,
    component: params.component,
    triggerType: params.type === 'cleaning' ? 'manual' : 'hardware_failure',
    message: params.message,
    location: params.context.location,
    floor: params.context.floor,
    building: params.context.building,
    shift: params.shift,
    assignedTo: params.assignedTo,
    assignedToIds: params.assignedTo ? [params.assignedTo] : [],
    status: params.status,
    createdAt: FieldValue.serverTimestamp(),
    assignedAt: assigned ? FieldValue.serverTimestamp() : null,
    acknowledgedAt: null,
    completedAt: null,
    responseTime: null,
    workDuration: null,
    totalTime: null,
    checklist: DEFAULT_TASK_CHECKLIST,
    remarks: '',
    beforePhotoUrl: null,
    beforePhotoCapturedAt: null,
    afterPhotoUrl: null,
    afterPhotoCapturedAt: null,
    biometricVerified: false,
    offlineSynced: false,
    acknowledgedBy: {},
    completedBy: null,
    completedByMap: {},
    createdBy: params.createdBy,
    reassignCount: 0,
    supervisorUid: params.supervisorUid,
  };
}

function batchAssignMaintenance(
  batch: WriteBatch,
  uid: string,
  taskId: string,
): void {
  batch.set(
    adminDb.collection('maintenancePersonnel').doc(uid),
    {
      isAvailable: false,
      currentTaskId: taskId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function batchFreeMaintenance(batch: WriteBatch, uid: string | null): void {
  if (!uid) return;
  batch.set(
    adminDb.collection('maintenancePersonnel').doc(uid),
    {
      isAvailable: true,
      currentTaskId: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function serializeTaskData(
  docId: string,
  data: Record<string, unknown>,
): TaskApiData {
  const assignedTo = nullableString(data.assignedTo);
  const completedByMap =
    typeof data.completedBy === 'object' && data.completedBy !== null
      ? timestampMapToMillis(data.completedBy)
      : timestampMapToMillis(data.completedByMap);

  return {
    id: stringOrFallback(data.id, docId),
    alertId: nullableString(data.alertId),
    deviceId: stringOrFallback(data.deviceId, 'unknown'),
    type: data.type === 'cleaning' ? 'cleaning' : 'maintenance',
    component: stringOrFallback(data.component, 'maintenance'),
    location: stringOrFallback(data.location, stringOrFallback(data.deviceName, 'Unknown CR')),
    floor: stringOrFallback(data.floor, DEFAULT_FLOOR),
    building: stringOrFallback(data.building, DEFAULT_BUILDING),
    shift: data.shift === '2nd' ? '2nd' : '1st',
    triggerType: triggerTypeOrManual(data.triggerType),
    message: stringOrFallback(data.message, ''),
    status: statusOrUnassigned(data.status),
    assignedTo,
    assignedToIds: stringArray(data.assignedToIds),
    createdAt: timestampToMillis(data.createdAt),
    assignedAt: timestampToMillis(data.assignedAt),
    acknowledgedAt: timestampToMillis(data.acknowledgedAt),
    completedAt: timestampToMillis(data.completedAt),
    responseTime: cleanNumber(data.responseTime),
    workDuration: cleanNumber(data.workDuration),
    totalTime: cleanNumber(data.totalTime),
    checklist:
      typeof data.checklist === 'object' && data.checklist !== null
        ? { ...DEFAULT_TASK_CHECKLIST, ...data.checklist }
        : DEFAULT_TASK_CHECKLIST,
    remarks: stringOrFallback(data.remarks, ''),
    beforePhotoUrl: nullableString(data.beforePhotoUrl),
    beforePhotoCapturedAt: timestampToMillis(data.beforePhotoCapturedAt),
    afterPhotoUrl: nullableString(data.afterPhotoUrl),
    afterPhotoCapturedAt: timestampToMillis(data.afterPhotoCapturedAt),
    biometricVerified: data.biometricVerified === true,
    offlineSynced: data.offlineSynced === true,
    acknowledgedBy: timestampMapToMillis(data.acknowledgedBy),
    completedBy:
      typeof data.completedBy === 'string' ? data.completedBy : null,
    completedByMap,
    createdBy: stringOrFallback(data.createdBy, 'unknown'),
    reassignCount: cleanNumber(data.reassignCount) ?? 0,
    supervisorUid: nullableString(data.supervisorUid),
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
  const context = await readDeviceContext(input.deviceId);
  const assignedTo = input.assignedTo;
  const task: TaskDoc = {
    id: docRef.id,
    alertId: null,
    deviceId: input.deviceId,
    type: input.type ?? 'cleaning',
    component: input.component ?? 'manual',
    location: input.location ?? context.location,
    floor: input.floor ?? context.floor,
    building: input.building ?? context.building,
    shift: input.shift ?? currentShift(),
    triggerType: input.triggerType ?? 'manual',
    message: input.message,
    status: assignedTo ? 'assigned' : 'unassigned',
    assignedTo,
    assignedToIds: assignedTo ? [assignedTo] : input.assignedToIds,
    createdAt: now,
    assignedAt: assignedTo ? now : null,
    acknowledgedAt: null,
    completedAt: null,
    responseTime: null,
    workDuration: null,
    totalTime: null,
    checklist: DEFAULT_TASK_CHECKLIST,
    remarks: '',
    beforePhotoUrl: null,
    beforePhotoCapturedAt: null,
    afterPhotoUrl: null,
    afterPhotoCapturedAt: null,
    biometricVerified: false,
    offlineSynced: false,
    acknowledgedBy: {},
    completedBy: null,
    completedByMap: {},
    createdBy: input.createdBy,
    reassignCount: 0,
    supervisorUid: input.supervisorUid ?? context.supervisorUid,
  };

  await docRef.set(task);
  if (assignedTo) scheduleAcknowledgmentTimeout(docRef.id);
  return task;
}

export async function createTaskAndNotify(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const task = await createTaskDocument(input);
  if (task.assignedTo) {
    await sendTaskAssignedNotification(task, task.assignedTo);
  }
  return task;
}

export async function createHardwareFailureTask(
  payload: HardwareFailurePayload,
  fallbackDeviceId: string,
): Promise<{ taskId: string; alertId: string; assignedTo: string | null }> {
  const deviceId = stringOrFallback(payload.deviceId, fallbackDeviceId);
  const component = stringOrFallback(payload.component, 'hardware');
  const context = await readDeviceContext(deviceId);
  const shift = currentShift();
  const message = buildFailureMessage(component, context);
  const alertRef = adminDb.collection('alerts').doc();
  const taskRef = adminDb.collection('tasks').doc();
  const maintenance = await findAvailableMaintenance(context.building, shift);
  const supervisor = await findSupervisor(
    context.building,
    maintenance?.supervisorUid ?? context.supervisorUid,
  );
  const supervisorUid = maintenance?.supervisorUid ?? supervisor?.uid ?? null;
  const status: TaskStatus = maintenance ? 'assigned' : 'unassigned';
  const task = buildTaskRecord({
    taskId: taskRef.id,
    alertId: alertRef.id,
    deviceId,
    type: 'maintenance',
    component,
    message,
    context,
    shift,
    assignedTo: maintenance?.uid ?? null,
    status,
    createdBy: 'system:mqtt',
    supervisorUid,
  });

  const batch = adminDb.batch();
  batch.set(alertRef, {
    id: alertRef.id,
    type: 'hardware_failure',
    component,
    errorCode: nullableString(payload.errorCode),
    consecutiveFailures: cleanNumber(payload.consecutiveFailures),
    message,
    severity: 'high',
    acknowledged: false,
    deviceId,
    taskId: taskRef.id,
    timestamp: FieldValue.serverTimestamp(),
  });
  batch.set(taskRef, task);
  if (maintenance) batchAssignMaintenance(batch, maintenance.uid, taskRef.id);
  await batch.commit();

  const taskDoc = serializeTaskData(taskRef.id, {
    ...task,
    createdAt: Timestamp.now(),
    assignedAt: maintenance ? Timestamp.now() : null,
  });

  if (maintenance) {
    await sendTaskAssignedNotification(taskDoc, maintenance.uid);
    if (supervisorUid) {
      await sendTaskAwarenessNotification(taskDoc, supervisorUid);
    }
    scheduleAcknowledgmentTimeout(taskRef.id);
  } else if (supervisorUid) {
    await sendSupervisorEscalationNotification(taskDoc, supervisorUid);
  }

  return {
    taskId: taskRef.id,
    alertId: alertRef.id,
    assignedTo: maintenance?.uid ?? null,
  };
}

export async function manualReassignTask(params: {
  taskId: string;
  newAssigneeUid: string;
  reason: string;
  supervisorUid: string;
}): Promise<void> {
  const taskRef = adminDb.collection('tasks').doc(params.taskId);
  const taskSnapshot = await taskRef.get();
  if (!taskSnapshot.exists) {
    throw new Error('Task not found');
  }

  const task = serializeTaskData(
    taskSnapshot.id,
    taskSnapshot.data() as Record<string, unknown>,
  );
  if (task.status === 'completed') {
    throw new Error('Completed tasks cannot be reassigned');
  }

  const batch = adminDb.batch();
  batchFreeMaintenance(batch, task.assignedTo);
  batchAssignMaintenance(batch, params.newAssigneeUid, params.taskId);
  batch.update(taskRef, {
    assignedTo: params.newAssigneeUid,
    assignedToIds: [params.newAssigneeUid],
    status: 'assigned',
    assignedAt: FieldValue.serverTimestamp(),
    acknowledgedAt: null,
    completedAt: null,
    responseTime: null,
    workDuration: null,
    totalTime: null,
    reassignCount: FieldValue.increment(1),
    supervisorUid: params.supervisorUid,
  });
  batch.set(adminDb.collection('supervisorActions').doc(), {
    supervisorUid: params.supervisorUid,
    action: 'manual_reassign',
    taskId: params.taskId,
    previousAssignee: task.assignedTo,
    newAssignee: params.newAssigneeUid,
    reason: params.reason,
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await sendTaskAssignedNotification(
    { ...task, assignedTo: params.newAssigneeUid, status: 'assigned' },
    params.newAssigneeUid,
  );
  scheduleAcknowledgmentTimeout(params.taskId);
}

export async function flagTaskForReinspection(params: {
  taskId: string;
  reason: string;
  supervisorUid: string;
}): Promise<void> {
  const taskRef = adminDb.collection('tasks').doc(params.taskId);
  const snapshot = await taskRef.get();
  if (!snapshot.exists) throw new Error('Task not found');

  const task = serializeTaskData(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  if (!task.assignedTo) throw new Error('Task has no assigned maintenance person');

  await taskRef.update({
    status: 'flagged',
    remarks: params.reason,
    supervisorUid: params.supervisorUid,
  });
  await adminDb.collection('supervisorActions').doc().set({
    supervisorUid: params.supervisorUid,
    action: 'flag_task',
    taskId: params.taskId,
    previousAssignee: task.assignedTo,
    newAssignee: task.assignedTo,
    reason: params.reason,
    timestamp: FieldValue.serverTimestamp(),
  });
  await sendTaskAssignedNotification(
    { ...task, status: 'flagged', message: `Task flagged for re-inspection: ${params.reason}` },
    task.assignedTo,
  );
}

export async function acknowledgeTask(
  taskId: string,
  maintenanceUid: string,
): Promise<void> {
  const taskRef = adminDb.collection('tasks').doc(taskId);
  const snapshot = await taskRef.get();
  if (!snapshot.exists) throw new Error('Task not found');

  const data = snapshot.data() as Record<string, unknown>;
  const task = serializeTaskData(snapshot.id, data);
  if (task.assignedTo !== maintenanceUid) {
    throw new Error('Forbidden');
  }

  const now = Timestamp.now();
  const responseTime = timestampToSecondsBetween(data.assignedAt, now);
  await taskRef.update({
    status: 'acknowledged',
    acknowledgedAt: now,
    responseTime,
    [`acknowledgedBy.${maintenanceUid}`]: now,
  });
}

async function updateMaintenanceAverages(uid: string): Promise<void> {
  const completedSnap = await adminDb
    .collection('tasks')
    .where('assignedTo', '==', uid)
    .where('status', '==', 'completed')
    .get();

  let responseTotal = 0;
  let responseCount = 0;
  let workTotal = 0;
  let workCount = 0;
  let totalTasksToday = 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMillis = startOfDay.getTime();

  for (const doc of completedSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const responseTime = cleanNumber(data.responseTime);
    const workDuration = cleanNumber(data.workDuration);
    const completedMillis = timestampToMillis(data.completedAt);
    if (responseTime !== null) {
      responseTotal += responseTime;
      responseCount += 1;
    }
    if (workDuration !== null) {
      workTotal += workDuration;
      workCount += 1;
    }
    if (completedMillis !== null && completedMillis >= startMillis) {
      totalTasksToday += 1;
    }
  }

  await adminDb.collection('maintenancePersonnel').doc(uid).set(
    {
      isAvailable: true,
      currentTaskId: null,
      lastTaskCompletedAt: FieldValue.serverTimestamp(),
      totalTasksToday,
      averageResponseTime:
        responseCount > 0 ? Math.round(responseTotal / responseCount) : 0,
      averageWorkDuration:
        workCount > 0 ? Math.round(workTotal / workCount) : 0,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function completeTask(
  taskId: string,
  maintenanceUid: string,
): Promise<void> {
  const taskRef = adminDb.collection('tasks').doc(taskId);
  const snapshot = await taskRef.get();
  if (!snapshot.exists) throw new Error('Task not found');

  const data = snapshot.data() as Record<string, unknown>;
  const task = serializeTaskData(snapshot.id, data);
  if (task.assignedTo !== maintenanceUid) {
    throw new Error('Forbidden');
  }

  const now = Timestamp.now();
  const workDuration = timestampToSecondsBetween(data.acknowledgedAt, now);
  const totalTime = timestampToSecondsBetween(data.createdAt, now);
  await taskRef.update({
    status: 'completed',
    completedAt: now,
    workDuration,
    totalTime,
    completedBy: maintenanceUid,
    [`completedByMap.${maintenanceUid}`]: now,
  });
  await updateMaintenanceAverages(maintenanceUid);
}

export function scheduleAcknowledgmentTimeout(taskId: string): void {
  setTimeout(() => {
    void handleAcknowledgmentTimeout(taskId).catch((error) => {
      console.error('[Tasks] acknowledgment timeout error:', error);
    });
  }, ACK_TIMEOUT_MS);
}

export async function handleAcknowledgmentTimeout(taskId: string): Promise<void> {
  const taskRef = adminDb.collection('tasks').doc(taskId);
  const snapshot = await taskRef.get();
  if (!snapshot.exists) return;

  const data = snapshot.data() as Record<string, unknown>;
  const task = serializeTaskData(snapshot.id, data);
  if (task.status !== 'assigned' || task.acknowledgedAt !== null) return;

  const supervisor = await findSupervisor(task.building, task.supervisorUid);
  const previousAssignee = task.assignedTo;

  if (task.reassignCount >= MAX_REASSIGNMENTS) {
    await taskRef.update({
      status: 'reassignment_needed',
      supervisorUid: supervisor?.uid ?? task.supervisorUid,
    });
    if (supervisor) {
      await sendSupervisorEscalationNotification(
        { ...task, status: 'reassignment_needed' },
        supervisor.uid,
      );
    }
    return;
  }

  const next = await findAvailableMaintenance(
    task.building,
    task.shift,
    previousAssignee,
  );

  if (!next) {
    await taskRef.update({
      status: 'reassignment_needed',
      supervisorUid: supervisor?.uid ?? task.supervisorUid,
    });
    if (supervisor) {
      await sendSupervisorEscalationNotification(
        { ...task, status: 'reassignment_needed' },
        supervisor.uid,
      );
    }
    return;
  }

  const batch = adminDb.batch();
  batchFreeMaintenance(batch, previousAssignee);
  batchAssignMaintenance(batch, next.uid, taskId);
  batch.update(taskRef, {
    assignedTo: next.uid,
    assignedToIds: [next.uid],
    status: 'assigned',
    assignedAt: FieldValue.serverTimestamp(),
    acknowledgedAt: null,
    responseTime: null,
    reassignCount: FieldValue.increment(1),
    supervisorUid: next.supervisorUid ?? supervisor?.uid ?? task.supervisorUid,
  });
  await batch.commit();

  if (supervisor) {
    await sendTimeoutWarningNotification(task, supervisor.uid, next.name);
  }
  await sendTaskAssignedNotification(
    { ...task, assignedTo: next.uid, status: 'assigned' },
    next.uid,
  );
  scheduleAcknowledgmentTimeout(taskId);
}
