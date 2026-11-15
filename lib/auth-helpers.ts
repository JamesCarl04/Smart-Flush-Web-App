// lib/auth-helpers.ts
// Shared auth token verification and role guards for all protected API routes
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import {
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
} from '@/lib/local-runtime-cache';

const USER_PROFILE_CACHE_TTL_MS = 5 * 60_000;
const MAX_USER_PROFILE_CACHE_ENTRIES = 500;

interface CachedUserProfileEntry {
  profile: UserProfile;
  expiresAtMs: number;
}

const userProfileCache = new Map<string, CachedUserProfileEntry>();

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

function getCachedUserProfile(uid: string): CachedUserProfileEntry | null {
  if (isTestEnvironment()) {
    return null;
  }

  return userProfileCache.get(uid) ?? null;
}

function setCachedUserProfile(uid: string, profile: UserProfile): void {
  if (isTestEnvironment()) {
    return;
  }

  if (userProfileCache.has(uid)) {
    userProfileCache.delete(uid);
  }
  userProfileCache.set(uid, {
    profile,
    expiresAtMs: Date.now() + USER_PROFILE_CACHE_TTL_MS,
  });

  if (userProfileCache.size > MAX_USER_PROFILE_CACHE_ENTRIES) {
    const oldestKey = userProfileCache.keys().next().value;
    if (typeof oldestKey === 'string') {
      userProfileCache.delete(oldestKey);
    }
  }
}

export function invalidateUserProfileCache(uid?: string): void {
  if (isTestEnvironment()) {
    return;
  }

  if (!uid) {
    userProfileCache.clear();
    return;
  }

  userProfileCache.delete(uid);
}

function syncCustomRoleClaimIfNeeded(
  uid: string,
  role: UserRole,
  existingTokenRole: UserRole | null,
): void {
  if (
    isTestEnvironment() ||
    existingTokenRole === role ||
    typeof adminAuth.setCustomUserClaims !== 'function'
  ) {
    return;
  }

  void adminAuth.setCustomUserClaims(uid, { role }).catch(() => {});
}

async function resolveQuotaFallbackProfile(
  user: DecodedIdToken,
  staleCachedProfile: UserProfile | null,
): Promise<UserProfile> {
  if (!isTestEnvironment() && staleCachedProfile && staleCachedProfile.role !== null) {
    return staleCachedProfile;
  }

  const tokenRole = normalizeUserRole(
    (user as DecodedIdToken & { role?: unknown }).role,
  );
  if (tokenRole !== null) {
    const claimProfile: UserProfile = {
      id: user.uid,
      email: stringOrNull(user.email),
      displayName: stringOrNull(user.name),
      role: tokenRole,
    };
    setCachedUserProfile(user.uid, claimProfile);
    return claimProfile;
  }

  if (typeof adminAuth.getUser === 'function') {
    try {
      const authUser = await adminAuth.getUser(user.uid);
      if (!authUser.disabled) {
        const customRole = normalizeUserRole(authUser.customClaims?.role);
        if (customRole !== null) {
          const recoveredProfile: UserProfile = {
            id: authUser.uid,
            email: stringOrNull(authUser.email) ?? stringOrNull(user.email),
            displayName:
              stringOrNull(authUser.displayName) ?? stringOrNull(user.name),
            role: customRole,
          };
          setCachedUserProfile(user.uid, recoveredProfile);
          return recoveredProfile;
        }
      }
    } catch {
      // Fail closed if Firebase Auth lookup fails during quota fallback.
    }
  }

  return {
    id: user.uid,
    email: user.email ?? null,
    displayName: user.name ?? null,
    role: null,
  };
}

const USER_ROLES = [
  'admin',
  'supervisor',
  'maintenance',
  'technician',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole | null;
}

