// app/api/reports/[id]/download/route.ts
// GET /api/reports/:id/download — re-generates a previously created report from its metadata
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, requireSupervisorOrAdmin } from '@/lib/auth-helpers';
import { validateIsoDateRange } from '@/lib/date-utils';
import {
  buildUvCycleRangeReport,
  buildUvCyclesReportCsv,
  getPhtPeriodBounds,
  normalizeUvCycleDoc,
  phtDateRangeToUtcMs,
  type RawUvCycleRecord,
} from '@/lib/uv-cycle-analytics';
import {
  getCachedAnalyticsTelemetry,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
} from '@/lib/local-runtime-cache';
import { Timestamp } from 'firebase-admin/firestore';
import type { FlushEventRow, UVCycleRow } from '@/lib/pdf-report';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ReportMetadata {
  id: string;
  type: string;
  from: string;
  to: string;
  format: 'csv' | 'json' | 'pdf';
  userId: string;
}

interface FlushEventDoc {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestamp: unknown;
}

interface UVCycleDoc {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  timestamp: unknown;
}

function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function toIsoStringSafe(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (typeof value === 'object') {
    const record = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof record.toDate === 'function') return record.toDate().toISOString();
    if (typeof record.toMillis === 'function') return new Date(record.toMillis()).toISOString();
    if (typeof record._seconds === 'number') return new Date(record._seconds * 1000).toISOString();
    if (typeof record.seconds === 'number') return new Date(record.seconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);
    const { id } = await params;

    const reportDoc = await adminDb.collection('reports').doc(id).get();
    if (!reportDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 },
      );
    }

    const meta = reportDoc.data() as ReportMetadata;

    // Users can only download their own reports
    if (meta.userId !== user.uid) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    if (typeof meta.from !== 'string' || typeof meta.to !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Report has invalid date metadata' },
        { status: 400 },
      );
    }
    const dateRangeCheck = validateIsoDateRange(meta.from, meta.to, 366);
    if (!dateRangeCheck.ok) {
      return NextResponse.json(
        { success: false, error: dateRangeCheck.error },
        { status: 400 },
      );
    }

    if (meta.type === 'uv_cycles') {
      const bounds = getPhtPeriodBounds(meta.to);
      const qFrom = meta.from < bounds.queryFrom ? meta.from : bounds.queryFrom;
      const qTo = meta.to > bounds.queryTo ? meta.to : bounds.queryTo;
      const { startMs, endMs } = phtDateRangeToUtcMs(qFrom, qTo);

      let records: RawUvCycleRecord[] = [];
      if (isFirestoreQuotaCircuitOpen()) {
        if (process.env.NODE_ENV !== 'test') {
          const local = await getCachedAnalyticsTelemetry();
          records = local.uvCycles
            .filter((e) => e.timestampMs >= startMs && e.timestampMs <= endMs)
            .map((e) => ({
              id: e.id,
              deviceId: e.deviceId,
              duration: e.duration,
              completed: e.completed,
              reason: e.reason ?? null,
              timestampMs: e.timestampMs,
            }));
        }
      } else {
        try {
          const snap = await adminDb
            .collection('uvCycles')
            .where('timestamp', '>=', Timestamp.fromMillis(startMs))
            .where('timestamp', '<=', Timestamp.fromMillis(endMs))
            .orderBy('timestamp', 'asc')
            .limit(5_000)
            .get();
          for (const doc of snap.docs) {
            const normalized = normalizeUvCycleDoc(doc.data(), doc.id);
            if (normalized) records.push(normalized);
          }
        } catch (queryErr) {
          if (isQuotaExceededError(queryErr)) {
            markFirestoreQuotaExhausted();
            if (process.env.NODE_ENV !== 'test') {
              const local = await getCachedAnalyticsTelemetry();
              records = local.uvCycles
                .filter((e) => e.timestampMs >= startMs && e.timestampMs <= endMs)
                .map((e) => ({
                  id: e.id,
                  deviceId: e.deviceId,
                  duration: e.duration,
                  completed: e.completed,
                  reason: e.reason ?? null,
                  timestampMs: e.timestampMs,
                }));
            }
          } else {
            throw queryErr;
          }
        }
      }

      const uvReport = buildUvCycleRangeReport({
        records,
        from: meta.from,
        to: meta.to,
      });
      const uvFilename = `smart-flush-uv-cycles-${meta.from}-${meta.to}`;

      if (meta.format === 'csv') {
        return new Response(buildUvCyclesReportCsv(uvReport), {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${uvFilename}.csv"`,
          },
        });
      }

      if (meta.format === 'json') {
        return new Response(JSON.stringify(uvReport, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${uvFilename}.json"`,
          },
        });
      }

      const { generateUvCyclePDFBuffer } = await import('@/lib/pdf-report');
      const pdfBuffer = await generateUvCyclePDFBuffer(uvReport);
      const pdfBody = Uint8Array.from(pdfBuffer).buffer as ArrayBuffer;
      return new Response(pdfBody, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${uvFilename}.pdf"`,
        },
      });
    }

    const fromTs = Timestamp.fromDate(new Date(`${meta.from}T00:00:00.000+08:00`));
    const toTs = Timestamp.fromDate(new Date(`${meta.to}T23:59:59.999+08:00`));

    const [flushSnap, uvSnap] = await Promise.all([
      adminDb
        .collection('flushEvents')
        .where('timestamp', '>=', fromTs)
        .where('timestamp', '<=', toTs)
        .orderBy('timestamp', 'asc')
        .get(),
      adminDb
        .collection('uvCycles')
        .where('timestamp', '>=', fromTs)
        .where('timestamp', '<=', toTs)
        .orderBy('timestamp', 'asc')
        .get(),
    ]);

    const flushEvents = flushSnap.docs.map((d) => d.data() as FlushEventDoc);
    const uvCycles = uvSnap.docs.map((d) => d.data() as UVCycleDoc);
    const filename = `smart-flush-${meta.from}-${meta.to}`;

    // ── CSV ────────────────────────────────────────────────────────────────────
    if (meta.format === 'csv') {
      const lines: string[] = [
        '--- FLUSH EVENTS ---',
        'id,deviceId,waterVolume,duration,timestamp',
        ...flushEvents.map((event) =>
          [
            escapeCsvField(event.id),
            escapeCsvField(event.deviceId),
            escapeCsvField(event.waterVolume),
            escapeCsvField(event.duration),
            escapeCsvField(toIsoStringSafe(event.timestamp)),
          ].join(','),
        ),
        '',
        '--- UV CYCLES ---',
        'id,deviceId,duration,completed,timestamp',
        ...uvCycles.map((c) =>
          [
            escapeCsvField(c.id),
            escapeCsvField(c.deviceId),
            escapeCsvField(c.duration),
            escapeCsvField(c.completed),
            escapeCsvField(toIsoStringSafe(c.timestamp)),
          ].join(','),
        ),
      ];
      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    // ── JSON ───────────────────────────────────────────────────────────────────
    if (meta.format === 'json') {
      const totalWater = flushEvents.reduce(
        (s, event) => s + (event.waterVolume ?? 0),
        0,
      );
      const uvCompleted = uvCycles.filter((c) => c.completed).length;
      const json = {
        summary: {
          totalFlushes: flushEvents.length,
          totalWaterLiters: Math.round(totalWater * 100) / 100,
          uvCycles: uvCycles.length,
          uvCompletionRate:
            uvCycles.length === 0
              ? 100
              : Math.round((uvCompleted / uvCycles.length) * 10000) / 100,
        },
        flushEvents: flushEvents.map((event) => ({
          ...event,
          timestamp: toIsoStringSafe(event.timestamp),
        })),
        uvCycles: uvCycles.map((c) => ({
          ...c,
          timestamp: toIsoStringSafe(c.timestamp),
        })),
      };
      return new Response(JSON.stringify(json, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}.json"`,
        },
      });
    }

    // ── PDF ────────────────────────────────────────────────────────────────────
    const { generatePDFBuffer } = await import('@/lib/pdf-report');

    const flushRows: FlushEventRow[] = flushEvents.map((event) => ({
      id: event.id,
      deviceId: event.deviceId,
      waterVolume: event.waterVolume,
      duration: event.duration,
      timestamp: toIsoStringSafe(event.timestamp),
    }));

    const uvRows: UVCycleRow[] = uvCycles.map((c) => ({
      id: c.id,
      deviceId: c.deviceId,
      duration: c.duration,
      completed: c.completed,
      timestamp: toIsoStringSafe(c.timestamp),
    }));

    const pdfBuffer = await generatePDFBuffer(
      meta.from,
      meta.to,
      flushRows,
      uvRows,
    );
    const pdfBody = Uint8Array.from(pdfBuffer).buffer as ArrayBuffer;

    return new Response(pdfBody, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[Reports] download error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download report' },
      { status: 500 },
    );
  }
}
