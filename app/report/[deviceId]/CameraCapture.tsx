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

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => undefined);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }, []);

  const stopAndCloseCamera = useCallback(() => {
    stopCamera();
    setPhase('pending');
  }, [stopCamera]);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  useEffect(() => () => {
    stopCamera();
    clearPreview();
  }, [clearPreview, stopCamera]);

  useEffect(() => {
    if (phase === 'ready' && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => undefined);
    }
  }, [phase]);

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
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
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
    <div className="w-full">
      {/* 1. Fullscreen Native Camera App Viewfinder (Always mounted to prevent black screen / uninitialized stream) */}
      <div
        className={
          phase === 'ready'
            ? 'fixed inset-0 z-50 flex flex-col justify-between bg-black overflow-hidden select-none'
            : 'hidden'
        }
        role="dialog"
        aria-modal="true"
        aria-label="Camera viewfinder"
      >
        {/* Fullscreen Video Stream */}
        <video
          ref={setVideoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
        />

          {/* Top Bar: Brand and Close button */}
          <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
            <span className="text-base font-bold tracking-tight text-white">
              Klir<span className="text-[#B5121B]">.</span>
            </span>
            <button
              type="button"
              onClick={stopAndCloseCamera}
              aria-label="Close camera"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95 transition-all backdrop-blur-md border border-white/20 text-lg font-bold"
            >
              ✕
            </button>
          </div>

          {/* Spatial AR Viewfinder Overlay */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
            {qrDetected ? (
              isActivelyInView && anchor ? (
                <>
                  {/* Spatial Corner Brackets hugging the physical QR code */}
                  <div
                    className="pointer-events-none absolute transition-all duration-75 ease-out"
                    style={{
                      left: `${anchor.boxLeft}%`,
                      top: `${anchor.boxTop}%`,
                      width: `${anchor.boxWidth}%`,
                      height: `${anchor.boxHeight}%`,
                    }}
                  >
                    <div className="absolute top-0 left-0 h-3.5 w-3.5 border-t-2 border-l-2 border-white/90 rounded-tl-xs shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    <div className="absolute top-0 right-0 h-3.5 w-3.5 border-t-2 border-r-2 border-white/90 rounded-tr-xs shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    <div className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-white/90 rounded-bl-xs shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    <div className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-white/90 rounded-br-xs shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                  </div>

                  {/* Floating See-Through Glassmorphic Pill */}
                  <div
                    className="pointer-events-none absolute z-20 transition-all duration-75 ease-out"
                    style={{
                      left: `${Math.min(Math.max(anchor.x, 15), 85)}%`,
                      top: anchor.isAbove
                        ? `${anchor.boxTop}%`
                        : `${anchor.boxTop + anchor.boxHeight}%`,
                      transform: anchor.isAbove
                        ? `translate(-50%, -100%) translateY(-${Math.max(12, anchor.boxHeight * 0.12)}px)`
                        : `translate(-50%, 0%) translateY(${Math.max(12, anchor.boxHeight * 0.12)}px)`,
                    }}
                  >
                    <div className="inline-flex items-center rounded-full border border-white/30 bg-white/20 dark:bg-black/40 px-3.5 py-1 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl whitespace-nowrap max-w-[85vw]">
                      <span className="truncate drop-shadow-xs">{toiletName}</span>
                    </div>
                  </div>
                </>
              ) : (
                /* Docked Top Glass Pill */
                <div className="animate-fade-in absolute inset-x-0 top-18 z-10 flex justify-center">
                  <div className="flex items-center rounded-full border border-white/20 bg-white/20 dark:bg-black/40 px-3.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-xl transition-all duration-300 max-w-[85vw]">
                    <span className="truncate">{toiletName}</span>
                  </div>
                </div>
              )
            ) : null}
          </div>

          {/* Bottom Camera Controls Bar: Big round shutter button */}
          <div className="relative z-20 flex flex-col items-center justify-center pb-8 pt-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            <button
              type="button"
              onClick={capture}
              disabled={disabled}
              aria-label="Take photo"
              className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-white active:scale-90 transition-transform shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/40"
            >
              <span className="h-14 w-14 rounded-full bg-white transition-colors hover:bg-slate-200" />
            </button>
            <span className="mt-2 text-[11px] font-medium text-white/80">Tap to take photo</span>
          </div>
        </div>

      {/* 2. Compact Form Integration UI (Fits cleanly on single screen) */}
      {phase === 'captured' && previewUrl ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={previewUrl} alt="Captured restroom issue" className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">Photo attached</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Ready to submit</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void openCamera()}
            disabled={disabled}
            className="shrink-0 min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
          >
            Retake
          </button>
        </div>
      ) : null}

      {phase === 'pending' ? (
        <button
          type="button"
          onClick={() => void openCamera()}
          disabled={disabled}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B]"
        >
          Open camera
        </button>
      ) : null}

      {phase === 'requesting' ? (
        <p role="status" className="text-xs text-slate-500 py-2 text-center dark:text-slate-400">Opening camera…</p>
      ) : null}

      {phase === 'unavailable' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 space-y-2">
          <p role="alert">{message}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void openCamera()} disabled={disabled} className="min-h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Try again</button>
            <button type="button" onClick={continueWithoutPhoto} disabled={disabled} className="min-h-9 flex-1 rounded-lg bg-slate-700 px-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors">Continue without photo</button>
          </div>
        </div>
      ) : null}

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
