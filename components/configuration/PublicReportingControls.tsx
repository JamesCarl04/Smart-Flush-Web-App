'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import QRCode from 'qrcode';
import { apiFetch } from '@/lib/api-client';
import type { UserRole } from '@/lib/auth-helpers';
import { buildPublicReportUrl, sanitizeQrLabelFilename } from '@/lib/public-report-qr';
import { CampusBatchQrModal } from './CampusBatchQrModal';

interface DeviceForQr {
  id: string;
  name: string;
  location: string;
  publicReportingEnabled: boolean;
}

export function PublicReportingControls({
  user,
  role,
  device,
  siteUrl,
  onUpdated,
}: {
  user: User;
  role: UserRole | null;
  device: DeviceForQr;
  siteUrl: string;
  onUpdated: (enabled: boolean) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const reportUrl = useMemo(() => buildPublicReportUrl(siteUrl, device.id), [device.id, siteUrl]);

  useEffect(() => {
    if (role !== 'admin') return;
    let cancelled = false;
    void QRCode.toDataURL(reportUrl, { width: 360, margin: 2, errorCorrectionLevel: 'H' }).then((value) => {
      if (!cancelled) setQrDataUrl(value);
    });
    return () => { cancelled = true; };
  }, [reportUrl, role]);

  if (role !== 'admin') return null;

  const toggle = async () => {
    const enabled = !device.publicReportingEnabled;
    setSaving(true);
    try {
      await apiFetch(`/api/devices/${encodeURIComponent(device.id)}`, user, {
        method: 'PUT', body: JSON.stringify({ publicReportingEnabled: enabled }),
      });
      onUpdated(enabled);
    } finally {
      setSaving(false);
    }
  };

  const downloadLabel = async () => {
    const qr = qrDataUrl || await QRCode.toDataURL(reportUrl, { width: 600, margin: 2, errorCorrectionLevel: 'H' });
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1150;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111827';
    context.textAlign = 'center';
    context.font = 'bold 52px sans-serif';
    context.fillText('Report a restroom issue', 450, 85);
    context.font = 'bold 38px sans-serif';
    context.fillText(device.name, 450, 150);
    context.fillStyle = '#475569';
    context.font = '30px sans-serif';
    context.fillText(device.location, 450, 200);
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('QR image failed')); image.src = qr; });
    context.drawImage(image, 150, 240, 600, 600);
    context.fillStyle = '#111827';
    context.font = 'bold 32px sans-serif';
    context.fillText('Scan with your phone camera', 450, 900);
    context.fillStyle = '#475569';
    context.font = '22px sans-serif';
    context.fillText(reportUrl, 450, 955, 800);
    context.font = '24px sans-serif';
    context.fillText('No sign-in required. Photo is optional.', 450, 1030);
    const link = document.createElement('a');
    link.download = sanitizeQrLabelFilename(device.name);
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-base font-bold">Public issue reporting</h2><p className="text-xs text-slate-500">Administrator-only QR label and anonymous reporting control.</p></div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={device.publicReportingEnabled} disabled={saving} onChange={() => void toggle()} />Enabled</label>
      </div>
      <div className="mt-5 grid items-center gap-6 sm:grid-cols-[220px_1fr]">
        {qrDataUrl ? <img src={qrDataUrl} alt="Public issue report QR preview" width={220} height={220} className="rounded-xl border bg-white p-2" /> : <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" />}
        <div className="space-y-2">
          <p className="font-semibold">{device.name}</p>
          <p className="text-sm text-slate-500">{device.location}</p>
          <p className="break-all font-mono text-xs text-slate-500">{reportUrl}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void downloadLabel()}
              className="rounded-lg bg-[#B5121B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8F0D16]"
            >
              Download printable PNG label
            </button>
            <button
              type="button"
              onClick={() => setShowBatchModal(true)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Campus Batch Print (All Stalls)
            </button>
          </div>
        </div>
      </div>

      <CampusBatchQrModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        siteUrl={siteUrl}
      />
    </section>
  );
}
