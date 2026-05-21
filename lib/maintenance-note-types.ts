import type { Timestamp } from 'firebase-admin/firestore';

export const MAINTENANCE_NOTE_STATUSES = ['sent', 'failed'] as const;
export type MaintenanceNoteStatus = (typeof MAINTENANCE_NOTE_STATUSES)[number];

export interface MaintenanceNoteDoc {
  id: string;
  restroomId: string;
  message: string;
  taskId: string;
  assignedTo: string | null;
  status: MaintenanceNoteStatus;
  source: 'web_dashboard';
  createdAt: Timestamp;
  createdBy: string;
}

export interface MaintenanceNoteApiData {
  id: string;
  restroomId: string;
  message: string;
  taskId: string;
  assignedTo: string | null;
  status: MaintenanceNoteStatus;
  source: 'web_dashboard';
  createdAt: number | null;
  createdBy: string;
}

export interface CreateMaintenanceNoteInput {
  restroomId: string;
  message: string;
  assignedTo: string | null;
  createdBy: string;
}
