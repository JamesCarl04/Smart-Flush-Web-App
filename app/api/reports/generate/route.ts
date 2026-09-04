export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';
import {
  checkRateLimit,
  RATE_LIMITS,
  createRateLimitResponse,
} from '@/lib/rate-limit';
import type {
  FlushEventRow,
  MaintenanceTaskRow,
  MaintenanceTaskSummary,
  SupervisorAuditRow,
  SupervisorAuditSummary,
  UVCycleRow,
} from '@/lib/pdf-report';

interface ReportBody {
  type:
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'custom'
    | 'maintenance_tasks'
    | 'supervisor_audit';
  from: string;
  to: string;
  format: 'csv' | 'json' | 'pdf';
}

interface FlushEventDoc {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestamp: Timestamp;
}

interface UVCycleDoc {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  timestamp: Timestamp;
}

interface TaskDoc {
  id: string;
  deviceId: string;
  triggerType: string;
  message: string;
  status: 'pending' | 'acknowledged' | 'completed' | 'flagged' | 'rechecking';
  assignedTo: string | null;
  assignedToName?: string;
  createdAt?: Timestamp | null;
  acknowledgedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  createdBy: string;
}

const VALID_REPORT_TYPES: ReportBody['type'][] = [
  'daily',
  'weekly',
  'monthly',
  'custom',
  'maintenance_tasks',
  'supervisor_audit',
];
const VALID_FORMATS: ReportBody['format'][] = ['csv', 'json', 'pdf'];

function parseDateBoundary(
  date: string,
  boundary: 'start' | 'end',
): Date | null {
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  const candidate = new Date(`${date}T${time}+08:00`);
  if (!Number.isNaN(candidate.getTime())) {
    return candidate;
  }

  const fallback = new Date(
    `${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`,
  );
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toDate(value?: Timestamp | Date | null): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  const candidate = value as { toDate?: () => Date };
  if (typeof candidate.toDate === 'function') {
    return candidate.toDate();
  }

  return null;
}

