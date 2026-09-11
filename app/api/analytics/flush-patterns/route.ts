// app/api/analytics/flush-patterns/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

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

interface HasToDate {
  toDate: () => Date;
}

interface HasToMillis {
  toMillis: () => number;
}

interface SerializedTimestamp {
  _seconds?: number;
  seconds?: number;
  _nanoseconds?: number;
  nanoseconds?: number;
}

/**
 * Parses various timestamp formats into a valid Date object.
 * Supports Firestore Timestamp (toDate / toMillis), serialized timestamp objects (_seconds / seconds),
 * numeric epoch timestamps, and ISO date strings.
 */
function parseTimestampToDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof (raw as HasToDate).toDate === 'function') {
    const d = (raw as HasToDate).toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof (raw as HasToMillis).toMillis === 'function') {
    const d = new Date((raw as HasToMillis).toMillis());
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object') {
    const r = raw as SerializedTimestamp;
    const seconds = r._seconds ?? r.seconds;
    if (typeof seconds === 'number') {
      const nanoseconds = r._nanoseconds ?? r.nanoseconds ?? 0;
      const d = new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof raw === 'number') {
    const millis = raw < 1e11 ? raw * 1000 : raw;
    const d = new Date(millis);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      const millis = num < 1e11 ? num * 1000 : num;
      const d = new Date(millis);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    let flushQuery: FirebaseFirestore.Query = adminDb.collection('flushEvents');
    let startTs: Timestamp | null = null;
    let endTs: Timestamp | null = null;

    if (from) {
      const fromDatePHT = new Date(`${from}T00:00:00.000+08:00`);
      const fromDateUTC = new Date(`${from}T00:00:00.000Z`);
      const toDatePHT = new Date(`${to}T23:59:59.999+08:00`);
      const toDateUTC = new Date(`${to}T23:59:59.999Z`);

      const startMillis = Math.min(fromDatePHT.getTime(), fromDateUTC.getTime());
      const endMillis = Math.max(toDatePHT.getTime(), toDateUTC.getTime());

      if (!isNaN(startMillis) && !isNaN(endMillis)) {
        startTs = Timestamp.fromMillis(startMillis);
        endTs = Timestamp.fromMillis(endMillis);
        flushQuery = flushQuery
          .where('timestamp', '>=', startTs)
          .where('timestamp', '<=', endTs);
      }
    }

    let snap = await flushQuery.get();

    // Backwards compatibility / Fallback: If flushEvents has no records for the requested range,
    // fallback to lidEvents where status == 'open' so legacy test records are not lost.
    if (snap.empty) {
      let lidQuery: FirebaseFirestore.Query = adminDb
        .collection('lidEvents')
        .where('status', '==', 'open');

      if (startTs && endTs) {
        lidQuery = lidQuery
          .where('timestamp', '>=', startTs)
          .where('timestamp', '<=', endTs);
      }

      const lidSnap = await lidQuery.get();
      if (!lidSnap.empty) {
        snap = lidSnap;
      }
    }

    const byDay = new Array<number>(7).fill(0);
    const byHour = new Array<number>(24).fill(0);

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const rawTs = d.timestamp ?? d.createdAt;
      const dateObj = parseTimestampToDate(rawTs);
      if (!dateObj) continue;

      // Shift timestamp to Philippine Standard Time (UTC+8)
      const phMillis = dateObj.getTime() + 8 * 60 * 60 * 1000;
      const phDate = new Date(phMillis);

      // In-memory date filter in Philippine Time (Asia/Manila, UTC+8)
      if (from) {
        const phDateStr = phDate.toISOString().slice(0, 10);
        if (phDateStr < from || phDateStr > to!) {
          continue;
        }
      }

      const dayIndex = phDate.getUTCDay(); // 0 = Sunday ... 6 = Saturday
      const hourIndex = phDate.getUTCHours(); // 0 .. 23

      if (dayIndex >= 0 && dayIndex < 7) {
        byDay[dayIndex] += 1;
      }
      if (hourIndex >= 0 && hourIndex < 24) {
        byHour[hourIndex] += 1;
      }
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
