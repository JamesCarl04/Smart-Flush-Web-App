import type { Timestamp } from 'firebase-admin/firestore';

export const TASK_STATUSES = [
  'unassigned',
  'assigned',
  'acknowledged',
  'completed',
  'reassignment_needed',
  'flagged',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRIGGER_TYPES = ['manual', 'hardware_failure', 'maintenance'] as const;
export type TaskTriggerType = (typeof TASK_TRIGGER_TYPES)[number];

export type TaskType = 'maintenance' | 'cleaning';
export type Shift = '1st' | '2nd';
export type ChecklistValue = boolean | 'N/A';

export interface TaskChecklist {
  removeCeilingDust: ChecklistValue;
  removeWallDust: ChecklistValue;
  removeLightBulbDust: ChecklistValue;
  cleanWindows: ChecklistValue;
  wipeDownFixtures: ChecklistValue;
  disinfectTouchedSurfaces: ChecklistValue;
  sweepAndDryFloors: ChecklistValue;
  emptyTrashBins: ChecklistValue;
  arrangeFixtures: ChecklistValue;
  disinfectUVLights: ChecklistValue;
}

export interface TaskDoc {
  id: string;
  alertId: string | null;
  deviceId: string;
  type: TaskType;
  component: string;
  location: string;
  floor: string;
  building: string;
  shift: Shift;
  triggerType: TaskTriggerType;
  message: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedToIds: string[];
  createdAt: Timestamp;
  assignedAt: Timestamp | null;
  acknowledgedAt: Timestamp | null;
  completedAt: Timestamp | null;
  responseTime: number | null;
  workDuration: number | null;
  totalTime: number | null;
  checklist: TaskChecklist;
  remarks: string;
  beforePhotoUrl: string | null;
  beforePhotoCapturedAt: Timestamp | null;
  afterPhotoUrl: string | null;
  afterPhotoCapturedAt: Timestamp | null;
  biometricVerified: boolean;
  offlineSynced: boolean;
  acknowledgedBy?: Record<string, Timestamp>;
  completedBy: string | null;
  completedByMap?: Record<string, Timestamp>;
  createdBy: string;
  reassignCount: number;
  supervisorUid: string | null;
}

export interface CreateTaskInput {
  deviceId: string;
  triggerType?: TaskTriggerType;
  type?: TaskType;
  component?: string;
  message: string;
  assignedTo: string | null;
  assignedToIds?: string[];
  createdBy: string;
}
