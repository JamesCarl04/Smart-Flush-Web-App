// app/api/sensors/[id]/readings/route.ts
// GET /api/sensors/:id/readings?from=YYYY-MM-DD&to=YYYY-MM-DD
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SensorReadingDoc {
  id: string;
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp?:
    | FirebaseFirestore.Timestamp
    | { _seconds?: number; seconds?: number }
    | Date
    | null;
}

function timestampToMillis(value: SensorReadingDoc['timestamp']): number {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    return value.toMillis();
  }

  if (typeof value === 'object') {
    const seconds =
      ('seconds' in value &&
        typeof value.seconds === 'number' &&
        value.seconds) ||
      ('_seconds' in value &&
        typeof value._seconds === 'number' &&
        value._seconds) ||
      0;
    return seconds * 1000;
  }

  return 0;
}

/** Returns an array of YYYY-MM-DD strings from start to end (inclusive) */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

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

    const dates = dateRange(from, to ?? from);

    // Query each date partition in parallel (no orderBy — sort in JS to avoid composite index)
    const snapshots = await Promise.all(
      dates.map((date) =>
        adminDb
          .collection('sensorReadings')
          .doc(date)
          .collection('readings')
          .where('deviceId', '==', id)
          .get(),
      ),
    );

    const readings: SensorReadingDoc[] = snapshots
      .flatMap((snap) => snap.docs.map((doc) => doc.data() as SensorReadingDoc))
      .sort(
        (a, b) =>
          timestampToMillis(a.timestamp) - timestampToMillis(b.timestamp),
      );

    return NextResponse.json({ success: true, data: readings });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Sensors] readings error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch readings',
      },
      { status: 500 },
    );
  }
}
