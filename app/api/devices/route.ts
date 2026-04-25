// app/api/devices/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

interface CreateDeviceBody {
  name: string;
  firmwareVersion?: string;
  config?: Record<string, string | number | boolean>;
}

// GET /api/devices — list all devices
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const snapshot = await adminDb.collection('devices').get();
    const devices = snapshot.docs.map((doc) => doc.data());

    return NextResponse.json({ success: true, data: devices });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 },
    );
  }
}

// POST /api/devices — create a new device
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const body = (await request.json()) as Partial<CreateDeviceBody>;

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('devices').doc();
    const device = {
      id: docRef.id,
      name: body.name,
      status: 'offline' as const,
      firmwareVersion: body.firmwareVersion ?? '',
      lastSeen: null,
      config: body.config ?? {},
      createdAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(device);

    return NextResponse.json(
      { success: true, data: { ...device, id: docRef.id } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create device' },
      { status: 500 },
    );
  }
}
