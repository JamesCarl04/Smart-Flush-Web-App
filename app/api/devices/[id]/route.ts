// app/api/devices/[id]/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateDeviceBody {
  name?: string;
  description?: string;
  config?: Record<string, string | number | boolean>;
}

// GET /api/devices/:id
export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const doc = await adminDb.collection('devices').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: doc.data() });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] GET/:id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device' },
      { status: 500 },
    );
  }
}

// PUT /api/devices/:id — update name, description, or config
export async function PUT(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const body = (await request.json()) as UpdateDeviceBody;
    const updates: UpdateDeviceBody = {};

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: 'Device name is required' },
          { status: 400 },
        );
      }
      updates.name = trimmedName;
    }

    if (body.description !== undefined) {
      updates.description = body.description.trim();
    }

    if (body.config !== undefined) {
      if (
        typeof body.config !== 'object' ||
        body.config === null ||
        Array.isArray(body.config)
      ) {
        return NextResponse.json(
          { success: false, error: 'config must be an object' },
          { status: 400 },
        );
      }

      updates.config = body.config;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('devices').doc(id);
    const doc = await docRef.get();
    await docRef.set(
      {
        id,
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
        ...(doc.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    const updated = await docRef.get();

    return NextResponse.json({ success: true, data: updated.data() });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] PUT/:id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update device' },
      { status: 500 },
    );
  }
}

// DELETE /api/devices/:id
export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('devices').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 },
      );
    }

    await docRef.delete();

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] DELETE/:id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete device' },
      { status: 500 },
    );
  }
}
