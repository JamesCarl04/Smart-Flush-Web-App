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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const snap = await adminDb.collection('devices').get();
    const FIVE_MIN_AGO = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);

    const devices = snap.docs.map((d) => d.data() as DeviceDoc);
    const totalCount = devices.length;

    const onlineDevices = devices.filter((d) => {
      return d.lastSeen && d.lastSeen.toMillis() >= FIVE_MIN_AGO.toMillis();
    });

    const onlineCount = onlineDevices.length;
    const uptimePercent =
      totalCount === 0
        ? 0
        : Math.round((onlineCount / totalCount) * 10000) / 100;

    return NextResponse.json({
      success: true,
      data: {
        uptimePercent,
        onlineCount,
        totalCount,
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
