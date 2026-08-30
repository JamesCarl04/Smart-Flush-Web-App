'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  format,
  endOfMonth,
  startOfMonth,
  subDays,
  subMonths,
  parseISO,
} from 'date-fns';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Droplets,
  FileBarChart,
  FileX,
  History,
  Hourglass,
  Layers,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Waves,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useTasks } from '@/hooks/useTasks';
import { useAnalytics } from '@/hooks/useAnalytics';
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
  csvContent?: string;
}

const REPORT_TYPE_OPTIONS: { label: string; value: ReportType; desc: string }[] = [
  {
    label: 'Usage Summary',
    value: 'usage_summary',
    desc: 'Summary of total flushes, water saved, and cleaning cycles.',
  },
  {
    label: 'Daily Audit Report',
    value: 'daily',
    desc: 'Hourly restroom usage and activity breakdown for today.',
  },
  {
    label: 'Weekly Performance',
    value: 'weekly',
    desc: '7-day overview of restroom usage and disinfection performance.',
  },
  {
    label: 'Monthly Executive Summary',
    value: 'monthly',
    desc: 'Monthly facility summary of restroom usage and water conservation.',
  },
  {
    label: 'Custom Range Audit',
    value: 'custom',
    desc: 'Choose specific start and end dates for your report.',
  },
  {
    label: 'Maintenance Task Report',
    value: 'maintenance_tasks',
    desc: 'Maintenance work order history, response times, and assigned staff.',
  },
  {
    label: 'Supervisor QA & Approval Audit',
    value: 'supervisor_audit',
    desc: 'Supervisor inspection logs, verification rates, and follow-up reviews.',
  },
];

const RANGE_OPTIONS: { label: string; value: DateRangeOption }[] = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
];

const TRIGGER_LABELS: Record<TaskTriggerType, string> = {
  manual: 'Manual Request',
  uv_complete: 'UV Cleaning Check',
  flush_count: 'High Usage Check',
  maintenance: 'Scheduled Maintenance',
  hardware_failure: 'Hardware Alert',
  sensor_fault: 'Sensor Issue',
  water_overuse: 'High Water Usage',
  water_no_flow: 'No Water After Flush',
};

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case 'acknowledged':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Acknowledged
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Completed
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          Flagged (Recheck)
        </span>
      );
    case 'rechecking':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Rechecking
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Pending
        </span>
      );
  }
}