function toIsoString(value?: Timestamp | Date | null): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) {
    return 'N/A';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

function averageDurationLabel(values: Array<number | null>): string {
  const resolvedValues = values.filter(
    (value): value is number => typeof value === 'number' && value >= 0,
  );

  if (resolvedValues.length === 0) {
    return 'N/A';
  }

  const average =
    resolvedValues.reduce((sum, value) => sum + value, 0) /
    resolvedValues.length;
  return formatDuration(Math.round(average));
}

export function escapeCsv(value: string | null | undefined): string {
  if (!value) return '';
  let sanitized = value.replaceAll('"', '""');
  if (/^[=+\-@\t\r]/.test(sanitized.replace(/^ +/, ''))) {
    sanitized = `'${sanitized}`;
  }
  return /[",\n]/.test(sanitized) ? `"${sanitized}"` : sanitized;
}

async function fetchUsageReportData(fromTs: Timestamp, toTs: Timestamp) {
  const [flushSnap, uvSnap] = await Promise.all([
    adminDb
      .collection('flushEvents')
      .where('timestamp', '>=', fromTs)
      .where('timestamp', '<=', toTs)
      .orderBy('timestamp', 'asc')
      .get(),
    adminDb
      .collection('uvCycles')
      .where('timestamp', '>=', fromTs)
      .where('timestamp', '<=', toTs)
      .orderBy('timestamp', 'asc')
      .get(),
  ]);

  return {
    flushEvents: flushSnap.docs.map((doc) => doc.data() as FlushEventDoc),
    uvCycles: uvSnap.docs.map((doc) => doc.data() as UVCycleDoc),
  };
}

async function fetchMaintenanceTaskData(fromTs: Timestamp, toTs: Timestamp) {
  const snapshot = await adminDb
    .collection('tasks')
    .where('createdAt', '>=', fromTs)
    .where('createdAt', '<=', toTs)
    .orderBy('createdAt', 'asc')
    .get();

  return snapshot.docs.map<TaskDoc>((doc) => {
    const data = doc.data() as Partial<TaskDoc>;
    const status: TaskDoc['status'] =
      data.status === 'acknowledged' || data.status === 'completed'
        ? data.status
        : 'pending';

    return {
      id: typeof data.id === 'string' ? data.id : doc.id,
      deviceId:
        typeof data.deviceId === 'string' && data.deviceId.trim()
          ? data.deviceId
          : 'Unknown',
      triggerType:
        typeof data.triggerType === 'string' && data.triggerType.trim()
          ? data.triggerType
          : 'manual',
      message: typeof data.message === 'string' ? data.message : '',
      status,
      assignedTo:
        typeof data.assignedTo === 'string' && data.assignedTo.trim()
          ? data.assignedTo
          : null,
      createdAt: data.createdAt ?? null,
      acknowledgedAt: data.acknowledgedAt ?? null,
      completedAt: data.completedAt ?? null,
      createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    };
  });
}

const DEVICE_FACILITY_DIRECTORY: Record<
  string,
  { name: string; floor: string; building: string }
> = {
  'SDCA-FL1-CANTEEN-M': {
    name: '1F Canteen Male Restroom',
    floor: '1st Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL1-CANTEEN-F': {
    name: '1F Canteen Female Restroom',
    floor: '1st Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL1-FACULTY-M': {
    name: '1F Faculty Male Restroom',
    floor: '1st Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL1-FACULTY-F': {
    name: '1F Faculty Female Restroom',
    floor: '1st Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL2-M1': {
    name: '2F Male Restroom 1',
    floor: '2nd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL2-M2': {
    name: '2F Male Restroom 2',
    floor: '2nd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL2-F1': {
    name: '2F Female Restroom 1',
    floor: '2nd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL2-F2': {
    name: '2F Female Restroom 2',
    floor: '2nd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL2-PWD': {
    name: '2F PWD Restroom',
    floor: '2nd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL3-M1': {
    name: '3F Male Restroom 1',
    floor: '3rd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL3-M2': {
    name: '3F Male Restroom 2',
    floor: '3rd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL3-F1': {
    name: '3F Female Restroom 1',
    floor: '3rd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL3-F2': {
    name: '3F Female Restroom 2',
    floor: '3rd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL3-PWD': {
    name: '3F PWD Restroom',
    floor: '3rd Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL4-M1': {
    name: '4F Male Restroom 1',
    floor: '4th Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL4-M2': {
    name: '4F Male Restroom 2',
    floor: '4th Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL4-F1': {
    name: '4F Female Restroom 1',
    floor: '4th Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL4-F2': {
    name: '4F Female Restroom 2',
    floor: '4th Floor',
    building: 'SDCA Annex Building',
  },
  'SDCA-FL4-PWD': {
    name: '4F PWD Restroom',
    floor: '4th Floor',
    building: 'SDCA Annex Building',
  },
  'toilet-01': {
    name: '1st Floor Testing Lab',
    floor: '1st Floor',
    building: 'SDCA Annex Building',
  },
};

interface SupervisorTaskDoc {
  id: string;
  deviceId: string;
  triggerType: string;
  message: string;
  status: string;
  assignedTo: string | null;
  assignedToName?: string;
  location?: string;
  floor?: string;
  building?: string;
  inspectionStatus?: string | null;
  inspectedBy?: string | null;
  inspectedByName?: string | null;
  inspectedAt?: Timestamp | null;
  flagReason?: string | null;
  recheckCount?: number;
  workDuration?: number;
  biometricVerified?: boolean;
  createdAt?: Timestamp | null;
  acknowledgedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  createdBy: string;
}

async function fetchSupervisorAuditData(fromTs: Timestamp, toTs: Timestamp) {
  const [tasksSnap, usersSnap] = await Promise.all([
    adminDb
      .collection('tasks')
      .where('createdAt', '>=', fromTs)
      .where('createdAt', '<=', toTs)
      .orderBy('createdAt', 'asc')
      .get(),
    adminDb.collection('users').get().catch(() => null),
  ]);

  const userNameMap = new Map<string, string>();
  if (usersSnap) {
    for (const doc of usersSnap.docs) {
      const udata = doc.data();
      const name = udata.displayName || udata.name || udata.email || doc.id;
      userNameMap.set(doc.id, name);
    }
  }

  return tasksSnap.docs.map<SupervisorTaskDoc>((doc) => {
    const data = doc.data() as Partial<SupervisorTaskDoc>;
    const deviceId =
      typeof data.deviceId === 'string' && data.deviceId.trim()
        ? data.deviceId
        : 'Unknown';
    const locInfo = DEVICE_FACILITY_DIRECTORY[deviceId];

    const assignedTo =
      typeof data.assignedTo === 'string' && data.assignedTo.trim()
        ? data.assignedTo
        : null;
    const assignedToName = assignedTo
      ? userNameMap.get(assignedTo) ?? assignedTo
      : 'Unassigned';

    const inspectedBy =
      typeof data.inspectedBy === 'string' && data.inspectedBy.trim()
        ? data.inspectedBy
        : null;
    const inspectedByName = inspectedBy
      ? userNameMap.get(inspectedBy) ?? data.inspectedByName ?? 'Supervisor'
      : (data.inspectedByName ?? '');

    return {
      id: typeof data.id === 'string' ? data.id : doc.id,
      deviceId,
      triggerType:
        typeof data.triggerType === 'string' && data.triggerType.trim()
          ? data.triggerType
          : 'manual',
      message: typeof data.message === 'string' ? data.message : '',
      status: typeof data.status === 'string' ? data.status : 'pending',
      assignedTo,
      assignedToName,
      location: data.location || locInfo?.name || deviceId,
      floor: data.floor || locInfo?.floor || 'SDCA Annex',
      building: data.building || locInfo?.building || 'SDCA Annex',
      inspectionStatus:
        data.inspectionStatus ??
        (data.status === 'flagged' ? 'flagged' : null),
      inspectedBy,
      inspectedByName,
      inspectedAt: data.inspectedAt ?? null,
      flagReason: typeof data.flagReason === 'string' ? data.flagReason : '',
      recheckCount: typeof data.recheckCount === 'number' ? data.recheckCount : 0,
      workDuration: typeof data.workDuration === 'number' ? data.workDuration : 0,
      biometricVerified: Boolean(data.biometricVerified),
      createdAt: data.createdAt ?? null,
      acknowledgedAt: data.acknowledgedAt ?? null,
      completedAt: data.completedAt ?? null,
      createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    };
  });
}

function buildUsageCSV(
  flushEvents: FlushEventDoc[],
  uvCycles: UVCycleDoc[],
): string {
  const lines: string[] = [];

  lines.push('--- FLUSH EVENTS ---');
  lines.push('id,deviceId,waterVolume,duration,timestamp');
  for (const event of flushEvents) {
    lines.push(
      [
        escapeCsv(event.id),
        escapeCsv(event.deviceId),
        String(event.waterVolume),
        String(event.duration),
        escapeCsv(event.timestamp.toDate().toISOString()),
      ].join(','),
    );
  }

  lines.push('');
  lines.push('--- UV CYCLES ---');
  lines.push('id,deviceId,duration,completed,timestamp');
  for (const cycle of uvCycles) {
    lines.push(
      [
        escapeCsv(cycle.id),
        escapeCsv(cycle.deviceId),
        String(cycle.duration),
        String(cycle.completed),
        escapeCsv(cycle.timestamp.toDate().toISOString()),
      ].join(','),
    );
  }

  return lines.join('\n');
}

function buildUsageJSON(flushEvents: FlushEventDoc[], uvCycles: UVCycleDoc[]) {
  const totalWater = flushEvents.reduce(
    (sum, event) => sum + (event.waterVolume ?? 0),
    0,
  );
  const completedUvCycles = uvCycles.filter((cycle) => cycle.completed).length;
  const baselineWater = flushEvents.length * 6.0;
  const waterSaved = Math.max(0, baselineWater - totalWater);
  const conservationPercent =
    baselineWater > 0
      ? Math.round((waterSaved / baselineWater) * 10000) / 100
      : 0;

  return {
    summary: {
      totalFlushes: flushEvents.length,
      totalWaterLiters: Math.round(totalWater * 100) / 100,
      baselineWaterLiters: Math.round(baselineWater * 100) / 100,
      waterSavedLiters: Math.round(waterSaved * 100) / 100,
      waterConservationPercent: conservationPercent,
      uvCycles: uvCycles.length,
      uvCompletionRate:
        uvCycles.length === 0
          ? 100
          : Math.round((completedUvCycles / uvCycles.length) * 10000) / 100,
    },
    flushEvents: flushEvents.map((event) => ({
      ...event,
      timestamp: event.timestamp.toDate().toISOString(),
    })),
    uvCycles: uvCycles.map((cycle) => ({
      ...cycle,
      timestamp: cycle.timestamp.toDate().toISOString(),
    })),
  };
}

function buildMaintenanceTaskDataset(tasks: TaskDoc[]): {
  rows: MaintenanceTaskRow[];
  summary: MaintenanceTaskSummary;
} {
  const rows = tasks.map((task) => {
    const assignedAt = toDate(task.createdAt);
    const completedAt = toDate(task.completedAt);
    const completionDuration =
      assignedAt && completedAt
        ? completedAt.getTime() - assignedAt.getTime()
        : null;

    return {
      id: task.id,
      deviceId: task.deviceId,
      triggerType: task.triggerType,
      message: task.message,
      assignedTo: task.assignedTo,
      createdBy: task.createdBy,
      timeAssigned: toIsoString(task.createdAt) ?? 'Unknown',
      timeAcknowledged: toIsoString(task.acknowledgedAt) ?? 'Not Acknowledged',
      timeCompleted: toIsoString(task.completedAt) ?? 'Not Completed',
      totalDuration:
        completionDuration === null
          ? 'Not Completed'
          : formatDuration(completionDuration),
      status: task.status,
    };
  });

  const responseDurations = tasks.map((task) => {
    const assignedAt = toDate(task.createdAt);
    const acknowledgedAt = toDate(task.acknowledgedAt);

    return assignedAt && acknowledgedAt
      ? acknowledgedAt.getTime() - assignedAt.getTime()
      : null;
  });

  const completionDurations = tasks.map((task) => {
    const assignedAt = toDate(task.createdAt);
    const completedAt = toDate(task.completedAt);

    return assignedAt && completedAt
      ? completedAt.getTime() - assignedAt.getTime()
      : null;
  });

  return {
    rows,
    summary: {
      totalTasks: tasks.length,
      completedCount: tasks.filter((task) => task.status === 'completed')
        .length,
      pendingCount: tasks.filter((task) => task.status === 'pending').length,
      averageResponseTime: averageDurationLabel(responseDurations),
      averageCompletionTime: averageDurationLabel(completionDurations),
    },
  };
}

function buildMaintenanceTaskCSV(
  summary: MaintenanceTaskSummary,
  rows: MaintenanceTaskRow[],
): string {
  const lines: string[] = [
    '--- MAINTENANCE TASK SUMMARY ---',
    `Total Tasks,${summary.totalTasks}`,
    `Completed Count,${summary.completedCount}`,
    `Pending Count,${summary.pendingCount}`,
    `Average Response Time,${escapeCsv(summary.averageResponseTime)}`,
    `Average Completion Time,${escapeCsv(summary.averageCompletionTime)}`,
    '',
    'id,deviceId,triggerType,message,status,assignedTo,createdAt,acknowledgedAt,completedAt,createdBy,totalDuration',
  ];

  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row.id),
        escapeCsv(row.deviceId),
        escapeCsv(row.triggerType),
        escapeCsv(row.message),
        escapeCsv(row.status),
        escapeCsv(row.assignedTo ?? ''),
        escapeCsv(row.timeAssigned),
        escapeCsv(row.timeAcknowledged),
        escapeCsv(row.timeCompleted),
        escapeCsv(row.createdBy),
        escapeCsv(row.totalDuration),
      ].join(','),
    );
  }

  return lines.join('\n');
}

function buildMaintenanceTaskJSON(
  summary: MaintenanceTaskSummary,
  rows: MaintenanceTaskRow[],
) {
  return {
    summary,
    tasks: rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      triggerType: row.triggerType,
      message: row.message,
      status: row.status,
      assignedTo: row.assignedTo,
      timeAssigned: row.timeAssigned,
      timeAcknowledged: row.timeAcknowledged,
      timeCompleted: row.timeCompleted,
      totalDuration: row.totalDuration,
      createdBy: row.createdBy,
    })),
  };
}

function buildSupervisorAuditDataset(tasks: SupervisorTaskDoc[]): {
  rows: SupervisorAuditRow[];
  summary: SupervisorAuditSummary;
} {
  const completedTasks = tasks.filter(
    (t) =>
      t.status === 'completed' ||
      t.status === 'flagged' ||
      t.status === 'rechecking' ||
      Boolean(t.completedAt),
  );

  let approvedCount = 0;
  let flaggedCount = 0;

  for (const t of completedTasks) {
    if (t.inspectionStatus === 'approved') {
      approvedCount += 1;
    } else if (t.inspectionStatus === 'flagged' || t.status === 'flagged') {
      flaggedCount += 1;
    }
  }

  const totalSubmissions = completedTasks.length;
  const auditedCount = approvedCount + flaggedCount;
  const pendingAuditCount = Math.max(0, totalSubmissions - auditedCount);
  const approvalRate =
    auditedCount > 0
      ? `${Math.round((approvedCount / auditedCount) * 100)}%`
      : '0%';
  const complianceRate =
    totalSubmissions > 0
      ? `${Math.round((auditedCount / totalSubmissions) * 100)}%`
      : '0%';

  const rows: SupervisorAuditRow[] = completedTasks.map((t) => ({
    id: t.id,
    deviceId: t.deviceId,
    location: t.location || t.deviceId,
    floor: t.floor || 'SDCA Annex',
    triggerType: t.triggerType,
    message: t.message,
    status: t.status,
    assignedToName: t.assignedToName || 'Unassigned',
    inspectionStatus:
      t.inspectionStatus || (t.status === 'flagged' ? 'flagged' : 'pending_review'),
    inspectedByName: t.inspectedByName || '',
    inspectedAt: toIsoString(t.inspectedAt) ?? '',
    flagReason: t.flagReason || '',
    recheckCount: t.recheckCount || 0,
    timeAssigned: toIsoString(t.createdAt) ?? 'Unknown',
    timeCompleted: toIsoString(t.completedAt) ?? 'Not Completed',
    workDuration: formatDuration(t.workDuration ? t.workDuration * 1000 : null),
    biometricVerified: Boolean(t.biometricVerified),
  }));

  return {
    rows,
    summary: {
      totalSubmissions,
      approvedCount,
      flaggedCount,
      pendingAuditCount,
      approvalRate,
      complianceRate,
    },
  };
}

function buildSupervisorAuditCSV(
  summary: SupervisorAuditSummary,
  rows: SupervisorAuditRow[],
): string {
  const lines: string[] = [
    '--- SUPERVISOR QA & APPROVAL AUDIT SUMMARY ---',
    `Total Submissions,${summary.totalSubmissions}`,
    `Approved Tasks,${summary.approvedCount}`,
    `Flagged for Rework,${summary.flaggedCount}`,
    `Pending Review,${summary.pendingAuditCount}`,
    `Approval Rate,${escapeCsv(summary.approvalRate)}`,
    `Audit Compliance Rate,${escapeCsv(summary.complianceRate)}`,
    '',
    'Task ID,Location,Floor,Trigger Type,Task Message,Status,Assigned Tech,QA Inspection Status,Inspected By,Inspected At,Flag Reason,Rechecks,Created At,Completed At,Work Duration,Biometric Verified',
  ];

  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row.id),
        escapeCsv(row.location),
        escapeCsv(row.floor),
        escapeCsv(row.triggerType),
        escapeCsv(row.message),
        escapeCsv(row.status),
        escapeCsv(row.assignedToName),
        escapeCsv(row.inspectionStatus),
        escapeCsv(row.inspectedByName),
        escapeCsv(row.inspectedAt),
        escapeCsv(row.flagReason),
        String(row.recheckCount),
        escapeCsv(row.timeAssigned),
        escapeCsv(row.timeCompleted),
        escapeCsv(row.workDuration),
        row.biometricVerified ? 'Yes' : 'No',
      ].join(','),
    );
  }

  return lines.join('\n');
}

function buildSupervisorAuditJSON(
  summary: SupervisorAuditSummary,
  rows: SupervisorAuditRow[],
) {
  return {
    summary,
    tasks: rows,
  };
}

function getDownloadFilename(
  type: ReportBody['type'],
  format: ReportBody['format'],
  from: string,
  to: string,
): string {
  const prefix =
    type === 'supervisor_audit'
      ? 'smart-flush-supervisor-qa-audit'
      : type === 'maintenance_tasks'
        ? 'smart-flush-maintenance-tasks'
        : 'smart-flush';

  return `${prefix}-${from}-${to}.${format}`;
}

function buildDownloadResponse(
  body: BodyInit,
  format: ReportBody['format'],
  filename: string,
): Response {
  const contentType =
    format === 'csv'
      ? 'text/csv'
      : format === 'json'
        ? 'application/json'
        : 'application/pdf';

  return new Response(body, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': contentType,
      Pragma: 'no-cache',
    },
  });
}

async function saveReportMetadata(
  userId: string,
  type: ReportBody['type'],
  from: string,
  to: string,
  format: ReportBody['format'],
) {
  const reportRef = adminDb.collection('reports').doc();
  await reportRef.set({
    id: reportRef.id,
    type,
    from,
    to,
    format,
    userId,
    generatedAt: FieldValue.serverTimestamp(),
  });
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  try {
    const user = await verifyAuthToken(request);
    const rateLimitKey = `report:${user.uid}`;
    const rateLimitCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.reports);
    if (!rateLimitCheck.success) {
      return createRateLimitResponse(rateLimitCheck.retryAfter || 60);
    }

    const body = (await request.json()) as Partial<ReportBody>;
    const { type, from, to, format } = body;

    if (!type || !from || !to || !format) {
      return NextResponse.json(
        { success: false, error: 'type, from, to, and format are required' },
        { status: 400 },
      );
    }

    if (!VALID_REPORT_TYPES.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'type must be daily, weekly, monthly, custom, or maintenance_tasks',
        },
        { status: 400 },
      );
    }

    if (!VALID_FORMATS.includes(format)) {
      return NextResponse.json(
        { success: false, error: 'format must be csv, json, or pdf' },
        { status: 400 },
      );
    }

    const fromDate = parseDateBoundary(from, 'start');
    const toDate = parseDateBoundary(to, 'end');
    if (!fromDate || !toDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'from and to must be valid dates in YYYY-MM-DD format',
        },
        { status: 400 },
      );
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: 'The end date must be on or after the start date',
        },
        { status: 400 },
      );
    }

    const fromTs = Timestamp.fromDate(fromDate);
    const toTs = Timestamp.fromDate(toDate);
    const filename = getDownloadFilename(type, format, from, to);

    if (type === 'maintenance_tasks') {
      const tasks = await fetchMaintenanceTaskData(fromTs, toTs);
      const { rows, summary } = buildMaintenanceTaskDataset(tasks);

      if (format === 'csv') {
        const csv = buildMaintenanceTaskCSV(summary, rows);
        await saveReportMetadata(user.uid, type, from, to, format);
        return buildDownloadResponse(csv, format, filename);
      }

      if (format === 'json') {
        const json = buildMaintenanceTaskJSON(summary, rows);
        await saveReportMetadata(user.uid, type, from, to, format);
        return buildDownloadResponse(
          JSON.stringify(json, null, 2),
          format,
          filename,
        );
      }

      const { generateMaintenanceTaskPDFBuffer } =
        await import('@/lib/pdf-report');
      const pdfBuffer = await generateMaintenanceTaskPDFBuffer(
        from,
        to,
        rows,
        summary,
      );
      await saveReportMetadata(user.uid, type, from, to, format);

      return buildDownloadResponse(
        Uint8Array.from(pdfBuffer).buffer as ArrayBuffer,
        format,
        filename,
      );
    }

    if (type === 'supervisor_audit') {
      const tasks = await fetchSupervisorAuditData(fromTs, toTs);
      const { rows, summary } = buildSupervisorAuditDataset(tasks);

      if (format === 'csv') {
        const csv = buildSupervisorAuditCSV(summary, rows);
        await saveReportMetadata(user.uid, type, from, to, format);
        return buildDownloadResponse(csv, format, filename);
      }

      if (format === 'json') {
        const json = buildSupervisorAuditJSON(summary, rows);
        await saveReportMetadata(user.uid, type, from, to, format);
        return buildDownloadResponse(
          JSON.stringify(json, null, 2),
          format,
          filename,
        );
      }

      const { generateSupervisorAuditPDFBuffer } =
        await import('@/lib/pdf-report');
      const pdfBuffer = await generateSupervisorAuditPDFBuffer(
        from,
        to,
        rows,
        summary,
      );
      await saveReportMetadata(user.uid, type, from, to, format);

      return buildDownloadResponse(
        Uint8Array.from(pdfBuffer).buffer as ArrayBuffer,
        format,
        filename,
      );
    }

    const { flushEvents, uvCycles } = await fetchUsageReportData(fromTs, toTs);

    if (format === 'csv') {
      const csv = buildUsageCSV(flushEvents, uvCycles);
      await saveReportMetadata(user.uid, type, from, to, format);
      return buildDownloadResponse(csv, format, filename);
    }

    if (format === 'json') {
      const json = buildUsageJSON(flushEvents, uvCycles);
      await saveReportMetadata(user.uid, type, from, to, format);
      return buildDownloadResponse(
        JSON.stringify(json, null, 2),
        format,
        filename,
      );
    }

    const { generatePDFBuffer } = await import('@/lib/pdf-report');

    const flushRows: FlushEventRow[] = flushEvents.map((event) => ({
      id: event.id,
      deviceId: event.deviceId,
      waterVolume: event.waterVolume,
      duration: event.duration,
      timestamp: event.timestamp.toDate().toISOString(),
    }));

    const uvRows: UVCycleRow[] = uvCycles.map((cycle) => ({
      id: cycle.id,
      deviceId: cycle.deviceId,
      duration: cycle.duration,
      completed: cycle.completed,
      timestamp: cycle.timestamp.toDate().toISOString(),
    }));

    const pdfBuffer = await generatePDFBuffer(from, to, flushRows, uvRows);
    await saveReportMetadata(user.uid, type, from, to, format);
    return buildDownloadResponse(
      Uint8Array.from(pdfBuffer).buffer as ArrayBuffer,
      format,
      filename,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('[Reports] generate error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to generate report',
      },
      { status: 500 },
    );
  }
}
