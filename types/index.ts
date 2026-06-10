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

export type TaskStatus = 'pending' | 'acknowledged' | 'completed';

export type TaskTriggerType =
  | 'manual'
  | 'uv_complete'
  | 'flush_count'
  | 'maintenance';

export interface Task {
  id: string;
  deviceId: string;
  triggerType: TaskTriggerType;
  message: string;
  assignedTo?: string | null;
  assignedToIds?: string[];
  status: TaskStatus;
  createdAt: number;
  acknowledgedAt?: number | null;
  completedAt?: number | null;
  acknowledgedBy?: Record<string, number>;
  completedBy?: Record<string, number>;
  createdBy: string;
  photos?: string[];
  component?: string | null;
  location?: string | null;
  floor?: string | null;
  building?: string | null;
  shift?: string | null;
  remarks?: string | null;
  flagged?: boolean;
  biometricVerified?: boolean;
  offlineSynced?: boolean;
  checklist?: Record<string, boolean> | string[] | null;
  assignedAt?: number | null;
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
