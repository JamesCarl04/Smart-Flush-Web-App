// lib/auth-helpers.ts
// Shared auth token verification and role guards for all protected API routes
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

const USER_ROLES = [
  'admin',
  'supervisor',
  'maintenance',
  'viewer',
  'user',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole | null;
}

function normalizeUserRole(value: unknown): UserRole | null {
  if (
    typeof value === 'string' &&
    (USER_ROLES as readonly string[]).includes(value)
  ) {
    return value as UserRole;
  }

  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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

  if (typeof adminAuth.verifyIdToken !== 'function') {
    console.error(
      '[Auth] Firebase Admin Auth is not initialized. Check FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.',
    );
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'Firebase Admin is not configured on the server',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch (error) {
    console.warn('[Auth] Firebase ID token verification failed:', error);
    throw new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function getUserRole(
  user: DecodedIdToken,
): Promise<UserRole | null> {
  const profile = await getUserProfile(user);

  return profile.role;
}

export async function getUserProfile(
  user: DecodedIdToken,
): Promise<UserProfile> {
  const doc = await adminDb.collection('users').doc(user.uid).get();
  const uidData = doc.data();
  const uidRole = normalizeUserRole(uidData?.role);

  if (doc.exists && uidRole !== null) {
    return {
      id: doc.id,
      email: stringOrNull(uidData?.email) ?? user.email ?? null,
      displayName: stringOrNull(uidData?.displayName) ?? user.name ?? null,
      role: uidRole,
    };
  }

  if (user.email) {
    const emailSnapshot = await adminDb
      .collection('users')
      .where('email', '==', user.email)
      .limit(1)
      .get();

    const emailDoc = emailSnapshot.docs[0];
    const emailData = emailDoc?.data();
    const emailRole = normalizeUserRole(emailData?.role);

    if (emailDoc && emailRole !== null) {
      return {
        id: emailDoc.id,
        email: stringOrNull(emailData?.email) ?? user.email,
        displayName:
          stringOrNull(emailData?.displayName) ?? user.name ?? null,
        role: emailRole,
      };
    }
  }

  return {
    id: user.uid,
    email: user.email ?? null,
    displayName: user.name ?? null,
    role: null,
  };
}

/**
 * Throws a Response with HTTP 403 if the authenticated user does not have
 * role 'admin' in the Firestore users collection.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireAdmin(user: DecodedIdToken): Promise<void> {
  const role = await getUserRole(user);

  if (role !== 'admin') {
    throw new Response(
      JSON.stringify({ success: false, error: 'Forbidden: admin only' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Throws a Response with HTTP 403 if the authenticated user does not have
 * role 'maintenance' in the Firestore users collection.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireMaintenance(
  user: DecodedIdToken,
): Promise<void> {
  const role = await getUserRole(user);

  if (role !== 'maintenance') {
    throw new Response(
      JSON.stringify({ success: false, error: 'Forbidden: maintenance only' }),
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
  const role = await getUserRole(user);

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
