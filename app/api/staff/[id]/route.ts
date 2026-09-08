import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { dispatchPasswordResetEmail } from '@/lib/password-reset-email';

const ALLOWED_STAFF_ROLES = ['admin', 'supervisor', 'technician', 'maintenance'] as const;

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const { id } = await Promise.resolve(context.params);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Staff ID is required' },
        { status: 400 },
      );
    }

    const userDocRef = adminDb.collection('users').doc(id);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Staff member not found' },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Security guard: Prevent administrator from deactivating or demoting themselves
    if (user.uid === id) {
      if (body.active === false) {
        return NextResponse.json(
          { success: false, error: 'Cannot deactivate your own administrator account' },
          { status: 400 },
        );
      }
      if (body.role !== undefined && body.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Cannot remove your own administrator role' },
          { status: 400 },
        );
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.role !== undefined) {
      const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
      if (!(ALLOWED_STAFF_ROLES as readonly string[]).includes(role)) {
        return NextResponse.json(
          {
            success: false,
            error: `role must be one of: ${ALLOWED_STAFF_ROLES.join(', ')}`,
          },
          { status: 400 },
        );
      }
      updates.role = role;
    }

    if (body.building !== undefined) {
      updates.building =
        typeof body.building === 'string' && body.building.trim()
          ? body.building.trim()
          : null;
    }

    if (body.shift !== undefined) {
      updates.shift =
        typeof body.shift === 'string' && body.shift.trim()
          ? body.shift.trim()
          : '1st';
    }

    if (body.displayName !== undefined) {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (displayName) {
        updates.displayName = displayName;
        updates.name = displayName;
        try {
          await adminAuth.updateUser(id, { displayName });
        } catch (authError) {
          console.warn('[Staff API] Could not update displayName in Firebase Auth:', authError);
        }
      }
    }

    if (typeof body.active === 'boolean') {
      updates.active = body.active;
      updates.isActive = body.active;
      if (!body.active) {
        // Deactivate: mark unavailable and offline so tasks are not routed
        updates.isAvailable = false;
        updates.status = 'offline';
        updates.isOnline = false;
        try {
          await adminAuth.updateUser(id, { disabled: true });
          if (typeof adminAuth.revokeRefreshTokens === 'function') {
            await adminAuth.revokeRefreshTokens(id);
          }
        } catch (authErr) {
          console.warn('[Staff API] Could not disable Firebase Auth user:', authErr);
        }
      } else {
        // Reactivate: restore availability and online status so technician/staff can receive tasks
        updates.isAvailable = true;
        updates.isOnline = true;
        updates.status = 'online';
        try {
          await adminAuth.updateUser(id, { disabled: false });
        } catch (authErr) {
          console.warn('[Staff API] Could not re-enable Firebase Auth user:', authErr);
        }
      }
    }

    await userDocRef.set(updates, { merge: true });

    return NextResponse.json({
      success: true,
      message: 'Staff profile updated successfully',
      data: { id, ...updates },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    const message = error instanceof Error ? error.message : 'Failed to update staff member';
    console.error('[Staff API] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const { id } = await Promise.resolve(context.params);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Staff ID is required' },
        { status: 400 },
      );
    }

    const userDocRef = adminDb.collection('users').doc(id);
    const userDoc = await userDocRef.get();
    let email: string | null = null;

    if (userDoc.exists) {
      const data = userDoc.data();
      if (typeof data?.email === 'string' && data.email.trim()) {
        email = data.email.trim().toLowerCase();
      }
    }

    if (!email) {
      try {
        const authUser = await adminAuth.getUser(id);
        email = authUser.email ?? null;
      } catch {
        // Ignored
      }
    }

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Staff member email not found' },
        { status: 404 },
      );
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email);
    const emailResult = await dispatchPasswordResetEmail(email);

    return NextResponse.json({
      success: true,
      resetLink,
      emailDispatched: emailResult.success,
      message: emailResult.success
        ? `Password reset email dispatched to ${email}`
        : `Password setup link generated for ${email}`,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    const message = error instanceof Error ? error.message : 'Failed to generate password reset link';
    console.error('[Staff API] Reset POST error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
