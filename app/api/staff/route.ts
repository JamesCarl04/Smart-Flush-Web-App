import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  invalidateUserProfileCache,
  requireAdmin,
  verifyAuthToken,
} from '@/lib/auth-helpers';
import { validatePassword } from '@/lib/password-validator';
import { resolveStaffOperationalStatus } from '@/lib/staff-workload';
import { dispatchPasswordResetEmail } from '@/lib/password-reset-email';
import {
  getKnownMaintenanceAccountInfo,
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  invalidateRuntimeCache,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const STAFF_CACHE_KEY = 'staff:all';
const STAFF_CACHE_TTL_MS = 30_000;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const ALLOWED_STAFF_ROLES = ['admin', 'supervisor', 'technician', 'maintenance'] as const;

type StaffRole = (typeof ALLOWED_STAFF_ROLES)[number];

interface StaffListItem {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  role: StaffRole;
  building: string | null;
  shift: string;
  active: boolean;
  isAvailable: boolean;
  currentTaskId: string | null;
  activeTask: unknown;
  isOnline: boolean;
  status: string;
  createdAt: unknown;
}

async function buildStaffFallbackFromAuth(
  requesterUid: string,
): Promise<StaffListItem[]> {
  const stale = getStaleRuntimeCachedValue<StaffListItem[]>(STAFF_CACHE_KEY);
  if (stale) {
    return stale;
  }

  if (typeof adminAuth.listUsers !== 'function') {
    return [];
  }

  try {
    const listResult = await adminAuth.listUsers(100);
    return listResult.users
      .map((authUser): StaffListItem | null => {
        const email = stringOrNull(authUser.email)?.toLowerCase() ?? '';
        const knownMaintenance = getKnownMaintenanceAccountInfo(email);
        const rawClaimRole =
          typeof authUser.customClaims?.role === 'string'
            ? authUser.customClaims.role.toLowerCase()
            : null;
        let role: StaffRole | null =
          rawClaimRole &&
          (ALLOWED_STAFF_ROLES as readonly string[]).includes(rawClaimRole)
            ? (rawClaimRole as StaffRole)
            : null;

        if (!role && knownMaintenance) {
          role = knownMaintenance.role;
        }
        if (!role && authUser.uid === requesterUid) {
          role = 'admin';
        }
        if (!role) {
          return null;
        }

        const displayName =
          stringOrNull(authUser.displayName) ??
          knownMaintenance?.displayName ??
          (email || authUser.uid);

        return {
          id: authUser.uid,
          uid: authUser.uid,
          displayName,
          email,
          role,
          building: null,
          shift: '1st',
          active: !authUser.disabled,
          isAvailable: false,
          currentTaskId: null,
          activeTask: null,
          isOnline: false,
          status: 'offline',
          createdAt: authUser.metadata?.creationTime ?? null,
        };
      })
      .filter((member): member is StaffListItem => member !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (fallbackError) {
    console.warn('[Staff API] Auth fallback failed:', fallbackError);
    return [];
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const cached = getRuntimeCachedValue<StaffListItem[]>(STAFF_CACHE_KEY);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const fallbackStaff = await buildStaffFallbackFromAuth(user.uid);
      return NextResponse.json({
        success: true,
        data: fallbackStaff,
        degraded: true,
      });
    }

    const usersCol = adminDb.collection('users');
    const tasksQuery = adminDb
      .collection('tasks')
      .where('status', 'in', [
        'unassigned',
        'assigned',
        'acknowledged',
        'pending',
        'rechecking',
        'flagged',
        'reassignment_needed',
      ]);

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      typeof usersCol.limit === 'function' ? usersCol.limit(200).get() : usersCol.get(),
      (typeof tasksQuery.limit === 'function' ? tasksQuery.limit(100).get() : tasksQuery.get()).catch(
        (taskError) => {
          if (isQuotaExceededError(taskError)) {
            markFirestoreQuotaExhausted();
          }
          return { docs: [] };
        },
      ),
    ]);

    const activeTasks = activeTasksSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const staff = usersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const role = typeof data.role === 'string' ? data.role.toLowerCase() : null;
        return { doc, data, role };
      })
      .filter(({ role }) => role && (ALLOWED_STAFF_ROLES as readonly string[]).includes(role))
      .map(({ doc, data, role }) => {
        const email = stringOrNull(data.email) ?? '';
        const displayName =
          stringOrNull(data.displayName) ??
          stringOrNull(data.name) ??
          email ??
          doc.id;
        const isActive = data.active !== false && data.isActive !== false;
        const operationalStatus = resolveStaffOperationalStatus(
          { id: doc.id, uid: doc.id, email, ...data },
          activeTasks,
        );

        return {
          id: doc.id,
          uid: doc.id,
          displayName,
          email,
          role: role as StaffRole,
          building: stringOrNull(data.building),
          shift: stringOrNull(data.shift) ?? '1st',
          active: isActive,
          isAvailable: operationalStatus.isAvailable,
          currentTaskId: operationalStatus.currentTaskId,
          activeTask: operationalStatus.activeTask,
          isOnline: operationalStatus.isOnline,
          status: operationalStatus.status,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    setRuntimeCachedValue(STAFF_CACHE_KEY, staff, STAFF_CACHE_TTL_MS);

    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      console.warn('[Staff API] Firestore quota exceeded; serving Auth fallback');
      const authFallbackUser = await verifyAuthToken(request).catch(() => null);
      const fallbackStaff = await buildStaffFallbackFromAuth(
        authFallbackUser?.uid ?? '',
      );
      return NextResponse.json({
        success: true,
        data: fallbackStaff,
        degraded: true,
      });
    }

    console.error('[Staff API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch staff members' },
      { status: 500 },
    );
  }
}

