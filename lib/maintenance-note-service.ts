import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendTaskNotification } from '@/lib/fcm';
import type {
  CreateMaintenanceNoteInput,
  MaintenanceNoteApiData,
  MaintenanceNoteDoc,
} from '@/lib/maintenance-note-types';
import type { TaskDoc } from '@/lib/task-types';

function timestampToMillis(value: unknown): number | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    return value.toMillis();
  }

  return null;
}

export function serializeMaintenanceNote(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): MaintenanceNoteApiData {
  const data = doc.data() as Partial<MaintenanceNoteDoc>;

  return {
    id: typeof data.id === 'string' ? data.id : doc.id,
    restroomId:
      typeof data.restroomId === 'string' ? data.restroomId : 'unknown',
    message: typeof data.message === 'string' ? data.message : '',
    taskId: typeof data.taskId === 'string' ? data.taskId : '',
    assignedTo:
      typeof data.assignedTo === 'string' && data.assignedTo.trim()
        ? data.assignedTo
        : null,
    status: data.status === 'failed' ? 'failed' : 'sent',
    source: 'web_dashboard',
    createdAt: timestampToMillis(data.createdAt),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'unknown',
  };
}

export async function createMaintenanceNoteAndNotify(
  input: CreateMaintenanceNoteInput,
): Promise<{ note: MaintenanceNoteDoc; task: TaskDoc }> {
  const taskRef = adminDb.collection('tasks').doc();
  const noteRef = adminDb.collection('maintenanceNotes').doc();
  const now = Timestamp.now();

  const task: TaskDoc = {
    id: taskRef.id,
    deviceId: input.restroomId,
    triggerType: 'manual',
    message: input.message,
    status: 'pending',
    assignedTo: input.assignedTo,
    createdAt: now,
    acknowledgedAt: null,
    completedAt: null,
    createdBy: input.createdBy,
  };

  const note: MaintenanceNoteDoc = {
    id: noteRef.id,
    restroomId: input.restroomId,
    message: input.message,
    taskId: task.id,
    assignedTo: input.assignedTo,
    status: 'sent',
    source: 'web_dashboard',
    createdAt: now,
    createdBy: input.createdBy,
  };

  const batch = adminDb.batch();
  batch.set(taskRef, task);
  batch.set(noteRef, note);
  await batch.commit();

  await sendTaskNotification(task, task.assignedTo);

  return { note, task };
}
