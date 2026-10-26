// app/api/analytics/system-performance/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface DeviceDoc {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: unknown;
}

function toMillisSafe(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const record = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof record.toMillis === 'function') return record.toMillis();
    if (typeof record.toDate === 'function') return record.toDate().getTime();
    if (typeof record._seconds === 'number') return record._seconds * 1000;
    if (typeof record.seconds === 'number') return record.seconds * 1000;
  }
  return null;
}

function getDateList(fromStr: string, toStr: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${fromStr}T00:00:00.000Z`);
  const end = new Date(`${toStr}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    const snap = await adminDb.collection('devices').get();
    const fiveMinAgoMillis = Date.now() - 5 * 60 * 1000;

    const devices = snap.docs.map((d) => d.data() as DeviceDoc);
    const totalCount = devices.length;

    const onlineDevices = devices.filter((d) => {
      const lastSeenMillis = toMillisSafe(d.lastSeen);
      return lastSeenMillis !== null && lastSeenMillis >= fiveMinAgoMillis;
    });

    const onlineCount = onlineDevices.length;
    const liveSnapshotPercent =
      totalCount === 0
        ? 0
        : Math.round((onlineCount / totalCount) * 10000) / 100;

    let periodUptimePercent = liveSnapshotPercent;
    let dailyList: Array<{ date: string; uptimePercent: number }> = [];

    if (from && to) {
      const allDates = getDateList(from, to);
      const uptimeSnap = await adminDb
        .collection('deviceUptimeDaily')
        .where('date', '>=', from)
        .where('date', '<=', to)
        .get();

      const dayMap = new Map<string, { onlineMinutes: number; totalMinutes: number }>();
      for (const doc of uptimeSnap.docs) {
        const data = doc.data();
        const date = data.date as string;
        const existing = dayMap.get(date) ?? { onlineMinutes: 0, totalMinutes: 0 };
        existing.onlineMinutes += Number(data.onlineMinutes ?? 0);
        existing.totalMinutes += Number(data.totalMinutes ?? 0);
        dayMap.set(date, existing);
      }

      let totalOnline = 0;
      let totalTracked = 0;

      dailyList = allDates.map((date) => {
        const entry = dayMap.get(date);
        if (entry && entry.totalMinutes > 0) {
          totalOnline += entry.onlineMinutes;
          totalTracked += entry.totalMinutes;
          const dayPct =
            Math.round((entry.onlineMinutes / entry.totalMinutes) * 1000) / 10;
          return { date, uptimePercent: dayPct };
        }

        // For dates where minute tracking has not accumulated or cold start:
        const todayStr = new Date().toISOString().slice(0, 10);
        const fallbackPct = date === todayStr ? liveSnapshotPercent : 100;
        return { date, uptimePercent: fallbackPct };
      });

      if (totalTracked > 0) {
        periodUptimePercent =
          Math.round((totalOnline / totalTracked) * 1000) / 10;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        uptimePercent: periodUptimePercent,
        liveSnapshotPercent,
        onlineCount,
        totalCount,
        daily: dailyList,
        devices: devices.map((d) => {
          const lastSeenMillis = toMillisSafe(d.lastSeen);
          return {
            id: d.id,
            name: d.name,
            status:
              lastSeenMillis !== null && lastSeenMillis >= fiveMinAgoMillis
                ? 'online'
                : 'offline',
            lastSeen:
              lastSeenMillis !== null
                ? new Date(lastSeenMillis).toISOString()
                : null,
          };
        }),
      },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] system-performance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch system performance' },
      { status: 500 },
    );
  }
}
