// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthToken } from '@/lib/auth-helpers';

export async function POST(request?: Request): Promise<NextResponse> {
  const authHeader = request?.headers?.get('Authorization');
  if (request && authHeader?.startsWith('Bearer ')) {
    try {
      const user = await verifyAuthToken(request);
      if (user?.uid) {
        await adminDb.collection('users').doc(user.uid).set(
          {
            isOnline: false,
            status: 'offline',
            lastSeen: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    } catch (authError) {
      console.warn('[AuthLogout] Token verification failed on logout:', authError);
    }
  }

  // Firebase Auth is session-less on the server side when using ID tokens.
  // Client-side signOut() handles token invalidation.
  // This endpoint clears any session cookies if they are set.
  const response = NextResponse.json({ success: true });

  // Clear session cookie if used
  response.cookies.delete('session');

  return response;
}
