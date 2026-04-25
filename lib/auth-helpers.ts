// lib/auth-helpers.ts
// Shared auth token verification for all protected API routes
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '@/lib/firebase-admin';

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
