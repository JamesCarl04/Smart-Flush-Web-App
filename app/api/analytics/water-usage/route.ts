// app/api/analytics/water-usage/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface FlushEventDoc {
  waterVolume: number;
  timestamp: unknown;
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const record = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof record.toDate === 'function') return record.toDate();
    if (typeof record.toMillis === 'function') return new Date(record.toMillis());
    if (typeof record._seconds === 'number') return new Date(record._seconds * 1000);
    if (typeof record.seconds === 'number') return new Date(record.seconds * 1000);
  }
  return null;
}

interface WaterUsageDay {
  date: string;
  totalVolume: number;
  avgVolume: number;
  flushCount: number;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    if (!from) {
      return NextResponse.json(
        {
          success: false,
          error: 'from query parameter is required (YYYY-MM-DD)',
        },
        { status: 400 },
      );
    }

    const fromTs = Timestamp.fromDate(new Date(`${from}T00:00:00.000Z`));
    const toTs = Timestamp.fromDate(new Date(`${to}T23:59:59.999Z`));

    const snap = await adminDb
      .collection('flushEvents')
      .where('timestamp', '>=', fromTs)
      .where('timestamp', '<=', toTs)
      .orderBy('timestamp', 'asc')
      .get();

    // Group by date
    const grouped = new Map<string, number[]>();
    for (const doc of snap.docs) {
      const d = doc.data() as FlushEventDoc;
      const parsedDate = toDateSafe(d.timestamp);
      if (!parsedDate) continue;
      const date = parsedDate.toISOString().slice(0, 10);
      const existing = grouped.get(date) ?? [];
      existing.push(d.waterVolume ?? 0);
      grouped.set(date, existing);
    }

    const result: WaterUsageDay[] = [];
    for (const [date, volumes] of grouped) {
      const totalVolume = volumes.reduce((a, b) => a + b, 0);
      const avgVolume = totalVolume / volumes.length;
      result.push({
        date,
        totalVolume: Math.round(totalVolume * 100) / 100,
        avgVolume: Math.round(avgVolume * 100) / 100,
        flushCount: volumes.length,
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] water-usage error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch water usage' },
      { status: 500 },
    );
  }
}
