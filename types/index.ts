export interface NotificationPrefs {
  criticalAlerts: boolean; // P0 issues — device down, data loss
  highPriorityAlerts: boolean; // P1 issues — major feature broken
  dailySummaryEmail: boolean; // End-of-day usage report
  weeklyReportEmail: boolean; // Sent every Monday 8:00 AM
}

export interface User {
  id: string;
  email: string;
  createdAt: number;
  displayName?: string | null;
  notifications?: NotificationPrefs;
}

export interface Device {
  id: string;
  name: string;
  publicReportingEnabled?: boolean;
  status: 'online' | 'offline';
  firmwareVersion: string;
  lastSeen: number;
  config?: Record<string, unknown>;
}

export interface SensorReading {
  id: string;
  deviceId: string;
  sensorType: 'ultrasonic' | 'waterflow';
  value: number;
  unit: string;
  timestamp: number;
}

export interface FlushEvent {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestamp: number;
}

export interface LidEvent {
  id: string;
  deviceId: string;
  status: 'open' | 'closed';
  timestamp: number;
}

export interface UVCycle {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  timestamp: number;
}

export interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  acknowledged: boolean;
  timestamp: number;
}

export type TaskStatus =
  | 'pending'
  | 'unassigned'
  | 'assigned'
  | 'acknowledged'
  | 'completed'
  | 'flagged'
  | 'rechecking'
  | 'reassignment_needed';

export type TaskTriggerType =
  | 'manual'
  | 'uv_complete'
  | 'flush_count'
  | 'maintenance'
  | 'hardware_failure'
  | 'sensor_fault'
  | 'water_overuse'
  | 'water_no_flow';

export interface Task {
  id: string;
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo?: string | null;
  assignedToIds?: string[];
  isBroadcast?: boolean;
  assignmentType?: 'broadcast' | 'individual' | 'team';
  automationRuleId?: string;
  automationTrigger?:
    | 'ultrasonic_sensor_fault'
    | 'water_overuse'
    | 'no_water_after_flush'
    | 'maintenance_due';
  assignmentSource?: 'initial_auto' | 'supervisor' | 'retry_auto';
  requiresSupervisorAssignment?: boolean;
  autoAssignmentEligibleAt?: number | null;
  cycleCountAtTrigger?: number;
  status: TaskStatus;
  createdAt: number;
  acknowledgedAt?: number | null;
  completedAt?: number | null;
  acknowledgedBy?: Record<string, number>;
  completedBy?: Record<string, number>;
  createdBy: string;
  location?: string;
  restroomName?: string;
  floor?: string;
  building?: string;
  component?: string;
  remarks?: string;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  workDuration?: number;
  biometricVerified?: boolean;
  inspectionStatus?: 'pending_review' | 'approved' | 'flagged' | null;
  inspectedBy?: string | null;
  inspectedByName?: string | null;
  inspectedAt?: number | null;
  flagReason?: string | null;
  flagPhotoUrls?: string[];
  recheckCount?: number;
  recheckedBy?: string | null;
  recheckedAt?: number | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  group: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
  createdAt: number;
}
