import type { Timestamp } from 'firebase-admin/firestore';

export const TASK_STATUSES = [
  'pending',
  'unassigned',
  'assigned',
  'acknowledged',
  'completed',
  'flagged',
  'rechecking',
  'reassignment_needed',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRIGGER_TYPES = [
  'manual',
  'uv_complete',
  'flush_count',
  'maintenance',
  'hardware_failure',
] as const;
export type TaskTriggerType = (typeof TASK_TRIGGER_TYPES)[number];

export interface TaskDoc {
  id: string;
  deviceId: string;
  restroomName?: string | null;
  floor?: string | null;
  building?: string | null;
  location?: string | null;
  component?: string | null;
  shift?: string | null;
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedToIds: string[];
  createdAt: Timestamp;
  assignedAt?: Timestamp | null;
  acknowledgedAt: Timestamp | null;
  completedAt: Timestamp | null;
  acknowledgedBy?: Record<string, Timestamp>;
  completedBy?: Record<string, Timestamp>;
  submissions?: Record<string, unknown>;
  createdBy: string;

  // QA & Supervisor Audit Fields
  inspectionStatus?: 'approved' | 'flagged' | 'pending_review';
  inspectedBy?: string | null;
  inspectedByName?: string | null;
  inspectedAt?: Timestamp | null;
  flagReason?: string | null;
  flagPhotoUrls?: string[];
  recheckCount?: number;
  recheckedBy?: string | null;
  recheckedAt?: Timestamp | null;
}

export interface TaskApiData {
  id: string;
  deviceId: string;
  restroomName?: string | null;
  floor?: string | null;
  building?: string | null;
  location?: string | null;
  component?: string | null;
  shift?: string | null;
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedToIds: string[];
  createdAt: number | null;
  assignedAt?: number | null;
  acknowledgedAt: number | null;
  completedAt: number | null;
  acknowledgedBy: Record<string, number>;
  completedBy: Record<string, number>;
  submissions?: Record<string, unknown>;
  createdBy: string;
  beforePhotoUrl?: string | null;
  beforePhotoCapturedAt?: number | null;
  afterPhotoUrl?: string | null;
  afterPhotoCapturedAt?: number | null;
  checklist?: Record<string, unknown>;
  remarks?: string;
  workDuration?: number | null;
  responseTime?: number | null;
  totalTime?: number | null;
  biometricVerified?: boolean;

  // QA & Supervisor Audit Fields
  inspectionStatus?: 'approved' | 'flagged' | 'pending_review';
  inspectedBy?: string | null;
  inspectedByName?: string | null;
  inspectedAt?: number | null;
  flagReason?: string | null;
  flagPhotoUrls?: string[];
  recheckCount?: number;
  recheckedBy?: string | null;
  recheckedAt?: number | null;
}

export interface CreateTaskInput {
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo: string | null;
  assignedToIds: string[];
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
