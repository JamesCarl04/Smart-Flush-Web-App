// app/api/alerts/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

interface CreateAlertBody {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  deviceId: string;
}

interface AlertDoc {
  timestamp?:
    | FirebaseFirestore.Timestamp
    | { _seconds?: number; seconds?: number }
    | Date
    | null;
  acknowledged?: boolean;
}

function timestampToMillis(value: AlertDoc['timestamp']): number {
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

// GET /api/alerts?acknowledged=false
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const { searchParams } = new URL(request.url);
    const acknowledgedParam = searchParams.get('acknowledged');

    const snap = await adminDb.collection('alerts').get();
    const alerts = snap.docs
      .map((doc) => doc.data() as AlertDoc & Record<string, unknown>)
      .filter((alert) => {
        if (acknowledgedParam === 'false') {
          return alert.acknowledged === false;
        }

        if (acknowledgedParam === 'true') {
          return alert.acknowledged === true;
        }

        return true;
      })
      .sort(
        (a, b) =>
          timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp),
      );

    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Alerts] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch alerts',
      },
      { status: 500 },
    );
  }
}

// POST /api/alerts — create alert
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const body = (await request.json()) as Partial<CreateAlertBody>;
    const { type, message, severity, deviceId } = body;

    if (!type || !message || !severity || !deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'type, message, severity, and deviceId are required',
        },
        { status: 400 },
      );
    }

    const validSeverities = ['low', 'medium', 'high'];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { success: false, error: 'severity must be low, medium, or high' },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('alerts').doc();
    await docRef.set({
      id: docRef.id,
      type,
      message,
      severity,
      acknowledged: false,
      deviceId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { success: true, data: { id: docRef.id } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Alerts] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 },
    );
  }
}
