'use client';

import { useState, type FormEvent } from 'react';
import type { PublicReportingDevice } from '@/lib/public-issue-reports';

const CATEGORY_OPTIONS = [
  ['lid_malfunction', 'Lid malfunction'],
  ['no_water', 'No water'],
  ['continuous_leak', 'Continuous leak'],
  ['uv_light_failure', 'UV light failure'],
  ['blockage_or_dirty', 'Blockage or dirty restroom'],
  ['physical_damage', 'Physical damage'],
  ['other', 'Other'],
] as const;

interface SuccessResponse {
  success: true;
  data: { referenceCode: string; confirmation: string };
}

interface ErrorResponse {
  success: false;
  error: string;
}

export function PublicIssueReportForm({
  device,
}: {
  device: PublicReportingDevice;
}) {
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SuccessResponse['data'] | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = new FormData(event.currentTarget);
      body.set('deviceId', device.id);
      const response = await fetch('/api/public/issue-reports', {
        method: 'POST',
        body,
      });
      const result = (await response.json()) as SuccessResponse | ErrorResponse;
      if (!response.ok || !result.success) {
        setError(
          result.success ? 'Unable to submit report' : result.error,
        );
        return;
      }
      setReceipt(result.data);
    } catch {
      setError('Unable to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <main className="flex min-h-screen items-center bg-slate-50 px-4 py-8 text-slate-900">
        <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Report received
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight">
            {receipt.referenceCode}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {receipt.confirmation}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
        <header>
          <p className="text-sm font-semibold text-emerald-700">Smart Flush</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Report a restroom issue
          </h1>
          <p className="mt-4 font-semibold">{device.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {[device.building, device.floor, device.location]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This anonymous report goes to facility administrators for review.
          </p>
        </header>

        <form
          aria-label="Anonymous issue report"
          className="mt-6 space-y-5"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="startedAt" value={startedAt} />
          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="report-website">Website</label>
            <input
              id="report-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="report-category">
              Issue category
            </label>
            <select
              id="report-category"
              name="category"
              required
              defaultValue=""
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="" disabled>
                Select an issue
              </option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="report-description">
              Description (optional)
            </label>
            <textarea
              id="report-description"
              name="description"
              maxLength={500}
              rows={4}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="What did you notice?"
            />
            <p className="mt-1 text-xs text-slate-500">Maximum 500 characters</p>
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="report-photo">
              Photo (optional)
            </label>
            <input
              id="report-photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full rounded-xl border border-slate-300 p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-semibold file:text-emerald-800"
            />
            <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB</p>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
      </section>
    </main>
  );
}