function normalizeUserRole(value: unknown): UserRole | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if ((USER_ROLES as readonly string[]).includes(normalized)) {
      return normalized as UserRole;
    }
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
  const cached = getCachedUserProfile(user.uid);
  if (cached && Date.now() < cached.expiresAtMs) {
    return cached.profile;
  }

  const tokenRole = normalizeUserRole(
    (user as DecodedIdToken & { role?: unknown }).role,
  );
  if (tokenRole !== null) {
    const claimProfile: UserProfile = {
      id: user.uid,
      email: stringOrNull(user.email),
      displayName: stringOrNull(user.name),
      role: tokenRole,
    };
    setCachedUserProfile(user.uid, claimProfile);
    return claimProfile;
  }

  if (isFirestoreQuotaCircuitOpen()) {
    return resolveQuotaFallbackProfile(user, cached?.profile ?? null);
  }

  try {
    const doc = await adminDb.collection('users').doc(user.uid).get();
    const uidData = doc.data();
    const uidIsActive =
      uidData?.active !== false && uidData?.isActive !== false;
    const uidRole = uidIsActive ? normalizeUserRole(uidData?.role) : null;

    if (doc.exists && !uidIsActive) {
      const inactiveProfile: UserProfile = {
        id: doc.id,
        email: stringOrNull(uidData?.email) ?? user.email ?? null,
        displayName: stringOrNull(uidData?.displayName) ?? user.name ?? null,
        role: null,
      };
      setCachedUserProfile(user.uid, inactiveProfile);
      return inactiveProfile;
    }

    if (doc.exists && uidRole !== null) {
      const profile: UserProfile = {
        id: doc.id,
        email: stringOrNull(uidData?.email) ?? user.email ?? null,
        displayName: stringOrNull(uidData?.displayName) ?? user.name ?? null,
        role: uidRole,
      };
      setCachedUserProfile(user.uid, profile);
      syncCustomRoleClaimIfNeeded(user.uid, uidRole, tokenRole);
      return profile;
    }

    if (user.email) {
      const emailBaseQuery = adminDb
        .collection('users')
        .where('email', '==', user.email);
      const emailSnapshot =
        typeof emailBaseQuery.limit === 'function'
          ? await emailBaseQuery.limit(1).get()
          : await emailBaseQuery.get();

      const emailDoc = emailSnapshot.docs[0];
      const emailData = emailDoc?.data();
      const emailIsActive =
        emailData?.active !== false && emailData?.isActive !== false;
      const emailRole = emailIsActive ? normalizeUserRole(emailData?.role) : null;

      if (emailDoc && emailRole !== null) {
        const profile: UserProfile = {
          id: emailDoc.id,
          email: stringOrNull(emailData?.email) ?? user.email,
          displayName:
            stringOrNull(emailData?.displayName) ?? user.name ?? null,
          role: emailRole,
        };
        setCachedUserProfile(user.uid, profile);
        syncCustomRoleClaimIfNeeded(user.uid, emailRole, tokenRole);
        return profile;
      }
    }

    return {
      id: user.uid,
      email: user.email ?? null,
      displayName: user.name ?? null,
      role: null,
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      return resolveQuotaFallbackProfile(user, cached?.profile ?? null);
    }

    throw error;
  }
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
 * role 'maintenance', 'technician', 'supervisor', or 'admin' in the Firestore users collection.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireMaintenance(
  user: DecodedIdToken,
): Promise<void> {
  const role = await getUserRole(user);

  if (
    role !== 'maintenance' &&
    role !== 'technician' &&
    role !== 'supervisor' &&
    role !== 'admin'
  ) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'Forbidden: maintenance or supervisor only',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Throws a Response with HTTP 403 if the authenticated user does not have
 * role 'supervisor' or 'admin' in the Firestore users collection.
 * Must be called AFTER verifyAuthToken().
 */
export async function requireSupervisorOrAdmin(
  user: DecodedIdToken,
): Promise<void> {
  const role = await getUserRole(user);

  if (role !== 'supervisor' && role !== 'admin') {
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'Forbidden: supervisor or admin only',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
