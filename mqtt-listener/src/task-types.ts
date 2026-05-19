import type { Timestamp } from 'firebase-admin/firestore';

export const TASK_STATUSES = ['pending', 'acknowledged', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRIGGER_TYPES = [
  'manual',
  'uv_complete',
  'flush_count',
  'maintenance',
] as const;
export type TaskTriggerType = (typeof TASK_TRIGGER_TYPES)[number];

export interface TaskDoc {
  id: string;
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  createdAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdBy: string;
}

export interface CreateTaskInput {
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo: string | null;
  createdBy: string;
}
