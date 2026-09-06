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

function cleanRoomTitleCandidate(title: string, building?: string, floor?: string): string {
  let res = (title || '').trim();
  if (!res) return '';

  // Strip building if present at start
  if (building && res.toLowerCase().startsWith(building.toLowerCase())) {
    res = res.slice(building.length).trim();
  }
  res = res.replace(/^[•·:\s-]+/, '').trim();

  // Strip floor if present at start
  if (floor && res.toLowerCase().startsWith(floor.toLowerCase())) {
    res = res.slice(floor.length).trim();
  }
  res = res.replace(/^[•·:\s-]+/, '').trim();

  // Strip standard floor codes like "4F", "4th Floor", "1F", "1st Floor"
  res = res
    .replace(/^(?:[0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))\b[•·:\s-]*/i, '')
    .trim();
  res = res.replace(/^[•·:\s-]+/, '').trim();

  // Strip stall / common area / fixture suffixes (e.g. "• Stall 5", "- Stall 5", "(Stall 5)", "• Common Area", "• Sinks & Entrance")
  res = res
    .replace(
      /(?:[•·:\s-]+\s*|\s*\()(?:Stall\s*#?\s*\d+|Single Stall|Common Area|Sinks\s*&?\s*Entrance)\b\)?.*$/i,
      '',
    )
    .trim();

  // Clean trailing punctuation
  res = res.replace(/[•·:\s-]+$/, '').trim();

  return res;
}

export function getDisplayRoomTitle(device: PublicReportingDevice): string {
  let title = cleanRoomTitleCandidate(device.name, device.building, device.floor);

  // If title is empty, or only equal to device ID, or only equal to stall/common area label, try extracting from location
  const isGenericOrEmpty =
    !title ||
    title.toLowerCase() === device.id.toLowerCase() ||
    /^(?:Stall\s*#?\s*\d+|Single Stall|Common Area)$/i.test(title);

  if (isGenericOrEmpty && device.location) {
    const segments = device.location
      .split(/[·•]/)
      .map((s) => cleanRoomTitleCandidate(s, device.building, device.floor))
      .filter((s) => {
        if (!s) return false;
        if (device.building && s.toLowerCase() === device.building.toLowerCase()) return false;
        if (device.floor && s.toLowerCase() === device.floor.toLowerCase()) return false;
        if (/^(?:[0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))$/i.test(s)) return false;
        if (/^(?:Stall\s*#?\s*\d+|Single Stall|Common Area)$/i.test(s)) return false;
        return true;
      });

    if (segments.length > 0) {
      title = segments[0];
    }
  }

  return title || device.name || 'Restroom';
}

export function getDisplayBreadcrumb(device: PublicReportingDevice): string {
  let building = (device.building || '').trim();
  let floor = (device.floor || '').trim();

  // If floor is empty, attempt to infer from location or name
  if (!floor) {
    const floorMatch =
      (device.location || '').match(/\b([0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))\b/i) ||
      (device.name || '').match(/\b([0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))\b/i);
    if (floorMatch) {
      floor = floorMatch[1].toUpperCase();
    }
  }

  // If building is empty, check if location starts with known building
  if (!building && device.location) {
    const segs = device.location.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
    if (segs.length >= 2 && !/^(?:[0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))$/i.test(segs[0])) {
      building = segs[0];
    }
  }

  // Avoid repetitive building and floor
  if (building && floor) {
    if (building.toLowerCase() === floor.toLowerCase()) {
      return building;
    }
    if (building.toLowerCase().endsWith(floor.toLowerCase())) {
      return building;
    }
    return `${building} · ${floor}`;
  }

  if (building) return building;
  if (floor) return floor;

  return device.location || device.name || '';
}

export function getDisplayStallBadge(device: PublicReportingDevice): string | null {
  if (
    device.isCommonArea ||
    /\bcommon\s*area\b/i.test(device.name) ||
    /\bcommon\s*area\b/i.test(device.location) ||
    /\bsinks\s*&?\s*entrance\b/i.test(device.name) ||
    /\bsinks\s*&?\s*entrance\b/i.test(device.location)
  ) {
    return 'Common Area';
  }

  if (device.isSmartHardware) {
    return 'Automated Restroom Stall';
  }

  const isSingleStall =
    /\bsingle\s*stall\b/i.test(device.name) ||
    /\bsingle\s*stall\b/i.test(device.location) ||
    /\bpwd\b/i.test(device.name) ||
    /\bpwd\b/i.test(device.id) ||
    (device.stallId ? /\bpwd\b/i.test(device.stallId) : false);

  if (isSingleStall) {
    return 'Single Stall';
  }

  if (device.stallNumber) {
    const cleanNum = String(device.stallNumber).replace(/^stall\s*#?\s*/i, '').trim();
    if (cleanNum) {
      return `Stall ${cleanNum}`;
    }
  }

  const stallMatch =
    device.name.match(/\bstall\s*#?\s*(\d+)\b/i) ||
    device.location.match(/\bstall\s*#?\s*(\d+)\b/i);
  if (stallMatch) {
    return `Stall ${stallMatch[1]}`;
  }

  const idStallMatch = device.id.match(/-S0*(\d+)$/i);
  if (idStallMatch) {
    return `Stall ${idStallMatch[1]}`;
  }

  return null;
}

export function getDisplayReceiptLocation(device: PublicReportingDevice): string {
  const parts: string[] = [];

  const addUniquePart = (rawPart: string | null | undefined) => {
    if (!rawPart) return;
    let trimmed = rawPart.trim();
    if (!trimmed) return;

    trimmed = trimmed.replace(/^[•·:\s-]+/, '').replace(/[•·:\s-]+$/, '').trim();
    if (!trimmed) return;

    if (device.building && trimmed.toLowerCase().startsWith(device.building.toLowerCase())) {
      trimmed = trimmed.slice(device.building.length).trim();
      trimmed = trimmed.replace(/^[•·:\s-]+/, '').trim();
    }
    if (device.floor && trimmed.toLowerCase().startsWith(device.floor.toLowerCase())) {
      trimmed = trimmed.slice(device.floor.length).trim();
      trimmed = trimmed.replace(/^[•·:\s-]+/, '').trim();
    }
    trimmed = trimmed
      .replace(/^(?:[0-9]+[fF]|[0-9]+(?:st|nd|rd|th)\s+(?:floor|fl))\b[•·:\s-]*/i, '')
      .trim();
    trimmed = trimmed.replace(/^[•·:\s-]+/, '').replace(/[•·:\s-]+$/, '').trim();

    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    const alreadyExists = parts.some(
      (p) => p.toLowerCase() === lower || p.toLowerCase().endsWith(lower),
    );
    if (!alreadyExists) {
      parts.push(trimmed);
    }
  };

  if (device.building && device.building.trim()) {
    parts.push(device.building.trim());
  }

  if (device.floor && device.floor.trim()) {
    const fl = device.floor.trim();
    if (!parts.some((p) => p.toLowerCase() === fl.toLowerCase() || p.toLowerCase().endsWith(fl.toLowerCase()))) {
      parts.push(fl);
    }
  }

  const roomTitle = getDisplayRoomTitle(device);
  if (roomTitle) {
    addUniquePart(roomTitle);
  }

  const badge = getDisplayStallBadge(device);

  const locationSegments = (device.location || '')
    .split(/[·•]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of locationSegments) {
    const cleanSeg = segment.replace(/^Sinks\s*&?\s*Entrance$/i, 'Common Area').trim();
    if (badge && cleanSeg.toLowerCase() === badge.toLowerCase()) {
      continue;
    }
    addUniquePart(cleanSeg);
  }

  if (badge) {
    addUniquePart(badge);
  }

  if (parts.length === 0) {
    return device.name || '';
  }

  return parts.join(' · ');
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
  const [_captureStatus, setCaptureStatus] = useState<PhotoCaptureStatus | 'pending'>('pending');
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
    setSubmitting(true);
    setError(null);

    try {
      const effectiveCaptureStatus: PhotoCaptureStatus = photo ? 'captured' : 'unavailable';
      const body = new FormData(event.currentTarget);
      body.set('deviceId', device.id);
      body.set('photoCaptureStatus', effectiveCaptureStatus);
      body.delete('photo');
      if (photo) body.set('photo', photo, photo.name);
      if (photo && photoCapturedAt !== null) body.set('photoCapturedAt', String(photoCapturedAt));
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

  const badge = getDisplayStallBadge(device);
  const isCommonArea = device.isCommonArea || badge === 'Common Area';
  const isSmartHardware = device.isSmartHardware || badge === 'Automated Restroom Stall';
  const roomTitle = getDisplayRoomTitle(device);
  const breadcrumb = getDisplayBreadcrumb(device);
  const receiptLocation = getDisplayReceiptLocation(device);

  const categoryOptions = isCommonArea
    ? COMMON_AREA_CATEGORY_OPTIONS
    : isSmartHardware
      ? [...STALL_CATEGORY_OPTIONS, ...SMART_STALL_EXTRA_OPTIONS]
      : device.stallNumber || badge
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
              <dd className="text-right font-medium truncate" title={receiptLocation}>
                {receiptLocation}
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
            {badge ? (
              <span
                className={
                  isCommonArea
                    ? 'inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300'
                    : 'inline-flex items-center rounded-full bg-red-50 dark:bg-red-950/40 px-2.5 py-0.5 text-xs font-semibold text-[#B5121B] dark:text-red-400 border border-red-200 dark:border-red-900/40'
                }
              >
                {badge}
              </span>
            ) : null}

          </div>
          <div className="mt-1.5 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {roomTitle}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {breadcrumb}
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
              A report for this stall is currently being reviewed. Submitting will attach your feedback to the existing report.
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
              Photo evidence <span className="text-slate-400 font-normal">(optional)</span>
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