function getInspectionBadge(inspectionStatus?: string | null) {
  switch (inspectionStatus) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Approved
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
          <AlertCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          Flagged
        </span>
      );
    case 'pending_review':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
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
  const [singleDate, setSingleDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  );
  const [customRange, setCustomRange] = useState(() => ({
    from: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  }));
  const [isGenerating, setIsGenerating] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState('');
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
      name: 'Restroom_Usage_Audit_Q3',
      type: 'custom',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      size: '1.1 MB',
      format: 'JSON',
    },
  ]);

  const isMaintenanceTaskReport = reportType === 'maintenance_tasks';
  const isSupervisorAuditReport = reportType === 'supervisor_audit';
  const isDailyReport = reportType === 'daily';
  const isMonthlyReport = reportType === 'monthly';
  const usesExplicitRange =
    reportType === 'custom' ||
    isMaintenanceTaskReport ||
    isSupervisorAuditReport;
  const hasInvalidDateRange =
    usesExplicitRange && customRange.from > customRange.to;

  const resolvedRange = useMemo(() => {
    if (isDailyReport) {
      return { from: singleDate, to: singleDate };
    }

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
  }, [customRange, dateRange, isDailyReport, singleDate, usesExplicitRange]);

  // Analytics query for telemetry reports
  const analyticsDateRange = useMemo(() => {
    const fromDate = parseISO(`${resolvedRange.from}T00:00:00`);
    const toDate = parseISO(`${resolvedRange.to}T23:59:59`);
    return {
      from: Number.isNaN(fromDate.getTime()) ? subDays(new Date(), 6) : fromDate,
      to: Number.isNaN(toDate.getTime()) ? new Date() : toDate,
    };
  }, [resolvedRange]);

  const {
    data: analyticsData,
    loading: analyticsLoading,
  } = useAnalytics(analyticsDateRange);

  // Synchronize Tasks to the active date filter
  const filteredTasks = useMemo(() => {
    const fromMillis = new Date(`${resolvedRange.from}T00:00:00+08:00`).getTime();
    const toMillis = new Date(`${resolvedRange.to}T23:59:59.999+08:00`).getTime();

    return tasks.filter((t) => {
      const primaryTs = t.completedAt || t.createdAt;
      if (!primaryTs) return true;
      return primaryTs >= fromMillis && primaryTs <= toMillis;
    });
  }, [tasks, resolvedRange]);

  const resolveAssignedName = (assignedUserId?: string | null) => {
    if (!assignedUserId) {
      return 'Unassigned';
    }
    return personnelById[assignedUserId]?.displayName ?? assignedUserId;
  };

  const taskSummary = useMemo(() => {
    const pendingFiltered = filteredTasks.filter((t) => t.status === 'pending').length;
    return {
      totalTasks: filteredTasks.length,
      pendingNow: pendingFiltered,
      averageResponseMinutes: averageMinutes(filteredTasks, 'acknowledgedAt'),
      averageCompletionMinutes: averageMinutes(filteredTasks, 'completedAt'),
    };
  }, [filteredTasks]);

  const supervisorAuditSummary = useMemo(() => {
    const completedTasks = filteredTasks.filter(
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

    const auditedCount = approvedCount + flaggedCount;
    const pendingAuditCount = Math.max(0, totalSubmissions - auditedCount);
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
  }, [filteredTasks]);

  // Telemetry Conservation Calculations
  const telemetrySummary = useMemo(() => {
    const flushes = analyticsData?.summary.totalFlushes ?? 0;
    const waterLiters = analyticsData?.summary.totalWater ?? 0;
    const baselineWater = flushes * 6.0;
    const waterSaved = Math.max(0, baselineWater - waterLiters);
    const conservationRate =
      baselineWater > 0 ? Math.round((waterSaved / baselineWater) * 100) : 0;
    const uvRate = analyticsData?.summary.uvCompletion ?? null;
    const uptime = analyticsData?.summary.systemUptime ?? 99.5;

    return {
      flushes,
      waterLiters: Math.round(waterLiters * 10) / 10,
      baselineWater: Math.round(baselineWater * 10) / 10,
      waterSaved: Math.round(waterSaved * 10) / 10,
      conservationRate,
      uvRate: uvRate !== null ? `${uvRate.toFixed(1)}%` : '100%',
      uptime: `${uptime.toFixed(1)}%`,
    };
  }, [analyticsData]);

  const handleExportMaintenanceCsv = () => {
    if (!user) {
      toast.error('You must be logged in to export reports.');
      return;
    }

    const csv = buildMaintenanceTasksCsv(filteredTasks, resolveAssignedName);
    const filename = `smart-flush-maintenance-tasks-${resolvedRange.from}-to-${resolvedRange.to}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8');

    setExportHistory((prev) => [
      {
        id: `exp-${Date.now()}`,
        name: filename.replace('.csv', ''),
        type: 'maintenance_tasks',
        date: new Date(),
        size: `${Math.max(1, Math.round(csv.length / 1024))} KB`,
        format: 'CSV',
        csvContent: csv,
      },
      ...prev,
    ]);

    setSrAnnouncement('Maintenance task CSV exported successfully.');
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
    const filename = `smart-flush-supervisor-qa-audit-${resolvedRange.from}-to-${resolvedRange.to}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8');

    setExportHistory((prev) => [
      {
        id: `exp-${Date.now()}`,
        name: filename.replace('.csv', ''),
        type: 'supervisor_audit',
        date: new Date(),
        size: `${Math.max(1, Math.round(csv.length / 1024))} KB`,
        format: 'CSV',
        csvContent: csv,
      },
      ...prev,
    ]);

    setSrAnnouncement('Supervisor QA audit CSV exported successfully.');
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
    setSrAnnouncement('Generating report package, please wait...');

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
      let filename = `report_${reportType}_${resolvedRange.from}_${resolvedRange.to}.${formatType.toLowerCase()}`;
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

      setSrAnnouncement(`Report ${filename} generated and downloaded successfully.`);
      toast.success('Report generated successfully');
    } catch (error) {
      const msg = getErrorMessage(error) ?? 'Failed to generate report';
      setSrAnnouncement(`Error generating report: ${msg}`);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleQuickDownload = (report: ExportRecord) => {
    if (report.csvContent) {
      downloadTextFile(
        report.csvContent,
        `${report.name}.csv`,
        'text/csv;charset=utf-8',
      );
      toast.success(`Downloaded ${report.name}.csv`);
      return;
    }
    toast.success(`Re-downloading ${report.name}.${report.format.toLowerCase()}`);
    handleGenerate();
  };

  return (
    <div className="container mx-auto max-w-7xl animate-fade-in p-4 pb-24 md:p-8 space-y-8 print:p-0 print:m-0 print:space-y-4">
      {/* Screen Reader Live Region (WCAG AA) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {srAnnouncement}
      </div>

      {/* Clean Slate Typography Headline (Hidden in Print) */}
      <div className="print:hidden">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Restroom Reports &amp; Exports
        </h1>
        <span className="sr-only">
          Generate and download usage summaries, maintenance records, and inspection logs for SDCA Annex restrooms.
        </span>
      </div>

      {/* Top Action & Filter Bar (Design 3's Secondary Context Tier) */}
      <section
        aria-labelledby="report-builder-heading"
        className="rounded-[14px] border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 print:hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="report-builder-heading"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Report Builder &amp; Data Export
              </h2>
              <span className="sr-only">
                Choose your report type and date range, then download your report
              </span>
            </div>
          </div>

          {/* 0.5s Glanceability Scope Indicator */}
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700">
            <span>Format:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 uppercase font-mono">{formatType}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>Period:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
              {resolvedRange.from} {resolvedRange.from !== resolvedRange.to && `to ${resolvedRange.to}`}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 items-end">
          {/* Col 1: Report Type (lg:col-span-4) */}
          <div className="lg:col-span-4">
            <label
              htmlFor="report-type-select"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2"
            >
              Report Type
            </label>
            <select
              id="report-type-select"
              aria-describedby="report-type-desc"
              className="w-full min-h-[44px] rounded-[10px] border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
            <span id="report-type-desc" className="sr-only">
              {REPORT_TYPE_OPTIONS.find((o) => o.value === reportType)?.desc}
            </span>
          </div>

          {/* Col 2: Adaptive Date Scope (lg:col-span-3) */}
          <div className="lg:col-span-3">
            <label
              htmlFor={
                isDailyReport
                  ? 'audit-date-single'
                  : usesExplicitRange
                    ? 'range-date-from'
                    : 'date-range-preset'
              }
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2"
            >
              {isDailyReport
                ? 'Report Date (Day)'
                : isMonthlyReport
                  ? 'Month'
                  : usesExplicitRange
                    ? 'Date Range'
                    : 'Time Period'}
            </label>

            {isDailyReport ? (
              <input
                id="audit-date-single"
                type="date"
                className="w-full min-h-[44px] rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                aria-label="Select audit day"
              />
            ) : usesExplicitRange ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="range-date-from"
                  type="date"
                  className="w-full min-h-[44px] rounded-[10px] border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={customRange.from}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  aria-label="Start date"
                />
                <input
                  id="range-date-to"
                  type="date"
                  className="w-full min-h-[44px] rounded-[10px] border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={customRange.to}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  aria-label="End date"
                />
              </div>
            ) : (
              <select
                id="date-range-preset"
                className="w-full min-h-[44px] rounded-[10px] border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
              <p className="mt-1 text-[11px] text-rose-600 font-semibold" role="alert">
                End date must be on or after start date.
              </p>
            )}
          </div>

          {/* Col 3: Export Format Chips (lg:col-span-2) */}
          <div className="lg:col-span-2">
            <span
              id="export-format-label"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2"
            >
              Export Format
            </span>
            <div
              role="radiogroup"
              aria-labelledby="export-format-label"
              className="grid grid-cols-3 gap-1.5"
            >
              {(['PDF', 'CSV', 'JSON'] as ExportFormat[]).map((fmt) => {
                const isSelected = formatType === fmt;
                return (
                  <button
                    key={fmt}
                    id={`format-btn-${fmt.toLowerCase()}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setFormatType(fmt)}
                    className={`tactile-btn flex min-h-[44px] items-center justify-center py-2 px-1 text-xs font-bold rounded-[8px] border transition-all focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none ${
                      isSelected
                        ? 'border-[#B5121B] bg-red-50 text-[#B5121B] dark:border-red-500 dark:bg-red-950/70 dark:text-red-300 shadow-xs'
                        : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Col 4: Action Buttons (Solid Loading State per Design 3's) */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <button
              id="generate-report-btn"
              type="button"
              className={`tactile-btn flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#B5121B] py-2.5 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:focus-visible:ring-red-400 focus:outline-none active:translate-y-0.5 ${
                isGenerating ? 'cursor-wait bg-[#B5121B]' : ''
              }`}
              onClick={handleGenerate}
              disabled={isGenerating || hasInvalidDateRange}
              aria-busy={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  ></span>
                  <span className="truncate text-white font-bold">Generating...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Generate &amp; Download</span>
                </>
              )}
            </button>

            <button
              id="print-report-btn"
              type="button"
              className="tactile-btn flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 py-2.5 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus:outline-none active:translate-y-0.5"
              onClick={handlePrint}
              title="Print official audit summary"
              aria-label="Print official report summary"
            >
              <Printer className="h-4 w-4 shrink-0 text-[#B5121B] dark:text-red-400" aria-hidden="true" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Full-Width Data Canvas (Design 3's Primary Focal Tier - 70%) */}
      <div>
        {/* Official Header for Print Only */}
        <PrintReportHeader
          reportType={reportType}
          resolvedRange={resolvedRange}
          userDisplayName={user?.displayName || user?.email || 'Operations Supervisor'}
        />

        {/* Primary View Router */}
        {isSupervisorAuditReport ? (
          <SupervisorAuditReport
            approvalRate={supervisorAuditSummary.approvalRate}
            approvedCount={supervisorAuditSummary.approvedCount}
            complianceRate={supervisorAuditSummary.complianceRate}
            error={tasksError}
            flaggedCount={supervisorAuditSummary.flaggedCount}
            loading={tasksLoading || personnelLoading}
            onExportCsv={handleExportSupervisorAuditCsv}
            onPrint={handlePrint}
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
            onPrint={handlePrint}
            pendingNow={taskSummary.pendingNow}
            resolveAssignedName={resolveAssignedName}
            tasks={filteredTasks}
            totalTasks={taskSummary.totalTasks}
          />
        ) : isDailyReport ? (
          <DailyAuditReportCanvas
            date={singleDate}
            telemetry={telemetrySummary}
            analyticsData={analyticsData}
            loading={analyticsLoading}
            onPrint={handlePrint}
            onGenerate={handleGenerate}
          />
        ) : (
          <UsageTelemetryReportCanvas
            reportType={reportType}
            range={resolvedRange}
            telemetry={telemetrySummary}
            loading={analyticsLoading}
            onPrint={handlePrint}
            onGenerate={handleGenerate}
          />
        )}

        {/* Recent Exports History Section */}
        <div className="mt-8">
          <RecentExportsHistory
            reports={exportHistory}
            onQuickDownload={handleQuickDownload}
          />
        </div>

        {/* Official QA / Facility Verification Sign-Off Block for Print */}
        <PrintSignOffSection />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Component: Daily Audit Report (Hour-by-Hour Telemetry)
// ─────────────────────────────────────────────────────────────────────────────
function DailyAuditReportCanvas({
  date,
  telemetry,
  analyticsData,
  loading,
  onPrint,
  onGenerate,
}: {
  date: string;
  telemetry: {
    flushes: number;
    waterLiters: number;
    waterSaved: number;
    conservationRate: number;
    uvRate: string;
    uptime: string;
  };
  analyticsData: any;
  loading: boolean;
  onPrint: () => void;
  onGenerate: () => void;
}) {
  const hourlyBins = useMemo(() => {
    const rawHourly = analyticsData?.charts?.hourlyUsage ?? [];
    const bins: Array<{ hour: string; count: number; volume: number }> = [];

    for (let h = 0; h < 24; h++) {
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      const match = rawHourly.find((item: any) => item.hour === hourStr);
      const count = match ? Number(match.count) : 0;
      const volume = Math.round(count * 2.1 * 10) / 10;
      bins.push({ hour: hourStr, count, volume });
    }
    return bins;
  }, [analyticsData]);

  const peakHour = useMemo(() => {
    let max = { hour: '—', count: 0 };
    for (const b of hourlyBins) {
      if (b.count > max.count) max = b;
    }
    return max;
  }, [hourlyBins]);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <SummaryCard
          icon={<Waves className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          label="Daily Flushes"
          sublabel={`Full 24h Cycle · ${date}`}
          loading={loading}
          value={String(telemetry.flushes)}
        />
        <SummaryCard
          icon={<Droplets className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
          label="Water Used"
          sublabel={`Conserved ${telemetry.waterSaved} L`}
          loading={loading}
          value={`${telemetry.waterLiters} L`}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          label="Disinfection Rate"
          sublabel="Automatic UV Cleaning"
          loading={loading}
          value={telemetry.uvRate}
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          label="Busiest Hour"
          sublabel={peakHour.count > 0 ? `${peakHour.count} flushes` : 'No flushes recorded'}
          loading={loading}
          value={peakHour.hour}
        />
      </div>

      {/* Hourly 24-Hour Telemetry Distribution Grid */}
      <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                Hourly Restroom Activity Breakdown
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                24-hour hourly usage logs for {date}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onPrint}
            >
              <Printer className="h-3.5 w-3.5 text-[#B5121B] dark:text-red-400" aria-hidden="true" />
              Print Audit
            </button>
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onGenerate}
            >
              <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Export
            </button>
          </div>
        </div>

        {/* 24-Hour Bins Table */}
        <div className="w-full overflow-x-auto print:overflow-visible">
          <table
            className="w-full text-left text-xs print:border-collapse print:text-black"
            aria-label="Hourly telemetry data"
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 print:bg-slate-100 print:text-black print:border-b-2 print:border-slate-400">
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Time Period</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Flush Count</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Water Used</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Traffic Level</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Restroom Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
              {hourlyBins.map((bin) => {
                const isPeak = bin.hour === peakHour.hour && bin.count > 0;
                return (
                  <tr
                    key={bin.hour}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 break-inside-avoid print:hover:bg-transparent ${
                      isPeak ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {bin.hour} – {bin.hour.slice(0, 2)}:59
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {bin.count} flushes
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {bin.volume} L
                    </td>
                    <td className="py-2.5 px-4">
                      {isPeak ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          Peak Hour
                        </span>
                      ) : bin.count > 10 ? (
                        <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                          Moderate
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-500 dark:text-slate-400">
                      {bin.count > 0 ? 'Active Restroom Traffic' : 'Idle / Standby'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Component: Usage Summary / Weekly / Monthly Executive Canvas
// ─────────────────────────────────────────────────────────────────────────────
function UsageTelemetryReportCanvas({
  reportType,
  range,
  telemetry,
  loading,
  onPrint,
  onGenerate,
}: {
  reportType: ReportType;
  range: { from: string; to: string };
  telemetry: {
    flushes: number;
    waterLiters: number;
    waterSaved: number;
    conservationRate: number;
    uvRate: string;
    uptime: string;
  };
  loading: boolean;
  onPrint: () => void;
  onGenerate: () => void;
}) {
  const isMonthly = reportType === 'monthly';
  const isWeekly = reportType === 'weekly';

  const title = isMonthly
    ? 'Monthly Executive Conservation Summary'
    : isWeekly
      ? 'Weekly Facility Performance & Hygiene Summary'
      : 'Overall Restroom Usage Summary';

  return (
    <div className="space-y-6 print:space-y-4">
      {/* 5 KPI Summary Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 print:grid-cols-5 print:gap-2">
        <SummaryCard
          icon={<Waves className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          label="Total Flushes"
          sublabel="Completed flushes"
          loading={loading}
          value={String(telemetry.flushes)}
        />
        <SummaryCard
          icon={<Droplets className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
          label="Water Used"
          sublabel="Total consumed"
          loading={loading}
          value={`${telemetry.waterLiters} L`}
        />
        <SummaryCard
          icon={<Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          label="Water Conserved"
          sublabel={`${telemetry.conservationRate}% vs 6.0L baseline`}
          loading={loading}
          value={`${telemetry.waterSaved} L`}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          label="Disinfection Rate"
          sublabel="UV Cleaning Status"
          loading={loading}
          value={telemetry.uvRate}
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
          label="System Reliability"
          sublabel="Target: 99.5%"
          loading={loading}
          value={telemetry.uptime}
        />
      </div>

      {/* Facility Breakdown & Efficiency Matrix */}
      <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                Report period: {range.from} to {range.to} · SDCA Annex Restroom Network
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onPrint}
            >
              <Printer className="h-3.5 w-3.5 text-[#B5121B] dark:text-red-400" aria-hidden="true" />
              Print Report
            </button>
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onGenerate}
            >
              <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Download Package
            </button>
          </div>
        </div>

        {/* Directory Matrix Table */}
        <div className="w-full overflow-x-auto print:overflow-visible">
          <table
            className="w-full text-left text-xs print:border-collapse print:text-black"
            aria-label="Restroom facility status"
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 print:bg-slate-100 print:text-black print:border-b-2 print:border-slate-400">
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Restroom Facility</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Location / Floor</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Unit ID</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Water Conserved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
              {Object.entries(DEVICE_FACILITY_DIRECTORY).slice(0, 8).map(([devId, info]) => (
                <tr
                  key={devId}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 break-inside-avoid print:hover:bg-transparent"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    {info.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {info.floor} · {info.building}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {devId}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Online &amp; Monitored
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {telemetry.conservationRate}% Conserved
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PrintReportHeader({
  reportType,
  resolvedRange,
  userDisplayName,
}: {
  reportType: ReportType;
  resolvedRange: { from: string; to: string };
  userDisplayName: string;
}) {
  const reportTitle =
    REPORT_TYPE_OPTIONS.find((o) => o.value === reportType)?.label ||
    'Restroom Usage & Audit Report';

  return (
    <header className="hidden print:block mb-6 border-b-2 border-slate-800 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#B5121B]">
            Klir · Smart Flush IoT Restroom Monitoring System
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-0.5">
            {reportTitle}
          </h1>
          <p className="text-xs text-slate-600 font-medium">
            Facility Operations &amp; Maintenance Inspection Summary
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-600 font-mono space-y-0.5">
          <div>
            <span className="font-bold text-slate-800">FACILITY:</span> SDCA Annex Building
          </div>
          <div>
            <span className="font-bold text-slate-800">PRINTED:</span> {format(new Date(), 'MMM dd, yyyy HH:mm')}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-[8px] border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-800">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Report Period
          </span>
          <span className="font-bold font-mono text-slate-900">
            {resolvedRange.from} &rarr; {resolvedRange.to}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Report Type
          </span>
          <span className="font-semibold text-slate-900 capitalize">
            {reportType.replaceAll('_', ' ')}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Generated By
          </span>
          <span className="font-semibold text-slate-900">{userDisplayName}</span>
        </div>
      </div>
    </header>
  );
}

function PrintSignOffSection() {
  return (
    <footer className="hidden print:block mt-8 pt-6 border-t-2 border-slate-300 break-inside-avoid text-xs text-slate-800">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-4">
        Official Facility Verification &amp; Quality Sign-Off
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="border border-slate-300 rounded-[8px] p-3 space-y-4 bg-slate-50/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Prepared By (Operations / Tech)
          </div>
          <div className="pt-6 border-b border-slate-400"></div>
          <div className="text-[11px] font-medium flex justify-between text-slate-600">
            <span>Signature / Name</span>
            <span>Date</span>
          </div>
        </div>

        <div className="border border-slate-300 rounded-[8px] p-3 space-y-4 bg-slate-50/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Inspected By (QA Supervisor)
          </div>
          <div className="pt-6 border-b border-slate-400"></div>
          <div className="text-[11px] font-medium flex justify-between text-slate-600">
            <span>Signature / Name</span>
            <span>Date</span>
          </div>
        </div>

        <div className="border border-slate-300 rounded-[8px] p-3 space-y-4 bg-slate-50/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Approved By (Facility Director)
          </div>
          <div className="pt-6 border-b border-slate-400"></div>
          <div className="text-[11px] font-medium flex justify-between text-slate-600">
            <span>Signature / Name</span>
            <span>Date</span>
          </div>
        </div>
      </div>
      <div className="mt-4 text-[10px] text-slate-400 text-center font-mono">
        This document was system-generated by Klir Smart Flush Restroom Monitoring Platform. Physical verification validates facility compliance.
      </div>
    </footer>
  );
}

function MaintenanceTaskReport({
  averageCompletionMinutes,
  averageResponseMinutes,
  error,
  loading,
  onExportCsv,
  onPrint,
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
  onPrint?: () => void;
  pendingNow: number;
  resolveAssignedName: (assignedUserId?: string | null) => string;
  tasks: Task[];
  totalTasks: number;
}) {
  return (
    <div className="space-y-6 print:space-y-4">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <SummaryCard
          icon={<Layers className="h-4 w-4 text-slate-500" />}
          label="Total Tasks"
          sublabel="In Scope Range"
          loading={loading}
          value={String(totalTasks)}
        />
        <SummaryCard
          icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
          label="Pending Tasks"
          sublabel="Awaiting Technician"
          loading={loading}
          value={String(pendingNow)}
        />
        <SummaryCard
          icon={<Timer className="h-4 w-4 text-sky-500" />}
          label="Avg. Response Time"
          sublabel="Time to Acknowledge"
          loading={loading}
          value={formatAverageMinutes(averageResponseMinutes)}
        />
        <SummaryCard
          icon={<Hourglass className="h-4 w-4 text-emerald-500" />}
          label="Avg. Completion Time"
          sublabel="Time to Resolve"
          loading={loading}
          value={formatAverageMinutes(averageCompletionMinutes)}
        />
      </div>

      {/* Task Audit Log Table */}
      <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden print:overflow-visible print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                Maintenance Work Orders
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                Work order history for the selected report period
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {onPrint && (
              <button
                type="button"
                className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
                onClick={onPrint}
                disabled={loading}
                title="Print this log"
              >
                <Printer className="h-3.5 w-3.5 text-[#B5121B] dark:text-red-400" aria-hidden="true" />
                Print Log
              </button>
            )}
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onExportCsv}
              disabled={loading}
            >
              <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-[10px] bg-slate-100 dark:bg-slate-800/60"
              ></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              No maintenance work orders found
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No tasks match the active date range. Try broadening the audit scope.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto print:overflow-visible">
            <table
              className="w-full text-left text-xs print:border-collapse print:text-black"
              aria-label="Maintenance tasks audit table"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 print:bg-slate-100 print:text-black print:border-b-2 print:border-slate-400">
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Trigger Reason</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Restroom Stall</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Assigned Technician</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Created</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                {tasks.map((task) => {
                  const loc = resolveTaskLocation(task);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 break-inside-avoid print:hover:bg-transparent">
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
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {formatTaskTimestamp(task.createdAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
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
    <div className="rounded-[14px] border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all print:border-slate-300 print:shadow-none print:bg-white print:p-3.5 print:text-black break-inside-avoid">
      {loading ? (
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
          <div className="h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 print:text-slate-700">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              {icon}
            </div>
            <span className="truncate">
              {label}
            </span>
          </div>
          <div className="mt-3 space-y-0.5">
            <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 print:text-black tabular-nums whitespace-nowrap">
              {value}
            </p>
            {sublabel && (
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-600 truncate leading-tight">
                {sublabel}
              </p>
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
    <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden print:overflow-visible print:border-slate-300 print:shadow-none">
      <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
            <History className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
              Recent Downloads
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
              Download history for this session
            </p>
          </div>
        </div>

        <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:border print:border-slate-300 print:text-black tabular-nums">
          {reports.length} records
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            No recent downloads yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Use the Report Builder above to generate and download reports.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto print:overflow-visible">
          <table
            className="w-full text-left text-xs print:border-collapse print:text-black"
            aria-label="Recent generated reports history"
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 print:bg-slate-100 print:text-black print:border-b-2 print:border-slate-400">
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Report File</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Generated</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Format</th>
                <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Size</th>
                <th scope="col" className="py-3 px-4 text-right font-bold uppercase tracking-wider text-[10px] print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 break-inside-avoid print:hover:bg-transparent">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-slate-100 print:text-black">
                      {report.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider print:text-slate-600">
                      {report.type.replaceAll('_', ' ')}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap print:text-black">
                    {format(report.date, 'MMM dd, yyyy')}
                    <div className="text-[10px] text-slate-400 print:text-slate-600">
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
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap print:text-black">
                    {report.size}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap print:hidden">
                    <button
                      type="button"
                      className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/50 transition-colors focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
                      onClick={() => onQuickDownload(report)}
                      aria-label={`Download report ${report.name}`}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
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

type QAFilterTab = 'all' | 'pending' | 'approved' | 'flagged';

function SupervisorAuditReport({
  approvalRate,
  approvedCount,
  complianceRate,
  error,
  flaggedCount,
  loading,
  onExportCsv,
  onPrint,
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
  onPrint?: () => void;
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
    <div className="space-y-6 print:space-y-4">
      {/* 4 QA Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-sky-200 bg-sky-50/70 p-4.5 dark:border-sky-950 dark:bg-sky-950/40 print:border-slate-300 print:bg-slate-50 print:p-3 break-inside-avoid">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-sky-600 text-white shadow-xs shrink-0 print:bg-slate-800">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-bold text-sky-950 dark:text-sky-100 print:text-black flex items-center gap-2">
              <span>Inspection Completion: {complianceRate}</span>
              <span className="inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:text-sky-200 print:border print:border-slate-400 print:text-black">
                {totalSubmissions - pendingAuditCount} / {totalSubmissions} Inspected
              </span>
            </div>
            <div className="text-xs text-sky-700 dark:text-sky-300 mt-0.5 print:text-slate-700">
              {pendingAuditCount > 0
                ? `${pendingAuditCount} completed work order(s) currently awaiting supervisor QA review.`
                : 'All maintenance submissions have been audited and verified.'}
            </div>
          </div>
        </div>
      </div>

      {/* QA Audit Matrix Table */}
      <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden print:overflow-visible print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800 print:border-slate-300 print:p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 print:bg-slate-200 print:text-black">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-black">
                Supervisor Inspection &amp; QA Log
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                Maintenance work orders verified by supervisors with inspection notes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {/* Quick Filter Tabs (Zero-Scroll triage) */}
            <div
              role="tablist"
              aria-label="Filter tasks by inspection status"
              className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-[10px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-[8px] transition-all focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All ({totalSubmissions})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pending'}
                onClick={() => setActiveTab('pending')}
                className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-[8px] transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none ${
                  activeTab === 'pending'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-amber-800 dark:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <span>Pending</span>
                <span className="rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {pendingAuditCount}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'approved'}
                onClick={() => setActiveTab('approved')}
                className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-[8px] transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none ${
                  activeTab === 'approved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10'
                }`}
              >
                <span>Approved</span>
                <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {approvedCount}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'flagged'}
                onClick={() => setActiveTab('flagged')}
                className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-[8px] transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none ${
                  activeTab === 'flagged'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-800 dark:text-rose-300 hover:bg-rose-500/10'
                }`}
              >
                <span>Flagged</span>
                <span className="rounded-md bg-rose-100 dark:bg-rose-900/50 text-rose-900 dark:text-rose-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {flaggedCount}
                </span>
              </button>
            </div>

            {onPrint && (
              <button
                type="button"
                className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
                onClick={onPrint}
                disabled={loading}
                title="Print this audit report"
              >
                <Printer className="h-3.5 w-3.5 text-[#B5121B] dark:text-red-400" aria-hidden="true" />
                Print Audit
              </button>
            )}

            <button
              type="button"
              className="tactile-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#B5121B] focus:outline-none"
              onClick={onExportCsv}
              disabled={loading}
            >
              <Download className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Export Audit CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-[10px] bg-slate-100 dark:bg-slate-800/60"
              ></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <FileX className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {activeTab === 'all'
                ? 'No completed maintenance submissions found'
                : `No work orders currently in "${activeTab}" status`}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Technician work orders in the selected date range will appear here for auditing.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto print:overflow-visible">
            <table
              className="w-full text-left text-xs print:border-collapse print:text-black"
              aria-label="Supervisor QA audit log"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 print:bg-slate-100 print:text-black print:border-b-2 print:border-slate-400">
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Inspection Status</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Restroom Location</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Technician</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Inspected By</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Supervisor Remarks</th>
                  <th scope="col" className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Completed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                {filteredTasks.map((task) => {
                  const loc = resolveTaskLocation(task);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 break-inside-avoid print:hover:bg-transparent">
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
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300 font-medium">
                        {task.inspectedByName || (task.inspectedBy ? 'Supervisor' : '—')}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        {task.flagReason ? (
                          <div className="rounded-md bg-rose-50 p-2 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 text-[11px] font-medium border border-rose-200 dark:border-rose-900/50 flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                            <span>{task.flagReason}</span>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[11px] italic">
                            {task.remarks || 'Standard completion verified'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
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
