// app/api/staff/presence/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface PresenceBody {
  status?: 'available' | 'offline' | 'on_task';
  isOnline?: boolean;
}

const ALLOWED_STATUSES = ['available', 'offline', 'on_task'] as const;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);

    let body: PresenceBody;
    try {
      body = (await request.json()) as PresenceBody;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 },
      );
    }

    const { status, isOnline } = body;

    if (status === undefined && isOnline === undefined) {
      return NextResponse.json(
        { success: false, error: 'At least one of status or isOnline must be provided' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      lastSeen: FieldValue.serverTimestamp(),
    };

    if (status !== undefined) {
      if (typeof status !== 'string' || !(ALLOWED_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.status = status;
      if (status === 'offline' && isOnline === undefined) {
        updateData.isOnline = false;
      } else if (status === 'available' && isOnline === undefined) {
        updateData.isOnline = true;
      }
    }

    if (isOnline !== undefined) {
      if (typeof isOnline !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'isOnline must be a boolean' },
          { status: 400 },
        );
      }
      updateData.isOnline = isOnline;
      if (!isOnline && status === undefined) {
        updateData.status = 'offline';
      }
    }

    await adminDb.collection('users').doc(user.uid).set(updateData, { merge: true });

    return NextResponse.json({
      success: true,
      data: {
        uid: user.uid,
        status: updateData.status,
        isOnline: updateData.isOnline,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[StaffPresence] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update presence' },
      { status: 500 },
    );
  }
}
