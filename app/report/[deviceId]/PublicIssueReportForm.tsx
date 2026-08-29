'use client';

import { useState, type FormEvent } from 'react';
import { CameraCapture } from './CameraCapture';
import type { PhotoCaptureStatus, PublicReportingDevice } from '@/lib/public-issue-reports';

const STALL_CATEGORY_OPTIONS = [
  ['blockage_or_dirty', 'Toilet clogged or dirty'],
  ['continuous_leak', 'Continuous leak or bidet running'],
  ['no_water', 'No water flow'],
  ['lid_malfunction', 'Flush sensor not responding'],
  ['physical_damage', 'Stall door lock or hardware broken'],
  ['other', 'Other stall issue'],
] as const;

const SMART_STALL_EXTRA_OPTIONS = [
  ['uv_light_failure', 'UV light failure'],
] as const;

const COMMON_AREA_CATEGORY_OPTIONS = [
  ['continuous_leak', 'Sink faucet leaking or running'],
  ['blockage_or_dirty', 'Flooded or dirty floor'],
  ['no_water', 'No water from sink faucets'],
  ['physical_damage', 'Soap dispenser or mirror damaged'],
  ['other', 'Other common area issue'],
] as const;

const DEFAULT_FALLBACK_OPTIONS = [
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
  details?: string;
}

export function PublicIssueReportForm({
  device,
  hasPendingReport = false,
}: {
  device: PublicReportingDevice;
  hasPendingReport?: boolean;
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
      let result: SuccessResponse | ErrorResponse;
      try {
        result = (await response.json()) as SuccessResponse | ErrorResponse;
      } catch {
        if (response.status === 413) {
          setError('Photo is too large to upload. Please retake the photo.');
        } else {
          setError(`Server connection error (${response.status}). Please try again.`);
        }
        return;
      }

      if (!response.ok || !result.success) {
        const errorMsg = !result.success
          ? result.details
            ? `${result.error}: ${result.details}`
            : result.error
          : 'Unable to submit report';
        setError(errorMsg);
        return;
      }
      setReceipt({
        ...result.data,
        previewUrl: photo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null,
      });
    } catch (err: unknown) {
      console.error('Submission failed:', err);
      const message = err instanceof Error ? err.message : 'Unable to submit report. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions = device.isCommonArea
    ? COMMON_AREA_CATEGORY_OPTIONS
    : device.isSmartHardware
      ? [...STALL_CATEGORY_OPTIONS, ...SMART_STALL_EXTRA_OPTIONS]
      : device.stallNumber
        ? STALL_CATEGORY_OPTIONS
        : DEFAULT_FALLBACK_OPTIONS;

  if (receipt) {
    return (
      <main className="flex h-[100dvh] max-h-[100dvh] items-center justify-center bg-slate-50 px-4 text-slate-900 dark:bg-[#0b0f19] dark:text-slate-100">
        <section className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <p className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Klir<span className="text-[#B5121B]">.</span>
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#B5121B]">
            Report received
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {receipt.referenceCode}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
            {receipt.confirmation}
          </p>
          {receipt.previewUrl ? (
            <img
              src={receipt.previewUrl}
              alt="Submitted restroom issue"
              className="mt-3 max-h-40 w-full rounded-xl object-contain mx-auto border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              Submitted without photo.
            </p>
          )}
          <dl className="mt-3 space-y-1.5 text-left text-xs border-t border-slate-100 dark:border-slate-800 pt-2.5">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Location</dt>
              <dd className="text-right font-medium truncate">
                {[device.building, device.floor, device.location].filter(Boolean).join(' · ') || device.name}
              </dd>
            </div>
            {receipt.previewUrl ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Photo captured</dt>
                <dd className="text-right font-medium">{formatDateTime(receipt.photoCapturedAt)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Submitted</dt>
              <dd className="text-right font-medium">{formatDateTime(receipt.submittedAt)}</dd>
            </div>
          </dl>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 p-4 sm:p-6 text-slate-900 dark:bg-[#0b0f19] dark:text-slate-100 flex items-center justify-center">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
        {/* Level 1: Location & Identity Header */}
        <header className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Klir<span className="text-[#B5121B]">.</span>
            </span>
            {device.isCommonArea ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Common Area
              </span>
            ) : device.stallNumber ? (
              <span className="inline-flex items-center rounded-full bg-red-50 dark:bg-red-950/40 px-2.5 py-0.5 text-xs font-semibold text-[#B5121B] dark:text-red-400 border border-red-200 dark:border-red-900/40">
                {device.isSmartHardware ? 'Smart IoT Stall' : `Stall ${device.stallNumber}`}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {device.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {[device.building, device.floor, device.location]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </header>

        {hasPendingReport ? (
          <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Issue already under review</span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              A report for this stall is currently awaiting administrator review. Submitting will attach your confirmation and evidence to the existing open ticket.
            </p>
          </div>
        ) : null}

        {/* Level 2: Core Form Controls (Issue Category, Note, Camera) */}
        <form
          aria-label="Anonymous issue report"
          className="mt-4 space-y-3.5"
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
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="report-category">
              Issue category
            </label>
            <select
              id="report-category"
              name="category"
              required
              defaultValue=""
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#B5121B] focus:outline-none focus:ring-2 focus:ring-[#B5121B]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="" disabled>
                Select an issue
              </option>
              {categoryOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="report-description">
              Description (optional)
            </label>
            <textarea
              id="report-description"
              name="description"
              maxLength={500}
              rows={2}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#B5121B] focus:outline-none focus:ring-2 focus:ring-[#B5121B]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 resize-none"
              placeholder="What did you notice?"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Photo evidence <span className="text-slate-400 font-normal">(required)</span>
            </label>
            <CameraCapture device={device} onChange={handlePhotoChange} disabled={submitting} />
          </div>

          {/* Level 3: Primary Action Button */}
          <div className="pt-1.5">
            {error ? (
              <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full rounded-xl bg-[#B5121B] hover:bg-[#990e16] active:bg-[#730c12] px-4 py-3 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
