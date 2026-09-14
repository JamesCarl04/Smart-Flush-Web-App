'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  MapPin,
  MessageSquare,
  Tag,
  Ticket,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

type Status = 'pending_review' | 'confirmed' | 'dismissed';
interface IssueReportView {
  id: string;
  referenceCode: string;
  deviceId: string | null;
  device: { name: string | null; location: string | null; building: string | null; floor: string | null };
  category: string | null;
  categories?: string[];
  status: Status;
  confirmationCount: number;
  firstReportedAt: number | null;
  lastReportedAt: number | null;
  descriptions: string[];
  evidence: Array<{ submissionId: string; contentType: string; size: number }>;
  submissions?: Array<{
    submissionId: string;
    photoCaptureStatus: 'captured' | 'unavailable';
    photoCapturedAt: number | null;
    submittedAt: number | null;
  }>;
  linkedTaskId?: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  pending_review: 'Pending',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
};
const ALL_STATUSES: Status[] = ['pending_review', 'confirmed', 'dismissed'];

function formatTime(value: number | null): string {
  return value != null ? new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }) : 'Unknown';
}

function categoryLabel(value: string | null): string {
  return value?.replaceAll('_', ' ') ?? 'Other';
}

export default function IssueReportsPage() {
  const { user, role, roleLoading, roleError } = useAuth();
  const [status, setStatus] = useState<Status>('pending_review');
  const [reportsByStatus, setReportsByStatus] = useState<Record<Status, IssueReportView[]>>({
    pending_review: [],
    confirmed: [],
    dismissed: [],
  });
  const [loadedStatuses, setLoadedStatuses] = useState<Record<Status, boolean>>({
    pending_review: false,
    confirmed: false,
    dismissed: false,
  });
  const loadedRef = useRef<Record<Status, boolean>>({
    pending_review: false,
    confirmed: false,
    dismissed: false,
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetStatus: Status) => {
    if (!user || role !== 'admin' || roleLoading) return;
    try {
      const response = await apiFetch<{ success: boolean; data?: IssueReportView[]; error?: string }>(
        `/api/issue-reports?status=${targetStatus}`,
        user,
      );
      if (!response.success) throw new Error(response.error ?? 'Failed to load reports');
      setReportsByStatus((prev) => ({ ...prev, [targetStatus]: response.data ?? [] }));
      loadedRef.current[targetStatus] = true;
      setLoadedStatuses((prev) => ({ ...prev, [targetStatus]: true }));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load reports');
    }
  }, [role, roleLoading, user]);

  useEffect(() => {
    let cancelled = false;

    // Load active status and prefetch remaining statuses in parallel for instant tab switching
    void load(status);
    ALL_STATUSES.filter((s) => s !== status).forEach((s) => {
      void load(s);
    });

    // Event listener for cross-component refresh (e.g. actions from layout or mutations)
    const handleRefresh = () => {
      if (!cancelled) {
        ALL_STATUSES.forEach((s) => {
          void load(s);
        });
      }
    };
    window.addEventListener('issue-reports:refresh', handleRefresh);

    // Polling interval every 10 seconds for real-time background sync
    const intervalId = window.setInterval(() => {
      if (!cancelled) void load(status);
    }, 10_000);

    return () => {
      cancelled = true;
      window.removeEventListener('issue-reports:refresh', handleRefresh);
      window.clearInterval(intervalId);
    };
  }, [load, status]);

  const mutate = async (path: string, body?: Record<string, unknown>) => {
    if (!user || role !== 'admin') return;
    try {
      await apiFetch(path, user, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      window.dispatchEvent(new Event('issue-reports:refresh'));
      await load(status);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to perform moderation action');
    }
  };

  const viewEvidence = async (reportId: string, submissionId: string) => {
    if (!user || role !== 'admin') return;
    const token = await user.getIdToken();
    const response = await fetch(`/api/issue-reports/${encodeURIComponent(reportId)}/evidence/${encodeURIComponent(submissionId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!response.ok) throw new Error('Evidence is unavailable');
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (roleLoading) return <div role="status" className="p-6">Loading administrator access…</div>;
  if (!user || role !== 'admin') {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Issue reports are available only to administrators.</p>
        {roleError ? <p className="mt-2 text-xs text-rose-700">{roleError}</p> : null}
      </section>
    );
  }

  const reports = reportsByStatus[status] ?? [];
  const isStatusLoaded = loadedStatuses[status];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Issue Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Review anonymous feedback and issue reports submitted by restroom users.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-800" role="tablist" aria-label="Issue report status filters">
        {(Object.keys(STATUS_LABELS) as Status[]).map((value) => {
          const isSelected = status === value;
          const count = reportsByStatus[value]?.length ?? 0;
          return (
            <button
              key={value}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setStatus(value)}
              className={`tactile-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 ${
                isSelected
                  ? 'bg-[#B5121B] text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <span>{STATUS_LABELS[value]}</span>
              {loadedStatuses[value] ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {!isStatusLoaded && !error ? (
        <div className="space-y-4">
          <div className="h-44 rounded-2xl border border-slate-200/80 bg-white p-5 animate-pulse dark:border-slate-800 dark:bg-slate-900" />
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}

      {isStatusLoaded && reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No {STATUS_LABELS[status].toLowerCase()} reports.
        </p>
      ) : null}

      <div className="grid gap-5">
        {reports.map((report) => {
          const ticketCode = report.referenceCode || `IR-${report.id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
          const deviceName = report.device.name ?? report.deviceId ?? 'Unassigned stall';
          const rawLocation = report.device.location ?? [report.device.floor, report.device.building].filter(Boolean).join(', ');
          const showLocation = Boolean(rawLocation && rawLocation.trim().toLowerCase() !== deviceName.trim().toLowerCase());

          return (
            <article
              key={report.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Zone 1: Header & State Identity */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200/80 bg-rose-50 px-2.5 py-0.5 font-mono text-xs font-bold text-[#B5121B] dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                      Ticket #{ticketCode}
                    </span>
                    {report.status === 'pending_review' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        Pending Review
                      </span>
                    ) : report.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Task Created
                      </span>
                    ) : report.status === 'dismissed' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <XCircle className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                        Dismissed
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{deviceName}</h2>
                  {showLocation ? (
                    <p className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <span>{rawLocation}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {((report.categories && report.categories.length > 0) ? report.categories : [report.category]).map((cat) => (
                    <span
                      key={cat ?? 'other'}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200"
                    >
                      <Tag className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      {categoryLabel(cat)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Zone 2: Content, Metadata & Evidence */}
              <div className="mt-4 space-y-4">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ticket #</dt>
                    <dd className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{ticketCode}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Urgency</dt>
                    <dd className="mt-1 flex items-center gap-1.5 font-medium">
                      {report.confirmationCount >= 3 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          High
                        </span>
                      ) : report.confirmationCount === 2 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" />
                          Medium
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Normal
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirmations</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                      <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      <span>{report.confirmationCount}</span>
                    </dd>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Timeline</dt>
                    <dd className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {report.firstReportedAt === report.lastReportedAt || !report.lastReportedAt ? (
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Reported:</span> {formatTime(report.firstReportedAt)}
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div><span className="font-semibold text-slate-700 dark:text-slate-300">First:</span> {formatTime(report.firstReportedAt)}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-slate-300">Last:</span> {formatTime(report.lastReportedAt)}</div>
                        </div>
                      )}
                    </dd>
                  </div>
                </dl>

                {report.descriptions.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      User Description{report.descriptions.length > 1 ? 's' : ''}
                    </h3>
                    {report.descriptions.map((description, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                      >
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <p className="leading-relaxed">{description}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {((report.submissions && report.submissions.length > 0) || report.evidence.length > 0) ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Evidence & Submissions
                    </h3>
                    {report.submissions?.map((submission) => {
                      const matchingEvidence = report.evidence.find((e) => e.submissionId === submission.submissionId);
                      const isCaptured = submission.photoCaptureStatus === 'captured';
                      return (
                        <div
                          key={submission.submissionId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                              {isCaptured ? (
                                <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                              ) : (
                                <FileText className="h-4 w-4 text-slate-400" aria-hidden="true" />
                              )}
                              <span className="font-semibold">
                                {isCaptured ? 'Photo captured' : 'Submitted without photo'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400">
                              {isCaptured && submission.photoCapturedAt ? (
                                <span>Photo time: {formatTime(submission.photoCapturedAt)}</span>
                              ) : null}
                              {submission.submittedAt ? (
                                <span>Submitted: {formatTime(submission.submittedAt)}</span>
                              ) : null}
                            </div>
                          </div>
                          {matchingEvidence ? (
                            <button
                              type="button"
                              onClick={() => void viewEvidence(report.id, matchingEvidence.submissionId)}
                              className="tactile-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                              View Photo ({Math.ceil(matchingEvidence.size / 1024)} KB)
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {report.evidence
                      .filter((item) => !report.submissions?.some((s) => s.submissionId === item.submissionId))
                      .map((item) => (
                        <div
                          key={item.submissionId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                        >
                          <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                            <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span className="font-semibold">Photo captured</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void viewEvidence(report.id, item.submissionId)}
                            className="tactile-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            View Photo ({Math.ceil(item.size / 1024)} KB)
                          </button>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>

              {/* Zone 3: Footer & Resolution Closure */}
              {status === 'pending_review' ? (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => void mutate(`/api/issue-reports/${report.id}/dismiss`, { reason: 'unable_to_verify' })}
                    className="tactile-btn inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label={`Dismiss ticket ${ticketCode}`}
                  >
                    <XCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutate(`/api/issue-reports/${report.id}/confirm`)}
                    className="tactile-btn inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    aria-label={`Confirm and create task for ticket ${ticketCode}`}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Confirm and create task
                  </button>
                </div>
              ) : null}

              {status === 'confirmed' ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>Task created and dispatched to maintenance queue.</span>
                  </div>
                  {report.linkedTaskId ? (
                    <Link
                      href={`/tasks?taskId=${encodeURIComponent(report.linkedTaskId)}`}
                      className="tactile-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-xs transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-200 dark:hover:bg-slate-700"
                      aria-label={`View task for ticket ${ticketCode}`}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      View Task
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {status === 'dismissed' ? (
                <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <Ban className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span>Dismissed &middot; Marked as non-actionable or verified resolved.</span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
