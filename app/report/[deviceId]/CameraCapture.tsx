'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoCaptureStatus } from '@/lib/public-issue-reports';

interface CameraCaptureProps {
  onChange: (
    file: File | null,
    capturedAt: number | null,
    status: PhotoCaptureStatus,
  ) => void;
  disabled?: boolean;
}

export function CameraCapture({ onChange, disabled = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<'pending' | 'requesting' | 'ready' | 'captured' | 'unavailable'>('pending');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  useEffect(() => () => {
    stopCamera();
    clearPreview();
  }, [clearPreview, stopCamera]);

  const markUnavailable = useCallback((detail?: string) => {
    stopCamera();
    setPhase('unavailable');
    setMessage(detail ?? 'Camera access is unavailable on this device. You may continue without a photo.');
    onChange(null, null, 'unavailable');
  }, [onChange, stopCamera]);

  const openCamera = async () => {
    if (disabled) return;
    clearPreview();
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      markUnavailable('This browser does not support camera access. You may continue without a photo.');
      return;
    }
    setPhase('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setPhase('ready');
    } catch {
      markUnavailable('Camera permission was denied or the camera could not be opened. You may continue without a photo.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      markUnavailable('The camera did not provide an image. You may continue without a photo.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      markUnavailable('The camera image could not be captured. You may continue without a photo.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        markUnavailable('The camera image could not be captured. You may continue without a photo.');
        return;
      }
      const capturedAt = Date.now();
      const file = new File([blob], `restroom-issue-${capturedAt}.jpg`, { type: 'image/jpeg' });
      const nextPreviewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
      clearPreview();
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
      setPhase('captured');
      setMessage(null);
      stopCamera();
      onChange(file, capturedAt, 'captured');
    }, 'image/jpeg', 0.9);
  };

  const continueWithoutPhoto = () => {
    if (disabled) return;
    clearPreview();
    markUnavailable('Continuing without a photo.');
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-semibold">Photo evidence</p>
        <p className="mt-1 text-xs text-slate-600">Use the camera to take a photo. Gallery uploads are not accepted.</p>
      </div>

      <div className={phase === 'ready' ? 'space-y-3' : 'hidden'}>
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-lg bg-black object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
        />
        <button
          type="button"
          onClick={capture}
          disabled={disabled}
          className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Take photo
        </button>
      </div>

      {phase === 'captured' && previewUrl ? (
        <div className="space-y-3">
          <img src={previewUrl} alt="Captured restroom issue" className="max-h-72 w-full rounded-lg object-contain" />
          <p className="text-xs font-medium text-emerald-700">Photo ready to submit.</p>
          <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 disabled:opacity-60">Retake photo</button>
        </div>
      ) : null}

      {phase === 'pending' ? <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Open camera</button> : null}
      {phase === 'requesting' ? <p role="status" className="text-sm text-slate-600">Opening camera…</p> : null}
      {phase === 'unavailable' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-amber-800">{message}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 disabled:opacity-60">Try camera again</button>
            <button type="button" onClick={continueWithoutPhoto} disabled={disabled} className="min-h-11 flex-1 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Continue without photo</button>
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
