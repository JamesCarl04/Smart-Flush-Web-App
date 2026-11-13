import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, requireMaintenance } from '@/lib/auth-helpers';

interface RegisterTokenBody {
  fcmToken?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireMaintenance(user);
    const body = (await request.json()) as RegisterTokenBody;
    const fcmToken =
      typeof body.fcmToken === 'string' ? body.fcmToken.trim() : '';

    if (!fcmToken || fcmToken.length > 4096) {
      return NextResponse.json(
        { success: false, error: 'fcmToken is required and must not exceed 4096 characters' },
        { status: 400 },
      );
    }

    await adminDb.collection('users').doc(user.uid).set(
      {
        fcmToken,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] register-token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register FCM token' },
      { status: 500 },
    );
  }
}
