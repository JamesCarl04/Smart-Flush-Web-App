'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

type Status = 'pending_review' | 'confirmed' | 'dismissed';
interface IssueReportView {
  id: string;
  deviceId: string | null;
  device: { name: string | null; location: string | null; building: string | null; floor: string | null };
  category: string | null;
  status: Status;
  confirmationCount: number;
  firstReportedAt: number | null;
  lastReportedAt: number | null;
  descriptions: string[];
  evidence: Array<{ submissionId: string; contentType: string; size: number }>;
  linkedTaskId?: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  pending_review: 'Pending', confirmed: 'Confirmed', dismissed: 'Dismissed',
};

function formatTime(value: number | null): string {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}

function categoryLabel(value: string | null): string {
  return value?.replaceAll('_', ' ') ?? 'Other';
}

export default function IssueReportsPage() {
  const { user, role, roleLoading, roleError } = useAuth();
  const [status, setStatus] = useState<Status>('pending_review');
  const [reports, setReports] = useState<IssueReportView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || role !== 'admin' || roleLoading) return;
    setLoading(true);
    try {
      const response = await apiFetch<{ success: boolean; data?: IssueReportView[]; error?: string }>(
        `/api/issue-reports?status=${status}`,
        user,
      );
      if (!response.success) throw new Error(response.error ?? 'Failed to load reports');
      setReports(response.data ?? []);
      setError(null);
    } catch (loadError) {
      setReports([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [role, roleLoading, status, user]);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (path: string, body?: Record<string, unknown>) => {
    if (!user || role !== 'admin') return;
    await apiFetch(path, user, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
    window.dispatchEvent(new Event('issue-reports:refresh'));
    await load();
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

  return (
    <section className="space-y-6">
      <div><h1 className="text-2xl font-bold">Issue Reports</h1><p className="text-sm text-slate-500">Review anonymous restroom reports without exposing submitter identifiers.</p></div>
      <div className="flex gap-2" role="tablist">
        {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
          <button key={value} role="tab" aria-selected={status === value} onClick={() => setStatus(value)} className={`rounded-lg px-4 py-2 text-sm font-medium ${status === value ? 'bg-[#B5121B] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{STATUS_LABELS[value]}</button>
        ))}
      </div>
      {loading ? <p role="status">Loading reports…</p> : null}
      {error ? <p role="alert" className="text-rose-600">{error}</p> : null}
      {!loading && !error && reports.length === 0 ? <p className="rounded-xl border p-8 text-center text-slate-500">No {STATUS_LABELS[status].toLowerCase()} reports.</p> : null}
      <div className="grid gap-4">
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">{report.device.name ?? report.deviceId}</h2><p className="text-sm text-slate-500">{report.device.location ?? [report.device.floor, report.device.building].filter(Boolean).join(', ')}</p></div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-800">{categoryLabel(report.category)}</span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Urgency</dt><dd className="font-medium">{report.confirmationCount >= 3 ? 'High' : report.confirmationCount === 2 ? 'Medium' : 'Normal'}</dd></div>
              <div><dt className="text-slate-500">Confirmations</dt><dd className="font-medium">{report.confirmationCount}</dd></div>
              <div><dt className="text-slate-500">First / last</dt><dd className="text-xs">{formatTime(report.firstReportedAt)}<br />{formatTime(report.lastReportedAt)}</dd></div>
            </dl>
            {report.descriptions.map((description, index) => <p key={index} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">{description}</p>)}
            {report.evidence.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{report.evidence.map((item) => <button key={item.submissionId} onClick={() => void viewEvidence(report.id, item.submissionId)} className="rounded-lg border px-3 py-2 text-xs font-medium">View evidence ({Math.ceil(item.size / 1024)} KB)</button>)}</div> : null}
            {status === 'pending_review' ? <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void mutate(`/api/issue-reports/${report.id}/confirm`)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Confirm and create task</button><button onClick={() => void mutate(`/api/issue-reports/${report.id}/dismiss`, { reason: 'unable_to_verify' })} className="rounded-lg border px-4 py-2 text-sm font-semibold">Dismiss</button></div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
