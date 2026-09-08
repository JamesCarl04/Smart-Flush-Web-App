import { NextResponse } from 'next/server';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';
import { resolveStaffOperationalStatus } from '@/lib/staff-workload';

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (
      role !== 'admin' &&
      role !== 'supervisor' &&
      role !== 'maintenance' &&
      role !== 'technician' &&
      role !== 'viewer'
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      adminDb.collection('users').where('role', 'in', ['maintenance', 'technician']).get(),
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

    const personnel = usersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const email = stringOrNull(data.email);
        const displayName =
          stringOrNull(data.displayName) ??
          stringOrNull(data.name) ??
          email ??
          doc.id;
        const operationalStatus = resolveStaffOperationalStatus(
          { id: doc.id, uid: doc.id, email, ...data },
          activeTasks,
        );

        return {
          id: doc.id,
          displayName,
          email,
          isAvailable: operationalStatus.isAvailable,
          isOnline: operationalStatus.isOnline,
          status: operationalStatus.status,
          isActive: data.active !== false && data.isActive !== false,
          currentTaskId: operationalStatus.currentTaskId,
          shift: stringOrNull(data.shift) ?? '1st',
          building: stringOrNull(data.building) ?? null,
          supervisorUid: stringOrNull(data.supervisorUid) ?? null,
        };
      })
      .sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );

    return NextResponse.json({ success: true, data: personnel });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[MaintenancePersonnel] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch maintenance personnel' },
      { status: 500 },
    );
  }
}
