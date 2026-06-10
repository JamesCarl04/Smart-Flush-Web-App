'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { 
  CameraOff, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2 
} from 'lucide-react';

interface PhotoViewerProps {
  photos?: string[];
  beforeTimestamp?: number | null;
  afterTimestamp?: number | null;
}

export function BeforeAfterPhotoViewer({
  photos = [],
  beforeTimestamp,
  afterTimestamp,
}: PhotoViewerProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const beforePhoto = photos[0] || null;
  const afterPhoto = photos[1] || null;

  // Format captured timestamp
  const formatPhotoTimestamp = (ts?: number | null) => {
    if (!ts) return 'Not recorded';
    try {
      return format(new Date(ts), 'dd MMM yyyy HH:mm:ss');
    } catch {
      return 'Invalid Date';
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 1));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Handle Drag/Pan when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch drag support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y
    });
  }, [isDragging]);

  // Bind mouse move/up globally to handle dragging outside image boundary
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  // Key listeners for escaping lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
        setLightboxIndex(0);
        handleResetZoom();
      } else if (e.key === 'ArrowRight' && lightboxIndex < 1 && afterPhoto) {
        setLightboxIndex(1);
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, afterPhoto]);

  // Open Lightbox
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
        Maintenance Photos
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BEFORE PANEL */}
        <div className="flex flex-col space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 bg-error/10 text-error rounded w-fit">
            BEFORE
          </span>
          <div 
            onClick={() => beforePhoto && openLightbox(0)}
            className={`group relative overflow-hidden rounded-xl border border-base-300 aspect-video flex items-center justify-center bg-base-200/50 cursor-pointer ${
              beforePhoto ? 'hover:border-primary/50' : 'cursor-default'
            }`}
          >
            {beforePhoto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={beforePhoto} 
                  alt="Repair state before"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Timestamp burn overlay simulation (guarantees readability inside photo boundaries) */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-[10px] font-mono text-white pointer-events-none select-none">
                  {formatPhotoTimestamp(beforeTimestamp)}
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <Maximize2 className="h-6 w-6 text-white" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-base-content/40 space-y-1">
                <CameraOff className="h-8 w-8 stroke-[1.5]" />
                <span className="text-sm font-medium">No photo available</span>
              </div>
            )}
          </div>
          <div className="px-1">
            <span className="text-xs text-base-content/60">Captured at: </span>
            <span className="text-xs font-mono font-semibold text-base-content/80">
              {formatPhotoTimestamp(beforeTimestamp)}
            </span>
          </div>
        </div>

        {/* AFTER PANEL */}
        <div className="flex flex-col space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 bg-success/10 text-success rounded w-fit">
            AFTER
          </span>
          <div 
            onClick={() => afterPhoto && openLightbox(1)}
            className={`group relative overflow-hidden rounded-xl border border-base-300 aspect-video flex items-center justify-center bg-base-200/50 cursor-pointer ${
              afterPhoto ? 'hover:border-primary/50' : 'cursor-default'
            }`}
          >
            {afterPhoto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={afterPhoto} 
                  alt="Repair state after"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Timestamp burn overlay simulation */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-[10px] font-mono text-white pointer-events-none select-none">
                  {formatPhotoTimestamp(afterTimestamp)}
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <Maximize2 className="h-6 w-6 text-white" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-base-content/40 space-y-1">
                <CameraOff className="h-8 w-8 stroke-[1.5]" />
                <span className="text-sm font-medium">No photo available</span>
              </div>
            )}
          </div>
          <div className="px-1">
            <span className="text-xs text-base-content/60">Captured at: </span>
            <span className="text-xs font-mono font-semibold text-base-content/80">
              {formatPhotoTimestamp(afterTimestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col justify-between select-none animate-fade-in">
          {/* Top Panel */}
          <div className="flex items-center justify-between p-4 bg-black/40 backdrop-blur-sm text-white z-10">
            <div>
              <h4 className="font-bold text-sm tracking-wide uppercase">
                {lightboxIndex === 0 ? 'BEFORE REPAIR' : 'AFTER REPAIR'}
              </h4>
              <p className="text-xs text-neutral-400 font-mono">
                {formatPhotoTimestamp(lightboxIndex === 0 ? beforeTimestamp : afterTimestamp)}
              </p>
            </div>
            
            <button 
              onClick={() => setLightboxIndex(null)}
              className="btn btn-sm btn-circle btn-ghost text-neutral-300 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Main Visual Panel */}
          <div 
            className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Nav Left */}
            {lightboxIndex === 1 && (
              <button 
                onClick={() => { setLightboxIndex(0); handleResetZoom(); }}
                className="absolute left-4 z-10 btn btn-circle bg-black/60 border-none hover:bg-black/80 text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Image Box */}
            <div 
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
              }}
              className="relative max-w-[90%] max-h-[80%] flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                ref={imgRef}
                src={photos[lightboxIndex]} 
                alt="Enlarged inspection visual"
                className="max-w-full max-h-full object-contain pointer-events-none rounded shadow-2xl"
              />
              
              {/* Overlay inside lightbox image mirroring physical stamp burn */}
              <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/80 rounded font-mono text-xs text-white pointer-events-none">
                {formatPhotoTimestamp(lightboxIndex === 0 ? beforeTimestamp : afterTimestamp)}
              </div>
            </div>

            {/* Nav Right */}
            {lightboxIndex === 0 && afterPhoto && (
              <button 
                onClick={() => { setLightboxIndex(1); handleResetZoom(); }}
                className="absolute right-4 z-10 btn btn-circle bg-black/60 border-none hover:bg-black/80 text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Control/Toolbar Panel */}
          <div className="flex items-center justify-center gap-4 p-4 bg-black/40 backdrop-blur-sm z-10">
            <button 
              onClick={handleZoomOut}
              disabled={scale <= 1}
              className="btn btn-sm btn-circle btn-ghost text-neutral-300 hover:text-white disabled:opacity-30"
              title="Zoom Out"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            
            <span className="text-xs text-neutral-400 font-mono min-w-10 text-center">
              {Math.round(scale * 100)}%
            </span>

            <button 
              onClick={handleZoomIn}
              disabled={scale >= 4}
              className="btn btn-sm btn-circle btn-ghost text-neutral-300 hover:text-white disabled:opacity-30"
              title="Zoom In"
            >
              <ZoomIn className="h-5 w-5" />
            </button>

            <div className="w-px h-6 bg-neutral-800"></div>

            <button 
              onClick={handleResetZoom}
              className="btn btn-sm btn-ghost gap-2 text-neutral-300 hover:text-white"
              title="Reset Zoom"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-xs">Reset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
