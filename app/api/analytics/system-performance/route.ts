// app/api/analytics/system-performance/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface DeviceDoc {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: Timestamp | null;
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
    await verifyAuthToken(request);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    const snap = await adminDb.collection('devices').get();
    const FIVE_MIN_AGO = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);

    const devices = snap.docs.map((d) => d.data() as DeviceDoc);
    const totalCount = devices.length;

    const onlineDevices = devices.filter((d) => {
      return d.lastSeen && d.lastSeen.toMillis() >= FIVE_MIN_AGO.toMillis();
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
        devices: devices.map((d) => ({
          id: d.id,
          name: d.name,
          status:
            d.lastSeen && d.lastSeen.toMillis() >= FIVE_MIN_AGO.toMillis()
              ? 'online'
              : 'offline',
          lastSeen: d.lastSeen ? d.lastSeen.toDate().toISOString() : null,
        })),
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
