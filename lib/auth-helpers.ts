// lib/auth-helpers.ts
// Shared auth token verification and role guards for all protected API routes
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Throws a Response with HTTP 401 if the token is missing or invalid.
 */
export async function verifyAuthToken(
  request: Request,
): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    throw new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Throws a Response with HTTP 403 if the authenticated user does not have
 * role 'admin' in the Firestore users collection.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireAdmin(user: DecodedIdToken): Promise<void> {
  const doc = await adminDb.collection('users').doc(user.uid).get();
  const role = doc.data()?.role as string | undefined;

  if (role !== 'admin') {
    throw new Response(
      JSON.stringify({ success: false, error: 'Forbidden: admin only' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Throws a Response with HTTP 403 if the authenticated user has
 * role 'viewer' in the Firestore users collection.
 * Viewers are read-only; they cannot trigger actuators or write data.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireNotViewer(user: DecodedIdToken): Promise<void> {
  const doc = await adminDb.collection('users').doc(user.uid).get();
  const role = doc.data()?.role as string | undefined;

  if (role === 'viewer') {
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'Forbidden: viewer role cannot perform this action',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
