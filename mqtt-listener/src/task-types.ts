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
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedToIds: string[];
  isBroadcast: boolean;
  assignmentType?: 'broadcast' | 'individual' | 'team';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  assignedAt: Timestamp | null;
  acknowledgedAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdBy: string;
  automationRuleId?: string;
  automationTrigger?: AutomationTrigger;
  requiresSupervisorAssignment?: boolean;
  assignmentSource?: AssignmentSource;
  autoAssignmentEligibleAt?: Timestamp | null;
  cycleCountAtTrigger?: number;
  occurrenceCount?: number;
  latestOccurrenceAt?: Timestamp;
  taskOrigin?: TaskOrigin;
}

export interface CreateTaskInput {
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo?: string | null;
  assignedToIds?: string[];
  createdBy: string;
  taskOrigin?: TaskOrigin;
}

export interface CreateAutomatedTaskInput {
  deviceId: string;
  triggerType: TaskTriggerType;
  automationRuleId: string;
  automationTrigger: AutomationTrigger;
  message: string;
  cycleCountAtTrigger?: number;
  assignmentSource?: Extract<AssignmentSource, 'initial_auto' | 'retry_auto'>;
  repeatIntervalMinutes?: number;
}
