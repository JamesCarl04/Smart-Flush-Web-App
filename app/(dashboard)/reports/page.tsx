'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { format, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Clock,
  Download,
  FileBarChart,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileX,
  History,
  Hourglass,
  Layers,
  ShieldCheck,
  Timer,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useTasks } from '@/hooks/useTasks';
import { getErrorMessage } from '@/lib/error-utils';
import type { Task, TaskStatus, TaskTriggerType } from '@/types';

type ReportType =
  | 'usage_summary'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'
  | 'maintenance_tasks'
  | 'supervisor_audit';

type DateRangeOption =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month';

type ExportFormat = 'PDF' | 'CSV' | 'JSON';

type RequestReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'
  | 'maintenance_tasks'
  | 'supervisor_audit';

interface ExportRecord {
  id: string;
  name: string;
  type: string;
  date: Date;
  size: string;
  format: ExportFormat;
}

const REPORT_TYPE_OPTIONS: { label: string; value: ReportType; desc: string }[] = [
  {
    label: 'Usage Summary',
    value: 'usage_summary',
    desc: 'High-level aggregation of flushes, water savings, and cycle counts.',
  },
  {
    label: 'Daily Audit Report',
    value: 'daily',
    desc: 'Hour-by-hour telemetry and occupancy activity logs for today.',
  },
  {
    label: 'Weekly Performance',
    value: 'weekly',
    desc: '7-day overview with trend analysis and sanitization efficacy.',
  },
  {
    label: 'Monthly Executive Summary',
    value: 'monthly',
    desc: 'Comprehensive monthly facility metrics and water conservation.',
  },
  {
    label: 'Custom Range Audit',
    value: 'custom',
    desc: 'Specify custom start and end timestamps for precise auditing.',
  },
  {
    label: 'Maintenance Task Report',
    value: 'maintenance_tasks',
    desc: 'Work order history, response times, and personnel attribution.',
  },
  {
    label: 'Supervisor QA & Approval Audit',
    value: 'supervisor_audit',
    desc: 'Supervisor approval rate vs maintenance submissions, inspection turnaround, and flagged recheck analytics.',
  },
];

const RANGE_OPTIONS: { label: string; value: DateRangeOption }[] = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
];

const TRIGGER_LABELS: Record<TaskTriggerType, string> = {
  manual: 'Manual Dispatch',
  uv_complete: 'UV Cycle Complete',
  flush_count: 'Flush Count Trigger',
  maintenance: 'Scheduled Maintenance',
  hardware_failure: 'Hardware Failure Alert',
};

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case 'acknowledged':
      return (
        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
          Acknowledged
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          Completed
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          Flagged (Recheck)
        </span>
      );
    case 'rechecking':
      return (
        <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
          Rechecking
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          Pending
        </span>
      );
  }
}

function getInspectionBadge(inspectionStatus?: string | null) {
  switch (inspectionStatus) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertCircle className="h-3 w-3" />
          Flagged
        </span>
      );
    case 'pending_review':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <Clock className="h-3 w-3" />
          Pending Review
        </span>
      );
  }
}

function formatTaskTimestamp(value?: number | null): string {
  if (!value) {
    return '—';
  }
  return format(new Date(value), 'MMM d, yyyy HH:mm');
}

