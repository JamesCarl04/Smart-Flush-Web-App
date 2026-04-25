// app/api/sensors/[id]/stats/route.ts
// GET /api/sensors/:id/stats — min/max/avg/count from today's readings
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SensorStats {
  sensorType: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

interface SensorReadingDoc {
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const dateKey = todayKey();
    const snapshot = await adminDb
      .collection('sensorReadings')
      .doc(dateKey)
      .collection('readings')
      .where('deviceId', '==', id)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        data: { date: dateKey, deviceId: id, stats: [] },
      });
    }

    // Group by sensorType
    const groups = new Map<string, number[]>();
    for (const doc of snapshot.docs) {
      const reading = doc.data() as SensorReadingDoc;
      const existing = groups.get(reading.sensorType) ?? [];
      existing.push(reading.value);
      groups.set(reading.sensorType, existing);
    }

    const stats: SensorStats[] = [];
    for (const [sensorType, values] of groups) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      stats.push({
        sensorType,
        min,
        max,
        avg: Math.round(avg * 100) / 100,
        count: values.length,
      });
    }

    return NextResponse.json({
      success: true,
      data: { date: dateKey, deviceId: id, stats },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Sensors] stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute stats' },
      { status: 500 },
    );
  }
}
