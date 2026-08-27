'use client';

import { useState, type FormEvent } from 'react';
import { CameraCapture } from './CameraCapture';
import type { PhotoCaptureStatus, PublicReportingDevice } from '@/lib/public-issue-reports';

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
  data: {
    referenceCode: string;
    confirmation: string;
    submittedAt?: number;
    photoCaptureStatus?: PhotoCaptureStatus;
    photoCapturedAt?: number | null;
  };
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
  const [captureStatus, setCaptureStatus] = useState<PhotoCaptureStatus | 'pending'>('pending');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoCapturedAt, setPhotoCapturedAt] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<(SuccessResponse['data'] & { previewUrl: string | null }) | null>(null);

  const formatDateTime = (value: number | null | undefined): string => {
    if (!value) return 'Unavailable';
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const handlePhotoChange = (file: File | null, capturedAt: number | null, status: PhotoCaptureStatus) => {
    setPhoto(file);
    setPhotoCapturedAt(capturedAt);
    setCaptureStatus(status);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (captureStatus === 'pending') {
      setError('Please open the camera, or continue without a photo if camera access fails.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const body = new FormData(event.currentTarget);
      body.set('deviceId', device.id);
      body.set('photoCaptureStatus', captureStatus);
      body.delete('photo');
      if (photo) body.set('photo', photo, photo.name);
      if (photoCapturedAt !== null) body.set('photoCapturedAt', String(photoCapturedAt));
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
      setReceipt({
        ...result.data,
        previewUrl: photo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null,
      });
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
          {receipt.previewUrl ? <img src={receipt.previewUrl} alt="Submitted restroom issue" className="mt-6 max-h-72 w-full rounded-xl object-contain" /> : <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">Submitted without photo.</p>}
          <dl className="mt-5 space-y-2 text-left text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Toilet location</dt><dd className="text-right font-medium">{[device.building, device.floor, device.location].filter(Boolean).join(' · ') || device.name}</dd></div>
            {receipt.previewUrl ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Photo captured</dt><dd className="text-right font-medium">{formatDateTime(receipt.photoCapturedAt)}</dd></div> : null}
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Report submitted</dt><dd className="text-right font-medium">{formatDateTime(receipt.submittedAt)}</dd></div>
          </dl>
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

          <CameraCapture onChange={handlePhotoChange} disabled={submitting} />

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
