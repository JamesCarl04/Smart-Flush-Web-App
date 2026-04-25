// app/api/analytics/water-usage/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface FlushEventDoc {
  waterVolume: number;
  timestamp: Timestamp;
}

interface WaterUsageDay {
  date: string;
  totalVolume: number;
  avgVolume: number;
  flushCount: number;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

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
      const date = d.timestamp.toDate().toISOString().slice(0, 10);
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
