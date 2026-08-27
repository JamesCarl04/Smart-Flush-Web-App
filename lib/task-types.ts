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
  'sensor_fault',
  'water_overuse',
  'water_no_flow',
  'student_report',
] as const;
export type TaskTriggerType = (typeof TASK_TRIGGER_TYPES)[number];

export const AUTOMATION_TRIGGERS = [
  'ultrasonic_sensor_fault',
  'water_overuse',
  'no_water_after_flush',
  'maintenance_due',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AssignmentSource = 'initial_auto' | 'supervisor' | 'retry_auto';
export type TaskOrigin = 'automation' | 'manual' | 'public_report';

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
  isBroadcast?: boolean;
  assignmentType?: 'broadcast' | 'individual' | 'team';
  automationRuleId?: string;
  automationTrigger?: AutomationTrigger;
  assignmentSource?: AssignmentSource;
  requiresSupervisorAssignment?: boolean;
  autoAssignmentEligibleAt?: Timestamp | null;
  cycleCountAtTrigger?: number;
  occurrenceCount?: number;
  latestOccurrenceAt?: Timestamp | null;
  taskOrigin?: TaskOrigin;
  issueReportId?: string;
  reportCategory?: string;
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
  isBroadcast?: boolean;
  assignmentType?: 'broadcast' | 'individual' | 'team';
  automationRuleId?: string;
  automationTrigger?: AutomationTrigger;
  assignmentSource?: AssignmentSource;
  requiresSupervisorAssignment?: boolean;
  autoAssignmentEligibleAt?: number | null;
  cycleCountAtTrigger?: number;
  occurrenceCount?: number;
  latestOccurrenceAt?: number | null;
  taskOrigin?: TaskOrigin;
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
  additionalPhotos?: unknown[];
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
  taskOrigin?: TaskOrigin;
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
