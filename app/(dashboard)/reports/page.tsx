'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { format, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  Clock,
  Download,
  FileBarChart,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileX,
  Hourglass,
  Timer,
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
  | 'maintenance_tasks';
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
  | 'maintenance_tasks';

const REPORT_TYPE_OPTIONS: { label: string; value: ReportType }[] = [
  { label: 'Usage Summary', value: 'usage_summary' },
  { label: 'Daily Report', value: 'daily' },
  { label: 'Weekly Report', value: 'weekly' },
  { label: 'Monthly Report', value: 'monthly' },
  { label: 'Custom Range', value: 'custom' },
  { label: 'Maintenance Task Report', value: 'maintenance_tasks' },
];

const RANGE_OPTIONS: { label: string; value: DateRangeOption }[] = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
];

const TRIGGER_LABELS: Record<TaskTriggerType, string> = {
  manual: 'Manual',
  hardware_failure: 'Hardware Failure',
  maintenance: 'Maintenance',
};

function getStatusBadgeClassName(status: TaskStatus): string {
  switch (status) {
    case 'acknowledged':
      return 'badge-info text-info-content';
    case 'completed':
      return 'badge-success text-success-content';
    case 'unassigned':
    case 'assigned':
    case 'reassignment_needed':
    case 'flagged':
    default:
      return 'badge-warning text-warning-content';
  }
}

