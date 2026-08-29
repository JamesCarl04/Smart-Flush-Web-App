'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { PhotoCaptureStatus, PublicReportingDevice } from '@/lib/public-issue-reports';

interface CameraCaptureProps {
  device?: PublicReportingDevice;
  initialQrDetected?: boolean;
  onChange: (
    file: File | null,
    capturedAt: number | null,
    status: PhotoCaptureStatus,
  ) => void;
  disabled?: boolean;
}

interface AnchorCoordinates {
  x: number;
  y: number;
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  isAbove: boolean;
}

export function CameraCapture({
  device,
  initialQrDetected = false,
  onChange,
  disabled = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastSeenQrTimeRef = useRef<number>(0);
  const currentAnchorRef = useRef<AnchorCoordinates | null>(null);

  const [phase, setPhase] = useState<'pending' | 'requesting' | 'ready' | 'captured' | 'unavailable'>('pending');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qrDetected, setQrDetected] = useState<boolean>(initialQrDetected);
  const [isActivelyInView, setIsActivelyInView] = useState<boolean>(initialQrDetected);
  const [anchor, setAnchor] = useState<AnchorCoordinates | null>(
    initialQrDetected
      ? {
          x: 50,
          y: 40,
          boxLeft: 40,
          boxTop: 45,
          boxWidth: 20,
          boxHeight: 20,
          isAbove: true,
        }
      : null,
  );

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

  // Real-time Synchronous QR Code Spatial Tracking Loop (~35 FPS, near-zero latency)
  useEffect(() => {
    if (phase !== 'ready') return;
    let animationFrameId: number;

    if (!scanCanvasRef.current && typeof document !== 'undefined') {
      scanCanvasRef.current = document.createElement('canvas');
    }

    const scan = () => {
      const now = performance.now();
      // Scan every ~30ms (~33 FPS) with zero Promise round-trips for instantaneous tracking
      if (now - lastScanTimeRef.current >= 30) {
        lastScanTimeRef.current = now;
        const video = videoRef.current;

        if (video && video.videoWidth > 0 && video.videoHeight > 0 && scanCanvasRef.current) {
          const canvas = scanCanvasRef.current;
          const targetWidth = Math.min(video.videoWidth, 380);
          const scale = targetWidth / video.videoWidth;
          const targetHeight = Math.floor(video.videoHeight * scale);

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            try {
              const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
              const code = jsQR(imgData.data, targetWidth, targetHeight);

              if (code && code.data && code.location) {
                // Strict Accountability Lock: Only track its own stall QR code (Ignore foreign/other stall QRs)
                let isOwnQr = true;
                if (device?.id) {
                  const raw = code.data.trim();
                  const match = raw.match(/\/report\/([^/?#]+)/i);
                  const extractedId = match && match[1] ? decodeURIComponent(match[1]) : raw;
                  if (extractedId !== device.id) {
                    isOwnQr = false;
                  }
                }

                if (isOwnQr) {
                  const loc = code.location;
                  const cxCanvas =
                    (loc.topLeftCorner.x +
                      loc.topRightCorner.x +
                      loc.bottomRightCorner.x +
                      loc.bottomLeftCorner.x) /
                    4;
                  const minX = Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x);
                  const maxX = Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x);
                  const minY = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y);
                  const maxY = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);

                  const cx = (cxCanvas / targetWidth) * 100;
                  const topY = (minY / targetHeight) * 100;

                  const rawCoords: AnchorCoordinates = {
                    x: cx,
                    y: topY,
                    boxLeft: (minX / targetWidth) * 100,
                    boxTop: (minY / targetHeight) * 100,
                    boxWidth: ((maxX - minX) / targetWidth) * 100,
                    boxHeight: ((maxY - minY) / targetHeight) * 100,
                    isAbove: topY > 28,
                  };

                  lastSeenQrTimeRef.current = Date.now();
                  setQrDetected(true);
                  setIsActivelyInView(true);

                  // High responsiveness LERP (0.85) to eliminate the ~1s tracking lag
                  if (!currentAnchorRef.current) {
                    currentAnchorRef.current = rawCoords;
                  } else {
                    const prev = currentAnchorRef.current;
                    const lerp = 0.85;
                    currentAnchorRef.current = {
                      x: prev.x + (rawCoords.x - prev.x) * lerp,
                      y: prev.y + (rawCoords.y - prev.y) * lerp,
                      boxLeft: prev.boxLeft + (rawCoords.boxLeft - prev.boxLeft) * lerp,
                      boxTop: prev.boxTop + (rawCoords.boxTop - prev.boxTop) * lerp,
                      boxWidth: prev.boxWidth + (rawCoords.boxWidth - prev.boxWidth) * lerp,
                      boxHeight: prev.boxHeight + (rawCoords.boxHeight - prev.boxHeight) * lerp,
                      isAbove: rawCoords.isAbove,
                    };
                  }
                  setAnchor({ ...currentAnchorRef.current });
                }
              } else if (lastSeenQrTimeRef.current > 0) {
                // When QR leaves view, dock smoothly after 1.5s
                if (Date.now() - lastSeenQrTimeRef.current > 1500) {
                  setIsActivelyInView(false);
                }
              }
            } catch {
              // Ignore frame decode exceptions
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(scan);
    };

    animationFrameId = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(animationFrameId);
  }, [phase]);

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

  const toiletName = device?.name ?? (device?.stallNumber ? `Stall ${device.stallNumber}` : 'Restroom Stall');

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div>
        <p className="text-sm font-semibold">Photo evidence</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Use the camera to take a photo. Gallery uploads are not accepted.</p>
      </div>

      <div className={phase === 'ready' ? 'space-y-3' : 'hidden'}>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-inner">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
          />

          {/* Spatial AR Viewfinder Overlay */}
          {phase === 'ready' ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              
              {/* Dynamic AR Tracking: Anchors and follows the physical QR code */}
              {qrDetected ? (
                isActivelyInView && anchor ? (
                  <>
                    {/* 1. Spatial Corner Brackets hugging the physical QR code */}
                    <div
                      className="pointer-events-none absolute transition-all duration-75 ease-out"
                      style={{
                        left: `${anchor.boxLeft}%`,
                        top: `${anchor.boxTop}%`,
                        width: `${anchor.boxWidth}%`,
                        height: `${anchor.boxHeight}%`,
                      }}
                    >
                      <div className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-white/80 rounded-tl-xs shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                      <div className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-white/80 rounded-tr-xs shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                      <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-white/80 rounded-bl-xs shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                      <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-white/80 rounded-br-xs shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                    </div>

                    {/* 2. Floating See-Through Glassmorphic Pill: ONLY the name of the toilet, non-blocking */}
                    <div
                      className="pointer-events-none absolute z-20 transition-all duration-75 ease-out"
                      style={{
                        left: `${Math.min(Math.max(anchor.x, 15), 85)}%`,
                        top: anchor.isAbove
                          ? `${anchor.boxTop}%`
                          : `${anchor.boxTop + anchor.boxHeight}%`,
                        transform: anchor.isAbove
                          ? `translate(-50%, -100%) translateY(-${Math.max(10, anchor.boxHeight * 0.12)}px)`
                          : `translate(-50%, 0%) translateY(${Math.max(10, anchor.boxHeight * 0.12)}px)`,
                      }}
                    >
                      <div className="inline-flex items-center rounded-full border border-white/30 bg-white/20 dark:bg-black/40 px-3.5 py-1 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl whitespace-nowrap max-w-[85vw]">
                        <span className="truncate drop-shadow-xs">{toiletName}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Docked Top Glass Pill: Clean, no green dot, no 'Ready' text */
                  <div className="animate-fade-in absolute inset-x-0 top-3 z-10 flex justify-center">
                    <div className="flex items-center rounded-full border border-white/20 bg-white/20 dark:bg-black/40 px-3.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-xl transition-all duration-300 max-w-[85vw]">
                      <span className="truncate">{toiletName}</span>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Shutter Button */}
        <button
          type="button"
          onClick={capture}
          disabled={disabled}
          className="min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white shadow-sm hover:bg-black disabled:opacity-60 transition-colors dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          Take photo
        </button>
      </div>

      {phase === 'captured' && previewUrl ? (
        <div className="space-y-3">
          <img src={previewUrl} alt="Captured restroom issue" className="max-h-72 w-full rounded-lg object-contain" />
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Photo ready to submit.</p>
          <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Retake photo</button>
        </div>
      ) : null}

      {phase === 'pending' ? <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60 hover:bg-emerald-800 transition-colors">Open camera</button> : null}
      {phase === 'requesting' ? <p role="status" className="text-sm text-slate-600 dark:text-slate-400">Opening camera…</p> : null}
      {phase === 'unavailable' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{message}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Try camera again</button>
            <button type="button" onClick={continueWithoutPhoto} disabled={disabled} className="min-h-11 flex-1 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white disabled:opacity-60 hover:bg-slate-800 transition-colors">Continue without photo</button>
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