interface CreateStaffBody {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  building?: unknown;
  shift?: unknown;
  password?: unknown;
  sendPasswordReset?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const body = (await request.json()) as CreateStaffBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const roleInput = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    const building = typeof body.building === 'string' && body.building.trim() ? body.building.trim() : null;
    const shift = typeof body.shift === 'string' && body.shift.trim() ? body.shift.trim() : '1st';
    const sendPasswordReset = body.sendPasswordReset !== false;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'email is required' },
        { status: 400 },
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address format' },
        { status: 400 },
      );
    }

    if (!displayName) {
      return NextResponse.json(
        { success: false, error: 'displayName is required' },
        { status: 400 },
      );
    }

    if (!roleInput || !(ALLOWED_STAFF_ROLES as readonly string[]).includes(roleInput)) {
      return NextResponse.json(
        {
          success: false,
          error: `role must be one of: ${ALLOWED_STAFF_ROLES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    if (
      typeof body.password === 'string' &&
      body.password.trim().length > 0 &&
      body.password.length < 12
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Custom password must be at least 12 characters',
        },
        { status: 400 },
      );
    }

    // Password: use provided password or generate secure random string
    const password =
      typeof body.password === 'string' && body.password.length >= 12
        ? body.password
        : crypto.randomBytes(16).toString('base64') + '!A9';

    if (typeof body.password === 'string' && body.password.trim().length > 0) {
      const passwordValidation = await validatePassword(body.password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error:
              passwordValidation.errors[0] ||
              'Custom password does not meet security requirements',
          },
          { status: 400 },
        );
      }
    }

    // 1. Create user in Firebase Authentication
    const userRecord = await adminAuth.createUser({
      email,
      displayName,
      password,
    });

    try {
      // 2. Provision Firestore profile document
      await adminDb.collection('users').doc(userRecord.uid).set({
        id: userRecord.uid,
        email,
        displayName,
        name: displayName,
        role: roleInput,
        building,
        shift,
        active: true,
        isActive: true,
        isAvailable: false,
        isOnline: false,
        status: 'offline',
        currentTaskId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      // Atomic compensation rollback: delete user from Firebase Auth if Firestore write fails
      await adminAuth.deleteUser(userRecord.uid).catch((delErr) => {
        console.warn('[Staff API] Could not delete orphaned Auth user after Firestore failure:', delErr);
      });
      throw firestoreError;
    }

    if (typeof adminAuth.setCustomUserClaims === 'function') {
      await adminAuth
        .setCustomUserClaims(userRecord.uid, { role: roleInput })
        .catch((claimErr) => {
          console.warn('[Staff API] Failed to set custom user claims:', claimErr);
        });
    }
    if (typeof invalidateRuntimeCache === 'function') {
      invalidateRuntimeCache('staff:');
      invalidateRuntimeCache('maintenance-personnel:');
    }
    if (typeof invalidateUserProfileCache === 'function') {
      invalidateUserProfileCache(userRecord.uid);
    }

    // 3. Optionally generate and dispatch password setup link
    let resetLink: string | null = null;
    let emailDispatched = false;
    if (sendPasswordReset) {
      const emailResult = await dispatchPasswordResetEmail(email);
      emailDispatched = emailResult.success;
      try {
        resetLink = await adminAuth.generatePasswordResetLink(email);
      } catch (linkError) {
        console.warn('[Staff API] Failed to generate password reset link:', linkError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        uid: userRecord.uid,
        resetLink,
        emailDispatched,
        message: 'Staff member provisioned successfully',
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    const errCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;

    if (errCode === 'auth/email-already-exists') {
      return NextResponse.json(
        { success: false, error: 'A staff member with this email address already exists' },
        { status: 409 },
      );
    }

    console.error('[Staff API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to provision staff member' },
      { status: 500 },
    );
  }
}
