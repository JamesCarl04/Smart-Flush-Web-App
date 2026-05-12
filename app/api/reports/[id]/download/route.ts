// app/api/reports/[id]/download/route.ts
// GET /api/reports/:id/download — re-generates a previously created report from its metadata
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
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
  timestamp: Timestamp;
}

interface UVCycleDoc {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  timestamp: Timestamp;
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  try {
    const user = await verifyAuthToken(request);
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

    const fromTs = Timestamp.fromDate(new Date(`${meta.from}T00:00:00.000Z`));
    const toTs = Timestamp.fromDate(new Date(`${meta.to}T23:59:59.999Z`));

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
        ...flushEvents.map(
          (event) =>
            `${event.id},${event.deviceId},${event.waterVolume},${event.duration},${event.timestamp.toDate().toISOString()}`,
        ),
        '',
        '--- UV CYCLES ---',
        'id,deviceId,duration,completed,timestamp',
        ...uvCycles.map(
          (c) =>
            `${c.id},${c.deviceId},${c.duration},${c.completed},${c.timestamp.toDate().toISOString()}`,
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
          timestamp: event.timestamp.toDate().toISOString(),
        })),
        uvCycles: uvCycles.map((c) => ({
          ...c,
          timestamp: c.timestamp.toDate().toISOString(),
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
      timestamp: event.timestamp.toDate().toISOString(),
    }));

    const uvRows: UVCycleRow[] = uvCycles.map((c) => ({
      id: c.id,
      deviceId: c.deviceId,
      duration: c.duration,
      completed: c.completed,
      timestamp: c.timestamp.toDate().toISOString(),
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
