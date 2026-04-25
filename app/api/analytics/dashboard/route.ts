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

    // Fetch all collections in parallel
    const [flushSnap, uvSnap, devicesSnap] = await Promise.all([
      adminDb.collection('flushEvents').get(),
      adminDb.collection('uvCycles').get(),
      adminDb.collection('devices').get(),
    ]);

    // Total flushes and water usage
    const totalFlushes = flushSnap.size;
    let totalWaterLiters = 0;
    const dateSet = new Set<string>();

    for (const doc of flushSnap.docs) {
      const d = doc.data() as FlushEventDoc;
      totalWaterLiters += d.waterVolume ?? 0;
      if (d.timestamp) {
        const date = d.timestamp.toDate().toISOString().slice(0, 10);
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
    const uvCompletionRate =
      totalUV === 0 ? 100 : Math.round((completedUV / totalUV) * 10000) / 100;

    // Uptime: devices with lastSeen within the last 5 minutes
    const FIVE_MIN_AGO = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const totalDevices = devicesSnap.size;
    const onlineDevices = devicesSnap.docs.filter((d) => {
      const lastSeen = d.data().lastSeen as Timestamp | null;
      return lastSeen && lastSeen.toMillis() >= FIVE_MIN_AGO.toMillis();
    }).length;

    const uptimePercent =
      totalDevices === 0
        ? 0
        : Math.round((onlineDevices / totalDevices) * 10000) / 100;

    return NextResponse.json({
      success: true,
      data: {
        totalFlushes,
        totalWaterLiters: Math.round(totalWaterLiters * 100) / 100,
        uvCompletionRate,
        avgFlushesPerDay,
        uptimePercent,
      },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard analytics' },
      { status: 500 },
    );
  }
}
