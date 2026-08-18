import { NextResponse } from 'next/server';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

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
      role !== 'viewer'
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      adminDb.collection('users').where('role', '==', 'maintenance').get(),
      adminDb
        .collection('tasks')
        .where('status', 'in', ['assigned', 'acknowledged', 'pending', 'reassignment_needed'])
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const activeTaskByPerson = new Map<string, string>();
    for (const doc of activeTasksSnapshot.docs) {
      const data = doc.data();
      const assignedTo =
        typeof data.assignedTo === 'string' ? data.assignedTo : null;
      if (assignedTo && !activeTaskByPerson.has(assignedTo)) {
        activeTaskByPerson.set(assignedTo, doc.id);
      }
      if (Array.isArray(data.assignedToIds)) {
        for (const pid of data.assignedToIds) {
          if (typeof pid === 'string' && !activeTaskByPerson.has(pid)) {
            activeTaskByPerson.set(pid, doc.id);
          }
        }
      }
    }

    const personnel = usersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const email = stringOrNull(data.email);
        const displayName =
          stringOrNull(data.displayName) ??
          stringOrNull(data.name) ??
          email ??
          doc.id;
        const currentTaskId = activeTaskByPerson.get(doc.id) ?? null;
        const isExplicitAvailable = data.isAvailable !== false;
        const isAvailable = currentTaskId === null && isExplicitAvailable;

        return {
          id: doc.id,
          displayName,
          email,
          isAvailable,
          currentTaskId,
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