function taskTimestampToCsv(value?: number | null): string {
  return value ? new Date(value).toISOString() : '';
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  const escaped = text.replaceAll('"', '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function averageMinutes(
  tasks: Task[],
  timestampKey: 'acknowledgedAt' | 'completedAt',
): number | null {
  const durations = tasks
    .map((task) => {
      const endTimestamp = task[timestampKey];
      if (!task.createdAt || !endTimestamp) {
        return null;
      }
      const duration = endTimestamp - task.createdAt;
      return duration >= 0 ? duration / 60_000 : null;
    })
    .filter((value): value is number => typeof value === 'number');

  if (durations.length === 0) {
    return null;
  }

  return durations.reduce((sum, value) => sum + value, 0) / durations.length;
}

function formatAverageMinutes(value: number | null): string {
  if (value === null) {
    return 'N/A';
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} min`;
}

function buildMaintenanceTasksCsv(
  tasks: Task[],
  resolveAssignedName: (assignedUserId?: string | null) => string,
): string {
  const headers = [
    'id',
    'deviceId',
    'triggerType',
    'message',
    'status',
    'assignedTo',
    'assignedToName',
    'createdAt',
    'acknowledgedAt',
    'completedAt',
    'createdBy',
  ];

  const lines = [headers.join(',')];

  for (const task of tasks) {
    lines.push(
      [
        task.id,
        task.deviceId,
        task.triggerType,
        task.message,
        task.status,
        task.assignedTo ?? '',
        resolveAssignedName(task.assignedTo),
        taskTimestampToCsv(task.createdAt),
        taskTimestampToCsv(task.acknowledgedAt),
        taskTimestampToCsv(task.completedAt),
        task.createdBy,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  }

  return lines.join('\n');
}

function buildSupervisorAuditCsv(
  tasks: Task[],
  resolveAssignedName: (assignedUserId?: string | null) => string,
): string {
  const headers = [
    'Task ID',
    'Location',
    'Floor',
    'Building',
    'Trigger Type',
    'Task Message',
    'Status',
    'Assigned To',
    'Assigned To Name',
    'Inspection Status',
    'Inspected By',
    'Inspected By Name',
    'Inspected At',
    'Flag Reason',
    'Recheck Count',
    'Created At',
    'Completed At',
    'Work Duration (Seconds)',
    'Biometric Verified',
    'Created By',
  ];

  const lines = [headers.join(',')];

  for (const task of tasks) {
    lines.push(
      [
        task.id,
        task.location || task.restroomName || task.deviceId,
        task.floor ?? '',
        task.building ?? '',
        task.triggerType,
        task.message,
        task.status,
        task.assignedTo ?? '',
        resolveAssignedName(task.assignedTo),
        task.inspectionStatus ?? (task.status === 'flagged' ? 'flagged' : 'pending_review'),
        task.inspectedBy ?? '',
        task.inspectedByName ?? '',
        taskTimestampToCsv(task.inspectedAt),
        task.flagReason ?? '',
        task.recheckCount ?? 0,
        taskTimestampToCsv(task.createdAt),
        taskTimestampToCsv(task.completedAt),
        task.workDuration ?? 0,
        task.biometricVerified ? 'Yes' : 'No',
        task.createdBy,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  }

  return lines.join('\n');
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
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

function resolveTaskLocation(task: Task): { displayName: string; floor: string } {
  if (task.restroomName && task.floor) {
    return { displayName: task.restroomName, floor: task.floor };
  }
  if (task.location) {
    return { displayName: task.location, floor: task.floor || 'SDCA Annex' };
  }
  const known = DEVICE_FACILITY_DIRECTORY[task.deviceId];
  if (known) {
    return { displayName: known.name, floor: known.floor };
  }
  return { displayName: task.deviceId || 'General Facility', floor: 'SDCA Annex' };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const {
    tasks,
    pendingCount,
    loading: tasksLoading,
    error: tasksError,
  } = useTasks();
  const {
    personnelById,
    loading: personnelLoading,
  } = useMaintenancePersonnel();

  const [reportType, setReportType] = useState<ReportType>('usage_summary');
  const [dateRange, setDateRange] = useState<DateRangeOption>('last_7_days');
  const [formatType, setFormatType] = useState<ExportFormat>('PDF');
  const [customRange, setCustomRange] = useState(() => ({
    from: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  }));
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([
    {
      id: 'exp-recent-1',
      name: 'Monthly_Usage_Summary_Jul2026',
      type: 'monthly',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      size: '2.4 MB',
      format: 'PDF',
    },
    {
      id: 'exp-recent-2',
      name: 'Facility_Maintenance_Log_W32',
      type: 'maintenance_tasks',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      size: '480 KB',
      format: 'CSV',
    },
    {
      id: 'exp-recent-3',
      name: 'Ultrasonic_Telemetry_Audit_Q3',
      type: 'custom',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      size: '1.1 MB',
      format: 'JSON',
    },
  ]);

  const isMaintenanceTaskReport = reportType === 'maintenance_tasks';
  const isSupervisorAuditReport = reportType === 'supervisor_audit';
  const usesExplicitRange =
    reportType === 'custom' ||
    isMaintenanceTaskReport ||
    isSupervisorAuditReport;
  const hasInvalidDateRange =
    usesExplicitRange && customRange.from > customRange.to;

  const resolvedRange = useMemo(() => {
    if (usesExplicitRange) {
      return customRange;
    }

    const now = new Date();
    switch (dateRange) {
      case 'last_30_days':
        return {
          from: format(subDays(now, 29), 'yyyy-MM-dd'),
          to: format(now, 'yyyy-MM-dd'),
        };
      case 'this_month':
        return {
          from: format(startOfMonth(now), 'yyyy-MM-dd'),
          to: format(endOfMonth(now), 'yyyy-MM-dd'),
        };
      case 'last_month': {
        const previousMonth = subMonths(now, 1);
        return {
          from: format(startOfMonth(previousMonth), 'yyyy-MM-dd'),
          to: format(endOfMonth(previousMonth), 'yyyy-MM-dd'),
        };
      }
      case 'last_7_days':
      default:
        return {
          from: format(subDays(now, 6), 'yyyy-MM-dd'),
          to: format(now, 'yyyy-MM-dd'),
        };
    }
  }, [customRange, dateRange, usesExplicitRange]);

  const resolveAssignedName = (assignedUserId?: string | null) => {
    if (!assignedUserId) {
      return 'Unassigned';
    }
    return personnelById[assignedUserId]?.displayName ?? assignedUserId;
  };

  const taskSummary = useMemo(
    () => ({
      totalTasks: tasks.length,
      pendingNow: pendingCount,
      averageResponseMinutes: averageMinutes(tasks, 'acknowledgedAt'),
      averageCompletionMinutes: averageMinutes(tasks, 'completedAt'),
    }),
    [pendingCount, tasks],
  );

  const supervisorAuditSummary = useMemo(() => {
    const completedTasks = tasks.filter(
      (t) =>
        t.status === 'completed' ||
        t.status === 'flagged' ||
        t.status === 'rechecking' ||
        Boolean(t.completedAt),
    );

    const totalSubmissions = completedTasks.length;
    let approvedCount = 0;
    let flaggedCount = 0;

    for (const t of completedTasks) {
      if (t.inspectionStatus === 'approved') {
        approvedCount += 1;
      } else if (t.inspectionStatus === 'flagged' || t.status === 'flagged') {
        flaggedCount += 1;
      }
    }

    const pendingAuditCount = totalSubmissions - (approvedCount + flaggedCount);
    const auditedCount = approvedCount + flaggedCount;
    const approvalRatePct =
      auditedCount > 0 ? Math.round((approvedCount / auditedCount) * 100) : 0;
    const complianceRatePct =
      totalSubmissions > 0
        ? Math.round((auditedCount / totalSubmissions) * 100)
        : 0;

    return {
      totalSubmissions,
      approvedCount,
      flaggedCount,
      pendingAuditCount,
      approvalRate: auditedCount > 0 ? `${approvalRatePct}%` : '0%',
      complianceRate: `${complianceRatePct}%`,
      completedTasks,
    };
  }, [tasks]);

  const handleExportMaintenanceCsv = () => {
    if (!user) {
      toast.error('You must be logged in to export reports.');
      return;
    }

    const csv = buildMaintenanceTasksCsv(tasks, resolveAssignedName);
    const generatedAt = format(new Date(), 'yyyy-MM-dd-HHmm');
    const filename = `smart-flush-maintenance-tasks-${generatedAt}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8');

    // Add to export history
    setExportHistory((prev) => [
      {
        id: `exp-${Date.now()}`,
        name: filename.replace('.csv', ''),
        type: 'maintenance_tasks',
        date: new Date(),
        size: `${Math.max(1, Math.round(csv.length / 1024))} KB`,
        format: 'CSV',
      },
      ...prev,
    ]);

    toast.success('Maintenance task CSV exported');
  };

  const handleExportSupervisorAuditCsv = () => {
    if (!user) {
      toast.error('You must be logged in to export reports.');
      return;
    }

    const csv = buildSupervisorAuditCsv(
      supervisorAuditSummary.completedTasks,
      resolveAssignedName,
    );
    const generatedAt = format(new Date(), 'yyyy-MM-dd-HHmm');
    const filename = `smart-flush-supervisor-qa-audit-${generatedAt}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8');

    setExportHistory((prev) => [
      {
        id: `exp-${Date.now()}`,
        name: filename.replace('.csv', ''),
        type: 'supervisor_audit',
        date: new Date(),
        size: `${Math.max(1, Math.round(csv.length / 1024))} KB`,
        format: 'CSV',
      },
      ...prev,
    ]);

    toast.success('Supervisor QA audit CSV exported');
  };

  const handleGenerate = async () => {
    if (!user) {
      toast.error('You must be logged in to generate reports.');
      return;
    }

    if (hasInvalidDateRange) {
      toast.error('The end date must be on or after the start date.');
      return;
    }

    if (isMaintenanceTaskReport && formatType === 'CSV') {
      handleExportMaintenanceCsv();
      return;
    }

    if (isSupervisorAuditReport && formatType === 'CSV') {
      handleExportSupervisorAuditCsv();
      return;
    }

    setIsGenerating(true);
    try {
      const token = await user.getIdToken();
      const requestType: RequestReportType =
        reportType === 'usage_summary' ? 'custom' : reportType;
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: requestType,
          from: resolvedRange.from,
          to: resolvedRange.to,
          format: formatType.toLowerCase(),
        }),
      });

      if (!res.ok) {
        const contentType = res.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
          const body = (await res.json()) as { error?: string };
          throw new Error(
            body.error ?? `Failed to generate report (${res.status})`,
          );
        }

        const text = await res.text();
        throw new Error(text || `Failed to generate report (${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;

      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `report_${reportType}_${format(new Date(), 'yyyyMMdd')}.${formatType.toLowerCase()}`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      // Record in export history
      const approxSize =
        blob.size > 1024 * 1024
          ? `${(blob.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(blob.size / 1024)} KB`;

      setExportHistory((prev) => [
        {
          id: `exp-${Date.now()}`,
          name: filename.substring(0, filename.lastIndexOf('.')) || filename,
          type: reportType,
          date: new Date(),
          size: approxSize,
          format: formatType,
        },
        ...prev,
      ]);

      toast.success('Report generated successfully');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-7xl animate-fade-in p-4 pb-24 md:p-8 space-y-8">
      {/* Clean Slate Typography Headline */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#B5121B] dark:text-red-400 mb-1">
          <FileBarChart className="h-3.5 w-3.5" />
          Analytics &amp; Compliance Exports
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Data Exports &amp; Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
          Generate audit-ready telemetry summaries, inspect supervisor QA work orders, and download compliance packages.
        </p>
      </div>

      {/* Top Action & Filter Bar (Report Builder) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Report Builder &amp; Data Export
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select telemetry scope, configure parameters, and download formatted audit packages
              </p>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:block">
            Format: <span className="font-bold text-slate-900 dark:text-slate-100">{formatType}</span> · Scope: <span className="font-bold text-slate-900 dark:text-slate-100">{resolvedRange.from} to {resolvedRange.to}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 items-end">
          {/* Col 1: Report Type (lg:col-span-4) */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Report Type
            </label>
            <select
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              value={reportType}
              onChange={(event) =>
                setReportType(event.target.value as ReportType)
              }
            >
              {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1">
              {REPORT_TYPE_OPTIONS.find((o) => o.value === reportType)?.desc}
            </p>
          </div>

          {/* Col 2: Date Range (lg:col-span-3) */}
          <div className="lg:col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              {usesExplicitRange ? 'Audit Date Range' : 'Time Period'}
            </label>
            {usesExplicitRange ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-[#B5121B] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={customRange.from}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                />
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-[#B5121B] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={customRange.to}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                />
              </div>
            ) : (
              <select
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={dateRange}
                onChange={(event) =>
                  setDateRange(event.target.value as DateRangeOption)
                }
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {hasInvalidDateRange && (
              <p className="mt-1 text-[11px] text-rose-500 font-medium">
                End date must be on or after start date.
              </p>
            )}
          </div>

          {/* Col 3: Export Format (lg:col-span-2) */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['PDF', 'CSV', 'JSON'] as ExportFormat[]).map((fmt) => {
                const isSelected = formatType === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormatType(fmt)}
                    className={`tactile-btn flex items-center justify-center py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[#B5121B] bg-red-50 text-[#B5121B] dark:border-red-500 dark:bg-red-950/60 dark:text-red-300 shadow-xs'
                        : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300'
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Col 4: Primary Generate & Download Button (lg:col-span-3) */}
          <div className="lg:col-span-3">
            <button
              type="button"
              className="tactile-btn flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#B5121B] py-2.5 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none focus:ring-2 focus:ring-[#B5121B]/40 active:translate-y-0.5 disabled:opacity-50"
              onClick={handleGenerate}
              disabled={isGenerating || hasInvalidDateRange}
              data-loading={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  <span>Generating File...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Generate &amp; Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Full-Width Data Canvas */}
      <div>
        {isSupervisorAuditReport ? (
          <SupervisorAuditReport
            approvalRate={supervisorAuditSummary.approvalRate}
            approvedCount={supervisorAuditSummary.approvedCount}
            complianceRate={supervisorAuditSummary.complianceRate}
            error={tasksError}
            flaggedCount={supervisorAuditSummary.flaggedCount}
            loading={tasksLoading || personnelLoading}
            onExportCsv={handleExportSupervisorAuditCsv}
            pendingAuditCount={supervisorAuditSummary.pendingAuditCount}
            resolveAssignedName={resolveAssignedName}
            tasks={supervisorAuditSummary.completedTasks}
            totalSubmissions={supervisorAuditSummary.totalSubmissions}
          />
        ) : isMaintenanceTaskReport ? (
          <MaintenanceTaskReport
            averageCompletionMinutes={taskSummary.averageCompletionMinutes}
            averageResponseMinutes={taskSummary.averageResponseMinutes}
            error={tasksError}
            loading={tasksLoading || personnelLoading}
            onExportCsv={handleExportMaintenanceCsv}
            pendingNow={taskSummary.pendingNow}
            resolveAssignedName={resolveAssignedName}
            tasks={tasks}
            totalTasks={taskSummary.totalTasks}
          />
        ) : (
          <RecentExportsHistory
            reports={exportHistory}
            onQuickDownload={(report) => {
              toast.success(`Downloading ${report.name}.${report.format.toLowerCase()}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

function MaintenanceTaskReport({
  averageCompletionMinutes,
  averageResponseMinutes,
  error,
  loading,
  onExportCsv,
  pendingNow,
  resolveAssignedName,
  tasks,
  totalTasks,
}: {
  averageCompletionMinutes: number | null;
  averageResponseMinutes: number | null;
  error: string | null;
  loading: boolean;
  onExportCsv: () => void;
  pendingNow: number;
  resolveAssignedName: (assignedUserId?: string | null) => string;
  tasks: Task[];
  totalTasks: number;
}) {
  return (
    <div className="space-y-6">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Layers className="h-4 w-4 text-slate-500" />}
          label="Total Tasks"
          sublabel="All Time Logged"
          loading={loading}
          value={String(totalTasks)}
        />
        <SummaryCard
          icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
          label="Pending Dispatch"
          sublabel="Awaiting Tech Action"
          loading={loading}
          value={String(pendingNow)}
        />
        <SummaryCard
          icon={<Timer className="h-4 w-4 text-sky-500" />}
          label="Average Response"
          sublabel="Dispatch to Ack"
          loading={loading}
          value={formatAverageMinutes(averageResponseMinutes)}
        />
        <SummaryCard
          icon={<Hourglass className="h-4 w-4 text-emerald-500" />}
          label="Average Completion"
          sublabel="Dispatch to Resolution"
          loading={loading}
          value={formatAverageMinutes(averageCompletionMinutes)}
        />
      </div>

      {/* Task Audit Log Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Maintenance Work Orders
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Historical dispatch records and resolution timestamps
              </p>
            </div>
          </div>

          <button
            type="button"
            className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            onClick={onExportCsv}
            disabled={loading}
          >
            <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            Export CSV
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
              ></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No maintenance work orders found
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              New maintenance dispatch tickets will appear in this audit log.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Trigger</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Facility / Stall</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Assigned Tech</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Created</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tasks.map((task) => {
                  const loc = resolveTaskLocation(task);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(task.status)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                        {TRIGGER_LABELS[task.triggerType]}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {loc.displayName}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                          {task.deviceId} · <span className="text-slate-600 dark:text-slate-300 font-sans">{loc.floor}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">
                        {resolveAssignedName(task.assignedTo)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {formatTaskTimestamp(task.createdAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {formatTaskTimestamp(task.completedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  sublabel,
  loading,
  value,
}: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all">
      {loading ? (
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
          <div className="h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {icon}
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-normal">
              {label}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {value}
            </p>
            {sublabel && (
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {sublabel}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RecentExportsHistory({
  reports,
  onQuickDownload,
}: {
  reports: ExportRecord[];
  onQuickDownload: (report: ExportRecord) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Recent Exports History
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Download history and generated snapshot logs
            </p>
          </div>
        </div>

        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 tabular-nums">
          {reports.length} records
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No exported reports yet
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Use the Report Builder above to create and export telemetry records.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Report File</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Generated</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Format</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Size</th>
                <th className="py-3 px-4 text-right font-bold uppercase tracking-wider text-[10px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {report.name}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {report.type.replaceAll('_', ' ')}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {format(report.date, 'MMM dd, yyyy')}
                    <div className="text-[10px] text-slate-400">
                      {format(report.date, 'HH:mm')}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${
                        report.format === 'PDF'
                          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          : report.format === 'CSV'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {report.format}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {report.size}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/50 transition-colors"
                      onClick={() => onQuickDownload(report)}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormatIcon({
  fmt,
  className,
}: {
  fmt: ExportFormat;
  className?: string;
}) {
  switch (fmt) {
    case 'CSV':
      return <FileSpreadsheet className={className} />;
    case 'JSON':
      return <FileJson className={className} />;
    case 'PDF':
    default:
      return <FileText className={className} />;
  }
}

type QAFilterTab = 'all' | 'pending' | 'approved' | 'flagged';

function SupervisorAuditReport({
  approvalRate,
  approvedCount,
  complianceRate,
  error,
  flaggedCount,
  loading,
  onExportCsv,
  pendingAuditCount,
  resolveAssignedName,
  tasks,
  totalSubmissions,
}: {
  approvalRate: string;
  approvedCount: number;
  complianceRate: string;
  error: string | null;
  flaggedCount: number;
  loading: boolean;
  onExportCsv: () => void;
  pendingAuditCount: number;
  resolveAssignedName: (assignedUserId?: string | null) => string;
  tasks: Task[];
  totalSubmissions: number;
}) {
  const [activeTab, setActiveTab] = useState<QAFilterTab>('all');

  const filteredTasks = useMemo(() => {
    if (activeTab === 'approved') {
      return tasks.filter((t) => t.inspectionStatus === 'approved');
    }
    if (activeTab === 'flagged') {
      return tasks.filter(
        (t) => t.inspectionStatus === 'flagged' || t.status === 'flagged',
      );
    }
    if (activeTab === 'pending') {
      return tasks.filter(
        (t) => !t.inspectionStatus || t.inspectionStatus === 'pending_review',
      );
    }
    return tasks;
  }, [tasks, activeTab]);

  return (
    <div className="space-y-6">
      {/* 4 QA Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Layers className="h-4 w-4 text-slate-600 dark:text-slate-300" />}
          label="Total Submissions"
          sublabel="Completed Work Orders"
          loading={loading}
          value={String(totalSubmissions)}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Approved Tasks"
          sublabel="Passed Inspection"
          loading={loading}
          value={String(approvedCount)}
        />
        <SummaryCard
          icon={<AlertCircle className="h-4 w-4 text-rose-500" />}
          label="Flagged / Recheck"
          sublabel="Requires Rework"
          loading={loading}
          value={String(flaggedCount)}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4 text-sky-500" />}
          label="Supervisor Approval Rate"
          sublabel={`${approvedCount} of ${approvedCount + flaggedCount} Audited`}
          loading={loading}
          value={approvalRate}
        />
      </div>

      {/* Compliance Rate Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4.5 dark:border-sky-950 dark:bg-sky-950/30">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-sky-950 dark:text-sky-100 flex items-center gap-2">
              <span>Supervisor Audit Compliance: {complianceRate}</span>
              <span className="inline-flex items-center rounded-full bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:text-sky-200">
                {totalSubmissions - pendingAuditCount} / {totalSubmissions} Inspected
              </span>
            </div>
            <div className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
              {pendingAuditCount > 0
                ? `${pendingAuditCount} completed work order(s) currently awaiting supervisor QA review.`
                : 'All maintenance submissions have been audited and verified.'}
            </div>
          </div>
        </div>
      </div>

      {/* QA Audit Matrix Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Supervisor QA Audit &amp; Inspection Log
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Maintenance submissions aligned with supervisor approvals, rechecks, and remarks
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Filter Tabs (Zero-Scroll triage) */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All ({totalSubmissions})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'pending'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <span>⏳ Pending</span>
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {pendingAuditCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('approved')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'approved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10'
                }`}
              >
                <span>✓ Approved</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {approvedCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('flagged')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'flagged'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 dark:text-rose-300 hover:bg-rose-500/10'
                }`}
              >
                <span>⚠️ Flagged</span>
                <span className="rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {flaggedCount}
                </span>
              </button>
            </div>

            <button
              type="button"
              className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              onClick={onExportCsv}
              disabled={loading}
            >
              <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              Export Audit CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
              ></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {activeTab === 'all'
                ? 'No completed maintenance submissions found'
                : `No work orders currently in "${activeTab}" status`}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Technician completed work orders will appear here for QA auditing.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">QA Status</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Restroom &amp; Location</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Technician</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Audited By</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Flag Reason / Remarks</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((task) => {
                  const loc = resolveTaskLocation(task);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getInspectionBadge(task.inspectionStatus ?? (task.status === 'flagged' ? 'flagged' : 'pending_review'))}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {loc.displayName}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                          {task.deviceId} · <span className="text-slate-600 dark:text-slate-300 font-sans">{loc.floor}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">
                        {resolveAssignedName(task.assignedTo)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {task.inspectedByName || (task.inspectedBy ? 'Supervisor' : '—')}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        {task.flagReason ? (
                          <div className="rounded-lg bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-[11px] font-medium border border-rose-200 dark:border-rose-900/50 flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                            <span>{task.flagReason}</span>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[11px] italic">
                            {task.remarks || 'Standard completion'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {formatTaskTimestamp(task.completedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