function formatTaskTimestamp(value?: number | null): string {
  if (!value) {
    return 'Not recorded';
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

  const recentReports: {
    id: string;
    name: string;
    type: string;
    date: Date;
    size: string;
    format: string;
  }[] = [];
  const isMaintenanceTaskReport = reportType === 'maintenance_tasks';
  const usesExplicitRange = reportType === 'custom' || isMaintenanceTaskReport;
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

  const handleExportMaintenanceCsv = () => {
    if (!user) {
      toast.error('You must be logged in to export reports.');
      return;
    }

    const csv = buildMaintenanceTasksCsv(tasks, resolveAssignedName);
    const generatedAt = format(new Date(), 'yyyy-MM-dd-HHmm');
    downloadTextFile(
      csv,
      `smart-flush-maintenance-tasks-${generatedAt}.csv`,
      'text/csv;charset=utf-8',
    );
    toast.success('Maintenance task CSV exported');
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
      let filename = `report.${formatType.toLowerCase()}`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Report generated successfully');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container relative mx-auto max-w-7xl animate-fade-in p-4 pb-20 md:p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
          <FileBarChart className="h-8 w-8 text-primary" />
          Data Exports & Reports
        </h1>
        <p className="mt-2 text-base-content/60">
          Generate tailored analytics reports and download historical system
          logs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="self-start overflow-hidden rounded-lg border border-base-200 bg-base-100 shadow-xl lg:col-span-1">
          <div className="border-b border-base-300 bg-base-200 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
              <Download className="h-5 w-5" />
              Report Builder
            </h2>
          </div>

          <div className="space-y-6 p-6">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium text-base-content/80">
                  Report Type
                </span>
              </label>
              <select
                className="select select-bordered w-full"
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
            </div>

            {usesExplicitRange ? (
              <div className="space-y-4 rounded-lg border border-base-200 bg-base-200/30 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  {isMaintenanceTaskReport ? 'Task Date Range' : 'Custom Range'}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text font-medium text-base-content/80">
                        From Date
                      </span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered w-full"
                      value={customRange.from}
                      onChange={(event) =>
                        setCustomRange((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text font-medium text-base-content/80">
                        To Date
                      </span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered w-full"
                      value={customRange.to}
                      onChange={(event) =>
                        setCustomRange((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-medium text-base-content/80">
                    Date Range
                  </span>
                </label>
                <select
                  className="select select-bordered w-full"
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
              </div>
            )}

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium text-base-content/80">
                  Export Format
                </span>
              </label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(['PDF', 'CSV', 'JSON'] as ExportFormat[]).map(
                  (formatOption) => {
                    const isSelected = formatType === formatOption;
                    return (
                      <button
                        key={formatOption}
                        className={`btn h-12 border-base-300 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          isSelected
                            ? 'btn-primary text-primary-content'
                            : 'bg-base-100 text-base-content hover:bg-base-200'
                        }`}
                        onClick={() => setFormatType(formatOption)}
                        type="button"
                      >
                        <span className="flex flex-col items-center justify-center gap-1">
                          <FormatIcon fmt={formatOption} className="h-4 w-4" />
                          <span className="text-[10px]">{formatOption}</span>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                className="btn btn-primary h-12 w-full shadow-lg"
                onClick={handleGenerate}
                disabled={isGenerating || hasInvalidDateRange}
              >
                {isGenerating ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Generating File...
                  </>
                ) : (
                  <>
                    <Download className="mr-1 h-5 w-5" />
                    Generate & Download
                  </>
                )}
              </button>
              <p className="mt-3 flex items-center justify-center gap-1 text-center text-xs text-base-content/40">
                <CheckCircle2 className="h-3 w-3 text-success" /> Generated on
                the server for your authenticated session
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {isMaintenanceTaskReport ? (
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
            <RecentExports reports={recentReports} />
          )}
        </div>
      </div>

      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<FileText className="h-5 w-5" />}
          label="Total Tasks Assigned"
          loading={loading}
          value={String(totalTasks)}
        />
        <SummaryCard
          icon={<AlertCircle className="h-5 w-5" />}
          label="Pending Now"
          loading={loading}
          value={String(pendingNow)}
        />
        <SummaryCard
          icon={<Timer className="h-5 w-5" />}
          label="Avg Response Time"
          loading={loading}
          value={formatAverageMinutes(averageResponseMinutes)}
        />
        <SummaryCard
          icon={<Hourglass className="h-5 w-5" />}
          label="Avg Completion Time"
          loading={loading}
          value={formatAverageMinutes(averageCompletionMinutes)}
        />
      </div>

      <div className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body p-0">
          <div className="flex flex-col gap-3 border-b border-base-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5 text-secondary" /> Maintenance Tasks
            </h2>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onExportCsv}
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="skeleton h-12 w-full"></div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-base-200 text-base-content/45">
                <FileX className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-base-content/70">
                No maintenance tasks yet.
              </p>
              <p className="mt-1 text-sm text-base-content/45">
                Assigned tasks will appear here as soon as they are created.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto pb-4">
              <table className="table table-zebra w-full">
                <thead>
                  <tr className="bg-base-200/50">
                    <th>Status</th>
                    <th>Trigger</th>
                    <th>Task</th>
                    <th>Assigned To</th>
                    <th>Created</th>
                    <th>Acknowledged</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <span
                          className={`badge border-0 font-semibold ${getStatusBadgeClassName(
                            task.status,
                          )}`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {TRIGGER_LABELS[task.triggerType]}
                      </td>
                      <td className="min-w-64">
                        <div className="font-semibold">{task.deviceId}</div>
                        <div className="max-w-sm whitespace-normal text-sm text-base-content/65">
                          {task.message || 'No message provided'}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {resolveAssignedName(task.assignedTo)}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatTaskTimestamp(task.createdAt)}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatTaskTimestamp(task.acknowledgedAt)}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatTaskTimestamp(task.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  loading,
  value,
}: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-base-200 bg-base-100 p-5 shadow-xl">
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-5 w-24"></div>
          <div className="skeleton h-8 w-20"></div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <p className="text-sm text-base-content/60">{label}</p>
          <p className="mt-1 text-2xl font-bold text-base-content">{value}</p>
        </>
      )}
    </div>
  );
}

function RecentExports({
  reports,
}: {
  reports: {
    id: string;
    name: string;
    type: string;
    date: Date;
    size: string;
    format: string;
  }[];
}) {
  return (
    <div className="card border border-base-200 bg-base-100 shadow-xl">
      <div className="card-body p-0">
        <div className="flex items-center justify-between border-b border-base-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5 text-secondary" /> Recent Exports
          </h2>
        </div>

        {reports.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-base-200 text-base-content/45">
              <FileX className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-base-content/70">
              No reports generated yet.
            </p>
            <p className="mt-1 text-sm text-base-content/45">
              Generate a report above to see it here.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto pb-4">
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50">
                  <th className="font-medium text-base-content/60">
                    Report Name
                  </th>
                  <th className="font-medium text-base-content/60">
                    Generated
                  </th>
                  <th className="font-medium text-base-content/60">Format</th>
                  <th className="font-medium text-base-content/60">Size</th>
                  <th className="text-right font-medium text-base-content/60">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="hover">
                    <td>
                      <div className="font-semibold">{report.name}</div>
                      <div className="text-xs uppercase text-base-content/50">
                        {report.type.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="text-sm">
                      {format(report.date, 'MMM dd, yyyy')}
                      <div className="text-xs text-base-content/50">
                        {format(report.date, 'HH:mm')}
                      </div>
                    </td>
                    <td>
                      <div
                        className={`badge badge-sm font-medium ${
                          report.format === 'PDF'
                            ? 'badge-error badge-outline'
                            : report.format === 'CSV'
                              ? 'badge-success badge-outline'
                              : 'badge-warning badge-outline'
                        }`}
                      >
                        {report.format}
                      </div>
                    </td>
                    <td className="text-sm text-base-content/70">
                      {report.size}
                    </td>
                    <td className="text-right">
                      <button className="btn btn-ghost btn-sm text-primary">
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
