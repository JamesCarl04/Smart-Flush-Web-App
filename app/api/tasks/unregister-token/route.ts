import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);

    await adminDb.collection('users').doc(user.uid).set(
      {
        fcmToken: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] unregister-token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unregister FCM token' },
      { status: 500 },
    );
  }
}
