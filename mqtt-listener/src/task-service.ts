import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  sendSupervisorEscalationNotification,
  sendTaskAssignedNotification,
  sendTaskAwarenessNotification,
} from './fcm';
import type {
  CreateTaskInput,
  Shift,
  TaskChecklist,
  TaskDoc,
  TaskStatus,
} from './task-types';

const DEFAULT_BUILDING = 'GB3';
const DEFAULT_FLOOR = 'Ground';

const DEFAULT_TASK_CHECKLIST: TaskChecklist = {
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
  supervisorUid: string | null;
}

interface SupervisorCandidate {
  uid: string;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    if (snapshot.data()?.role === 'supervisor') {
      return { uid: snapshot.id };
    }
  }

  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'supervisor')
    .where('building', '==', building)
    .limit(1)
    .get();
  const doc = snapshot.docs[0];
  if (doc) return { uid: doc.id };

  const fallback = await adminDb
    .collection('users')
    .where('role', '==', 'supervisor')
    .limit(1)
    .get();
  const fallbackDoc = fallback.docs[0];
  return fallbackDoc ? { uid: fallbackDoc.id } : null;
}

async function findAvailableMaintenance(
  building: string,
  shift: Shift,
): Promise<MaintenanceCandidate | null> {
  const snapshot = await adminDb
    .collection('maintenancePersonnel')
    .where('isAvailable', '==', true)
    .where('shift', '==', shift)
    .where('building', '==', building)
    .orderBy('lastTaskCompletedAt', 'asc')
    .limit(1)
    .get();
  const doc = snapshot.docs[0];
  if (!doc) return null;
  const data = doc.data() as Record<string, unknown>;
  return { uid: doc.id, supervisorUid: nullableString(data.supervisorUid) };
}

function buildTask(params: {
  taskId: string;
  alertId: string | null;
  deviceId: string;
  component: string;
  message: string;
  context: DeviceContext;
  shift: Shift;
  assignedTo: string | null;
  status: TaskStatus;
  createdBy: string;
  supervisorUid: string | null;
}): TaskDoc {
  const now = Timestamp.now();
  return {
    id: params.taskId,
    alertId: params.alertId,
    deviceId: params.deviceId,
    type: 'maintenance',
    component: params.component,
    location: params.context.location,
    floor: params.context.floor,
    building: params.context.building,
    shift: params.shift,
    triggerType: 'hardware_failure',
    message: params.message,
    status: params.status,
    assignedTo: params.assignedTo,
    assignedToIds: params.assignedTo ? [params.assignedTo] : [],
    createdAt: now,
    assignedAt: params.assignedTo ? now : null,
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

export async function createTaskDocument(
  input: CreateTaskInput,
): Promise<TaskDoc> {
  const docRef = adminDb.collection('tasks').doc();
  const context = await readDeviceContext(input.deviceId);
  const task = buildTask({
    taskId: docRef.id,
    alertId: null,
    deviceId: input.deviceId,
    component: input.component ?? 'manual',
    message: input.message,
    context,
    shift: currentShift(),
    assignedTo: input.assignedTo,
    status: input.assignedTo ? 'assigned' : 'unassigned',
    createdBy: input.createdBy,
    supervisorUid: context.supervisorUid,
  });
  await docRef.set(task);
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
): Promise<void> {
  const deviceId = stringOrFallback(payload.deviceId, fallbackDeviceId);
  const component = stringOrFallback(payload.component, 'hardware');
  const context = await readDeviceContext(deviceId);
  const shift = currentShift();
  const maintenance = await findAvailableMaintenance(context.building, shift);
  const supervisor = await findSupervisor(
    context.building,
    maintenance?.supervisorUid ?? context.supervisorUid,
  );
  const alertRef = adminDb.collection('alerts').doc();
  const taskRef = adminDb.collection('tasks').doc();
  const message = `${humanizeComponent(component)} failure - ${context.location}, ${formatFloor(context.floor)}, ${context.building}`;
  const task = buildTask({
    taskId: taskRef.id,
    alertId: alertRef.id,
    deviceId,
    component,
    message,
    context,
    shift,
    assignedTo: maintenance?.uid ?? null,
    status: maintenance ? 'assigned' : 'unassigned',
    createdBy: 'system:mqtt',
    supervisorUid: maintenance?.supervisorUid ?? supervisor?.uid ?? null,
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
  batch.set(taskRef, {
    ...task,
    createdAt: FieldValue.serverTimestamp(),
    assignedAt: maintenance ? FieldValue.serverTimestamp() : null,
  });
  if (maintenance) {
    batch.set(
      adminDb.collection('maintenancePersonnel').doc(maintenance.uid),
      {
        isAvailable: false,
        currentTaskId: taskRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();

  if (maintenance) {
    await sendTaskAssignedNotification(task, maintenance.uid);
    if (task.supervisorUid) {
      await sendTaskAwarenessNotification(task, task.supervisorUid);
    }
  } else if (task.supervisorUid) {
    await sendSupervisorEscalationNotification(task, task.supervisorUid);
  }
}
