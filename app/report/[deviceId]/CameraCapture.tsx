'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoCaptureStatus, PublicReportingDevice } from '@/lib/public-issue-reports';

interface CameraCaptureProps {
  device?: PublicReportingDevice;
  onChange: (
    file: File | null,
    capturedAt: number | null,
    status: PhotoCaptureStatus,
  ) => void;
  disabled?: boolean;
}

export function CameraCapture({
  onChange,
  disabled = false,
}: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pending' | 'captured' | 'unavailable'>('pending');

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPhase('pending');
  }, []);

  useEffect(() => () => {
    clearPreview();
  }, [clearPreview]);

  const handleTriggerClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

async function compressImageForUpload(
  file: File,
  maxDimension = 1600,
  quality = 0.82,
): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  // If already under 1 MB, no need to touch it
  if (file.size <= 1024 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const compressedFile = new File([blob], cleanName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearPreview();

    const objectUrl =
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : 'blob:mock-evidence-preview';
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setPhase('captured');
    const captureTimestamp = Date.now();
    // Synchronously notify parent immediately with the raw file so parent state transitions out of 'pending'
    onChange(file, captureTimestamp, 'captured');

    // Compress client-side so high-res phone camera photos (5-15MB) don't exceed Vercel's 4.5MB limit
    try {
      const readyFile = await compressImageForUpload(file);
      onChange(readyFile, captureTimestamp, 'captured');
    } catch {
      onChange(file, captureTimestamp, 'captured');
    }

    // Reset input value so taking another picture or re-selecting works smoothly
    e.target.value = '';
  };

  const continueWithoutPhoto = () => {
    if (disabled) return;
    clearPreview();
    setPhase('unavailable');
    onChange(null, null, 'unavailable');
  };

  const handleRetake = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full space-y-2">
      {/* Hidden standard HTML5 mobile camera capture input: forces direct launch of device native camera app */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Capture photo with camera app"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {phase === 'captured' && previewUrl ? (
        /* Photo Captured: Thumbnail preview card with Retake option */
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={previewUrl}
              alt="Captured restroom issue"
              className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Photo attached
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Ready to submit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetake}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B]"
          >
            Retake
          </button>
        </div>
      ) : phase === 'unavailable' ? (
        /* User chose to continue without photo */
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No photo attached
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Continuing without photo
            </p>
          </div>
          <button
            type="button"
            onClick={handleTriggerClick}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B]"
          >
            Add photo
          </button>
        </div>
      ) : (
        /* Initial State: Open Camera Button + Continue without photo */
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={handleTriggerClick}
            disabled={disabled}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B]"
          >
            Open camera
          </button>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={continueWithoutPhoto}
              disabled={disabled}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2 transition-colors"
            >
              Continue without photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
