'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Printer, X, Filter } from 'lucide-react';
import {
  getAllStalls,
  getAllRooms,
} from '@/lib/restrooms';
import { buildPublicReportUrl } from '@/lib/public-report-qr';

interface CampusBatchQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteUrl: string;
}

interface PrintableQrItem {
  id: string;
  name: string;
  roomName: string;
  stallLabel: string;
  floor: string;
  type: 'stall' | 'common';
  reportUrl: string;
}

// Global cache for generated QR codes so scrolling/filtering never re-encodes images
const QR_CACHE = new Map<string, string>();

const QrCard = React.memo(function QrCard({
  item,
  qrDataUrl,
}: {
  item: PrintableQrItem;
  qrDataUrl?: string;
}) {
  // Strip redundant floor prefix (e.g. "1F ") since the floor is already in the top header tag
  const displayRoomTitle = item.roomName.replace(/^[1-4]F\s+/i, '');

  return (
    <div className="flex flex-col items-center justify-between rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-center shadow-xs transition-all duration-200 hover:shadow-md hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 print:border-slate-800 print:p-4 print:break-inside-avoid print:transform-none transform-gpu">
      {/* Header Tag — Trust & Location Anchor */}
      <div className="w-full border-b border-slate-100 pb-2.5 dark:border-slate-800 print:border-slate-300">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 print:text-black">
          SDCA HYGIENE CARE • {item.floor}
        </span>
        <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white print:text-black leading-snug">
          {displayRoomTitle}
        </h3>
        {item.type === 'stall' ? (
          <div className="mt-1.5 inline-flex items-center rounded-md bg-slate-900 px-3 py-0.5 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900 print:bg-black print:text-white">
            {item.stallLabel}
          </div>
        ) : (
          <div className="mt-1.5 inline-flex items-center rounded-md border border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 print:border-slate-400 print:text-black">
            Main Room Entry QR
          </div>
        )}
      </div>

      {/* QR Code */}
      <div className="my-3 flex items-center justify-center p-1 bg-white rounded-lg">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR for ${displayRoomTitle} ${item.stallLabel}`}
            width={180}
            height={180}
            decoding="async"
            loading="lazy"
            className="h-44 w-44 object-contain"
          />
        ) : (
          <div className="flex h-44 w-44 animate-pulse items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-400">
            Generating QR…
          </div>
        )}
      </div>

      {/* Footer Call to Action — Clean Civic Duty Nudge without Emojis */}
      <div className="w-full border-t border-slate-100 pt-2 text-[10px] dark:border-slate-800 print:border-slate-300">
        <p className="font-semibold text-slate-900 dark:text-slate-100 print:text-black">
          Help us keep your restroom clean & fresh
        </p>
        <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300 print:text-slate-700">
          Scan to report an issue in 10s or view live status
        </p>
        <p className="mt-1 font-mono text-[9px] text-slate-400 dark:text-slate-500 print:text-slate-600">
          ID: {item.id}
        </p>
      </div>
    </div>
  );
});

export function CampusBatchQrModal({
  isOpen,
  onClose,
  siteUrl,
}: CampusBatchQrModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'stall' | 'common'>('all');
  const [qrMap, setQrMap] = useState<Map<string, string>>(() => new Map(QR_CACHE));
  const [loadingQrs, setLoadingQrs] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background body scrolling and mark body for print isolation when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('batch-qr-modal-open');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.classList.remove('batch-qr-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const allItems: PrintableQrItem[] = useMemo(() => {
    const stalls = getAllStalls();
    const rooms = getAllRooms();

    const stallItems: PrintableQrItem[] = stalls.map((stall) => ({
      id: stall.id,
      name: stall.fullLabel,
      roomName: stall.roomName,
      stallLabel: stall.stallLabel,
      floor: stall.floor,
      type: 'stall',
      reportUrl: buildPublicReportUrl(siteUrl, stall.id),
    }));

    const commonItems: PrintableQrItem[] = rooms.map((room) => ({
      id: room.id,
      name: `${room.roomName} • Common Entrance`,
      roomName: room.roomName,
      stallLabel: 'Main Entrance QR',
      floor: room.floor,
      type: 'common',
      reportUrl: buildPublicReportUrl(siteUrl, room.id),
    }));

    return [...stallItems, ...commonItems];
  }, [siteUrl]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (selectedFloor !== 'all' && item.floor !== selectedFloor) return false;
      if (selectedType !== 'all' && item.type !== selectedType) return false;
      return true;
    });
  }, [allItems, selectedFloor, selectedType]);

  // Generate missing QR codes efficiently in a single batch with module-level caching
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    async function generateMissingQrs() {
      const missingItems = filteredItems.filter((item) => !QR_CACHE.has(item.id));
      if (missingItems.length === 0) {
        setQrMap(new Map(QR_CACHE));
        return;
      }

      setLoadingQrs(true);

      // Process batch concurrently
      await Promise.all(
        missingItems.map(async (item) => {
          try {
            const dataUrl = await QRCode.toDataURL(item.reportUrl, {
              width: 300,
              margin: 2,
              errorCorrectionLevel: 'H',
            });
            QR_CACHE.set(item.id, dataUrl);
          } catch (err) {
            console.error(`Failed to generate QR for ${item.id}`, err);
          }
        }),
      );

      if (!isCancelled) {
        setQrMap(new Map(QR_CACHE));
        setLoadingQrs(false);
      }
    }

    void generateMissingQrs();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, filteredItems]);

  if (!isOpen || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div
      id="campus-batch-qr-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-qr-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 md:p-8 backdrop-blur-md overscroll-contain overflow-hidden animate-fade-in print:static print:p-0 print:bg-white print:backdrop-blur-none print:block print:w-full print:h-auto print:overflow-visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Centered Modal Container locked firmly in viewport */}
      <div className="relative flex max-h-[92vh] sm:max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-scale-up overflow-hidden print:max-h-none print:h-auto print:max-w-none print:border-none print:shadow-none print:rounded-none print:overflow-visible">
        
        {/* Pinned Sticky Header Bar: Locked in place, never scrolled past */}
        <div className="shrink-0 z-20 sticky top-0 border-b border-slate-200 bg-white/95 p-4 sm:p-5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="batch-qr-title" className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Campus Batch QR Generator (SDCA Annex)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Showing {filteredItems.length} of {allItems.length} labels ({getAllStalls().length} Stalls + {getAllRooms().length} Common Areas)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Floor Filter */}
              <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-slate-400 shrink-0" />
                <select
                  aria-label="Filter by Floor"
                  value={selectedFloor}
                  onChange={(e) => setSelectedFloor(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#B5121B]/30"
                >
                  <option value="all">All Floors</option>
                  <option value="1F">1st Floor (1F)</option>
                  <option value="2F">2nd Floor (2F)</option>
                  <option value="3F">3rd Floor (3F)</option>
                  <option value="4F">4th Floor (4F)</option>
                </select>
              </div>

              {/* Type Filter */}
              <select
                aria-label="Filter by Location Type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as 'all' | 'stall' | 'common')}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#B5121B]/30"
              >
                <option value="all">All Types</option>
                <option value="stall">Stalls Only</option>
                <option value="common">Common Areas Only</option>
              </select>

              <button
                type="button"
                onClick={handlePrint}
                disabled={loadingQrs}
                className="inline-flex items-center gap-2 rounded-lg bg-[#B5121B] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#8F0D16] transition-colors disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                <span>Print Sheet / Save PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Smooth Hardware-Accelerated Scrollable Cards Grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 scroll-smooth transform-gpu [will-change:scroll-position] print:overflow-visible print:p-0">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-4">
            {filteredItems.map((item) => (
              <QrCard
                key={item.id}
                item={item}
                qrDataUrl={qrMap.get(item.id)}
              />
            ))}
          </div>
        </div>

        {/* Modal Footer Pinned Indicator */}
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-2.5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400 print:hidden">
          Scroll through all {filteredItems.length} facility QR codes or press Esc to close.
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}