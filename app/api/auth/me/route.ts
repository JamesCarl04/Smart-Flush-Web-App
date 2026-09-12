import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserProfile, verifyAuthToken } from '@/lib/auth-helpers';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const profile = await getUserProfile(user);

    const userRef = adminDb.collection('users').doc(user.uid);
    const userSnap = await userRef.get();

    const targetDocId = userSnap.exists ? user.uid : (profile.id || user.uid);
    const targetRef = targetDocId === user.uid ? userRef : adminDb.collection('users').doc(targetDocId);
    const targetSnap = targetDocId === user.uid ? userSnap : await targetRef.get();

    if (targetSnap.exists) {
      const userData = targetSnap.data() || {};
      const isActive = userData.active !== false && userData.isActive !== false;
      if (isActive) {
        const currentStatus = userData.status;
        const targetStatus = currentStatus === 'on_task' ? 'on_task' : 'available';
        await targetRef.set(
          {
            isOnline: true,
            status: targetStatus,
            lastSeen: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[AuthMe] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 },
    );
  }
}
