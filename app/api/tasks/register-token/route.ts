import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface RegisterTokenBody {
  fcmToken?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const body = (await request.json()) as RegisterTokenBody;
    const fcmToken =
      typeof body.fcmToken === 'string' ? body.fcmToken.trim() : '';

    if (!fcmToken) {
      return NextResponse.json(
        { success: false, error: 'fcmToken is required' },
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
