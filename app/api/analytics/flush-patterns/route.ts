// app/api/analytics/flush-patterns/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface LidEventDoc {
  status: 'open' | 'closed';
  timestamp: Timestamp;
}

interface PatternBucket {
  label: string;
  count: number;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    // Only open events represent usage
    const snap = await adminDb
      .collection('lidEvents')
      .where('status', '==', 'open')
      .get();

    const byDay = new Array<number>(7).fill(0);
    const byHour = new Array<number>(24).fill(0);

    for (const doc of snap.docs) {
      const d = doc.data() as LidEventDoc;
      if (!d.timestamp) continue;
      const dt = d.timestamp.toDate();
      byDay[dt.getDay()] += 1;
      byHour[dt.getHours()] += 1;
    }

    const byDayResult: PatternBucket[] = byDay.map((count, i) => ({
      label: DAY_NAMES[i] ?? `Day ${i}`,
      count,
    }));

    const byHourResult: PatternBucket[] = byHour.map((count, i) => ({
      label: `${String(i).padStart(2, '0')}:00`,
      count,
    }));

    return NextResponse.json({
      success: true,
      data: { byDay: byDayResult, byHour: byHourResult },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] flush-patterns error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch flush patterns' },
      { status: 500 },
    );
  }
}
