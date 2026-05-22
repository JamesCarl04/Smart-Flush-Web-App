import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TaskActionDoc {
  assignedTo?: unknown;
  acknowledgedBy?: Record<string, unknown>;
  completedBy?: Record<string, unknown>;
}

async function listMaintenanceUserIds(): Promise<string[]> {
  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'maintenance')
    .get();

  return snapshot.docs.map((doc) => doc.id);
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireMaintenance(user);
    const { id } = await params;

    const taskRef = adminDb.collection('tasks').doc(id);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    const task = taskSnapshot.data() as TaskActionDoc;
    const now = Timestamp.now();

    if (task.assignedTo === null) {
      const maintenanceUserIds = await listMaintenanceUserIds();
      const acknowledgedBy = {
        ...(task.acknowledgedBy ?? {}),
        [user.uid]: now,
      };
      const completedBy = {
        ...(task.completedBy ?? {}),
        [user.uid]: now,
      };
      const allAcknowledged =
        maintenanceUserIds.length > 0 &&
        maintenanceUserIds.every((uid) => acknowledgedBy[uid]);
      const allCompleted =
        maintenanceUserIds.length > 0 &&
        maintenanceUserIds.every((uid) => completedBy[uid]);

      await taskRef.update({
        [`acknowledgedBy.${user.uid}`]: acknowledgedBy[user.uid],
        [`completedBy.${user.uid}`]: now,
        ...(allCompleted
          ? {
              status: 'completed',
              completedAt: now,
              acknowledgedAt: now,
            }
          : allAcknowledged
            ? {
                status: 'acknowledged',
                acknowledgedAt: now,
              }
            : {}),
      });

      return NextResponse.json({ success: true });
    }

    if (typeof task.assignedTo === 'string' && task.assignedTo !== user.uid) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    await taskRef.update({
      status: 'completed',
      completedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] complete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to complete task' },
      { status: 500 },
    );
  }
}
