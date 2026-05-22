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
  acknowledgedBy?: Record<string, Timestamp>;
  completedBy?: Record<string, Timestamp>;
  createdBy: string;
}

export interface TaskApiData {
  id: string;
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  createdAt: number | null;
  acknowledgedAt: number | null;
  completedAt: number | null;
  acknowledgedBy: Record<string, number>;
  completedBy: Record<string, number>;
  createdBy: string;
}

export interface CreateTaskInput {
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo: string | null;
  createdBy: string;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

export function isTaskTriggerType(value: unknown): value is TaskTriggerType {
  return (
    typeof value === 'string' &&
    (TASK_TRIGGER_TYPES as readonly string[]).includes(value)
  );
}
