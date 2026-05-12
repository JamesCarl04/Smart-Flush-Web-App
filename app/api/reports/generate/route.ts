export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';
import type {
  FlushEventRow,
  MaintenanceTaskRow,
  MaintenanceTaskSummary,
  UVCycleRow,
} from '@/lib/pdf-report';

interface ReportBody {
  type: 'daily' | 'weekly' | 'monthly' | 'custom' | 'maintenance_tasks';
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
  toiletId: string;
  status: 'pending' | 'acknowledged' | 'completed';
  triggeredAt?: Timestamp | null;
  acknowledgedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
}

const VALID_REPORT_TYPES: ReportBody['type'][] = [
  'daily',
  'weekly',
  'monthly',
  'custom',
  'maintenance_tasks',
];
const VALID_FORMATS: ReportBody['format'][] = ['csv', 'json', 'pdf'];

function parseDateBoundary(
  date: string,
  boundary: 'start' | 'end',
): Date | null {
  const candidate = new Date(
    `${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`,
  );

  return Number.isNaN(candidate.getTime()) ? null : candidate;
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

function escapeCsv(value: string): string {
  const sanitized = value.replaceAll('"', '""');
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
    .where('triggeredAt', '>=', fromTs)
    .where('triggeredAt', '<=', toTs)
    .orderBy('triggeredAt', 'asc')
    .get();

  return snapshot.docs.map<TaskDoc>((doc) => {
    const data = doc.data() as Partial<TaskDoc>;
    const status: TaskDoc['status'] =
      data.status === 'acknowledged' || data.status === 'completed'
        ? data.status
        : 'pending';

    return {
      id: typeof data.id === 'string' ? data.id : doc.id,
      toiletId:
        typeof data.toiletId === 'string' && data.toiletId.trim()
          ? data.toiletId
          : 'Unknown',
      status,
      triggeredAt: data.triggeredAt ?? null,
      acknowledgedAt: data.acknowledgedAt ?? null,
      completedAt: data.completedAt ?? null,
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

  return {
    summary: {
      totalFlushes: flushEvents.length,
      totalWaterLiters: Math.round(totalWater * 100) / 100,
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
    const assignedAt = toDate(task.triggeredAt);
    const completedAt = toDate(task.completedAt);
    const completionDuration =
      assignedAt && completedAt
        ? completedAt.getTime() - assignedAt.getTime()
        : null;

    return {
      id: task.id,
      toiletId: task.toiletId,
      timeAssigned: toIsoString(task.triggeredAt) ?? 'Unknown',
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
    const assignedAt = toDate(task.triggeredAt);
    const acknowledgedAt = toDate(task.acknowledgedAt);

    return assignedAt && acknowledgedAt
      ? acknowledgedAt.getTime() - assignedAt.getTime()
      : null;
  });

  const completionDurations = tasks.map((task) => {
    const assignedAt = toDate(task.triggeredAt);
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
    'Toilet ID,Time Assigned,Time Acknowledged,Time Completed,Total Duration,Status',
  ];

  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row.toiletId),
        escapeCsv(row.timeAssigned),
        escapeCsv(row.timeAcknowledged),
        escapeCsv(row.timeCompleted),
        escapeCsv(row.totalDuration),
        escapeCsv(row.status),
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
      toiletId: row.toiletId,
      timeAssigned: row.timeAssigned,
      timeAcknowledged: row.timeAcknowledged,
      timeCompleted: row.timeCompleted,
      totalDuration: row.totalDuration,
      status: row.status,
    })),
  };
}

function getDownloadFilename(
  type: ReportBody['type'],
  format: ReportBody['format'],
  from: string,
  to: string,
): string {
  const prefix =
    type === 'maintenance_tasks'
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
