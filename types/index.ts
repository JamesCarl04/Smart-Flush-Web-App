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
