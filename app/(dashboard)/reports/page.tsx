'use client';

import { useMemo, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { format, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import {
  FileBarChart,
  Download,
  FileText,
  FileSpreadsheet,
  FileJson,
  Clock,
  CheckCircle2,
  CalendarRange,
  FileX,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/error-utils';

type ReportType = 'usage_summary' | 'daily' | 'weekly' | 'monthly' | 'custom';
type DateRangeOption =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month';
type ExportFormat = 'PDF' | 'CSV' | 'JSON';
type RequestReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

const REPORT_TYPE_OPTIONS: { label: string; value: ReportType }[] = [
  { label: 'Usage Summary', value: 'usage_summary' },
  { label: 'Daily Report', value: 'daily' },
  { label: 'Weekly Report', value: 'weekly' },
  { label: 'Monthly Report', value: 'monthly' },
  { label: 'Custom Range', value: 'custom' },
];

const RANGE_OPTIONS: { label: string; value: DateRangeOption }[] = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
];

export default function ReportsPage() {
  const { user } = useAuth();
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
  const isCustomRange = reportType === 'custom';
  const hasInvalidCustomRange =
    isCustomRange && customRange.from > customRange.to;

  const resolvedRange = useMemo(() => {
    if (isCustomRange) {
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
  }, [customRange, dateRange, isCustomRange]);

  const handleGenerate = async () => {
    if (!user) {
      toast.error('You must be logged in to generate reports.');
      return;
    }

    if (hasInvalidCustomRange) {
      toast.error('The end date must be on or after the start date.');
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
    <div className="container mx-auto relative max-w-5xl animate-fade-in p-4 pb-20 md:p-8">
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
        <div className="self-start overflow-hidden rounded-xl border border-base-200 bg-base-100 shadow-xl lg:col-span-1">
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
                onChange={(e) => setReportType(e.target.value as ReportType)}
              >
                {REPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustomRange ? (
              <div className="space-y-4 rounded-xl border border-base-200 bg-base-200/30 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  Custom Range
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
                      onChange={(e) =>
                        setCustomRange((current) => ({
                          ...current,
                          from: e.target.value,
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
                      onChange={(e) =>
                        setCustomRange((current) => ({
                          ...current,
                          to: e.target.value,
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
                  onChange={(e) =>
                    setDateRange(e.target.value as DateRangeOption)
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
                disabled={isGenerating || hasInvalidCustomRange}
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
                <CheckCircle2 className="h-3 w-3 text-success" /> Securely
                generated over HTTPS
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card border border-base-200 bg-base-100 shadow-xl">
            <div className="card-body p-0">
              <div className="flex items-center justify-between border-b border-base-200 px-6 py-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Clock className="h-5 w-5 text-secondary" /> Recent Exports
                </h2>
              </div>

              {recentReports.length === 0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200 text-base-content/45">
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
                        <th className="font-medium text-base-content/60">
                          Format
                        </th>
                        <th className="font-medium text-base-content/60">
                          Size
                        </th>
                        <th className="text-right font-medium text-base-content/60">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentReports.map((report) => (
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
        </div>
      </div>

      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
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
