import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { resolveStaffOperationalStatus } from '@/lib/staff-workload';
import { dispatchPasswordResetEmail } from '@/lib/password-reset-email';

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const ALLOWED_STAFF_ROLES = ['admin', 'supervisor', 'technician', 'maintenance'] as const;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb
        .collection('tasks')
        .where('status', 'in', [
          'unassigned',
          'assigned',
          'acknowledged',
          'pending',
          'rechecking',
          'flagged',
          'reassignment_needed',
        ])
        .get()
        .catch(() => ({ docs: [] })),
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
          role: role as (typeof ALLOWED_STAFF_ROLES)[number],
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

    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
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

    // Password: use provided password or generate secure random string
    const password =
      typeof body.password === 'string' && body.password.length >= 12
        ? body.password
        : crypto.randomBytes(16).toString('base64') + '!A9';

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

    // 3. Optionally generate and dispatch password setup link
    let resetLink: string | null = null;
    let emailDispatched = false;
    if (sendPasswordReset) {
      try {
        resetLink = await adminAuth.generatePasswordResetLink(email);
      } catch (linkError) {
        console.warn('[Staff API] Failed to generate password reset link:', linkError);
      }
      const emailResult = await dispatchPasswordResetEmail(email);
      emailDispatched = emailResult.success;
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

    const message = error instanceof Error ? error.message : 'Failed to provision staff member';
    console.error('[Staff API] POST error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
