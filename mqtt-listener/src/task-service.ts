import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { sendTaskNotification } from './fcm';
import type { CreateTaskInput, TaskDoc } from './task-types';

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
    status: 'pending',
    assignedTo: input.assignedTo,
    createdAt: now,
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
  await sendTaskNotification(task, task.assignedTo);
  return task;
}
