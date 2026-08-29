// app/api/analytics/dashboard/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

interface FlushEventDoc {
  waterVolume: number;
  timestamp: Timestamp;
}

interface UVCycleDoc {
  completed: boolean;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    let flushQuery: FirebaseFirestore.Query = adminDb.collection('flushEvents');
    let uvQuery: FirebaseFirestore.Query = adminDb.collection('uvCycles');

    if (from) {
      const fromTs = Timestamp.fromDate(new Date(`${from}T00:00:00.000Z`));
      const toTs = Timestamp.fromDate(new Date(`${to}T23:59:59.999Z`));
      flushQuery = flushQuery.where('timestamp', '>=', fromTs).where('timestamp', '<=', toTs);
      uvQuery = uvQuery.where('timestamp', '>=', fromTs).where('timestamp', '<=', toTs);
    }

    const uptimeDailyPromise = from && to
      ? adminDb
          .collection('deviceUptimeDaily')
          .where('date', '>=', from)
          .where('date', '<=', to)
          .get()
      : Promise.resolve(null);

    // Fetch all collections in parallel
    const [flushSnap, uvSnap, devicesSnap, uptimeDailySnap] = await Promise.all([
      flushQuery.get(),
      uvQuery.get(),
      adminDb.collection('devices').get(),
      uptimeDailyPromise,
    ]);

    // Total flushes and water usage
    const totalFlushes = flushSnap.size;
    let totalWaterLiters = 0;
    const dateSet = new Set<string>();

    for (const doc of flushSnap.docs) {
      const d = doc.data() as FlushEventDoc;
      totalWaterLiters += d.waterVolume ?? 0;

      const ts = d.timestamp as any;
      let dateObj: Date | null = null;
      if (ts) {
        if (typeof ts.toDate === 'function') {
          dateObj = ts.toDate();
        } else if (ts._seconds) {
          dateObj = new Date(ts._seconds * 1000);
        } else if (typeof ts === 'string' || typeof ts === 'number') {
          dateObj = new Date(ts);
        }
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        const date = dateObj.toISOString().slice(0, 10);
        dateSet.add(date);
      }
    }

    const distinctDays = dateSet.size || 1;
    const avgFlushesPerDay =
      Math.round((totalFlushes / distinctDays) * 100) / 100;

    // UV completion rate
    const uvDocs = uvSnap.docs.map((d) => d.data() as UVCycleDoc);
    const totalUV = uvDocs.length;
    const completedUV = uvDocs.filter((d) => d.completed).length;
    const failedUV = totalUV - completedUV;
    const uvCompletionRate =
      totalUV === 0 ? null : Math.round((completedUV / totalUV) * 10000) / 100;

    // Live Snapshot: devices with lastSeen within the last 5 minutes
    const FIVE_MIN_AGO = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const totalDevices = devicesSnap.size;
    const onlineDevices = devicesSnap.docs.filter((d) => {
      const ls = d.data().lastSeen as any;
      let lastSeenMillis = 0;
      if (ls) {
        if (typeof ls.toMillis === 'function') {
          lastSeenMillis = ls.toMillis();
        } else if (ls._seconds) {
          lastSeenMillis = ls._seconds * 1000;
        } else if (typeof ls === 'string' || typeof ls === 'number') {
          lastSeenMillis = new Date(ls).getTime();
        }
      }
      return lastSeenMillis >= FIVE_MIN_AGO.toMillis();
    }).length;

    const liveSnapshotPercent =
      totalDevices === 0
        ? 0
        : Math.round((onlineDevices / totalDevices) * 10000) / 100;

    // Calculate historical period SLA uptime if daily aggregation records exist
    let periodUptimePercent = liveSnapshotPercent;
    if (uptimeDailySnap && !uptimeDailySnap.empty) {
      let totalOnlineMin = 0;
      let totalTrackedMin = 0;
      for (const doc of uptimeDailySnap.docs) {
        const data = doc.data();
        totalOnlineMin += Number(data.onlineMinutes ?? 0);
        totalTrackedMin += Number(data.totalMinutes ?? 0);
      }
      if (totalTrackedMin > 0) {
        periodUptimePercent =
          Math.round((totalOnlineMin / totalTrackedMin) * 1000) / 10;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalFlushes,
        totalWaterLiters: Math.round(totalWaterLiters * 100) / 100,
        uvCompletionRate,
        uvStats: {
          total: totalUV,
          completed: completedUV,
          failed: failedUV,
        },
        avgFlushesPerDay,
        uptimePercent: periodUptimePercent,
        liveSnapshotPercent,
      },
    });
  } catch (error: any) {
    if (error instanceof Response || (error && error.status && typeof error.json === 'function')) {
      return new NextResponse(error.body, error);
    }
    console.error('[Analytics] dashboard error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to fetch dashboard analytics: ${errorMessage}` },
      { status: 500 },
    );
  }
}
