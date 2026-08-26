import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';
import {
  normalizeAssignedToIds,
} from '@/lib/task-assignment';
import { syncTechniciansAfterTaskRelease } from '@/lib/task-lifecycle';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TaskActionDoc {
  assignedTo?: unknown;
  assignedToIds?: unknown;
  acknowledgedBy?: Record<string, unknown>;
  completedBy?: Record<string, unknown>;
  isBroadcast?: unknown;
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
    const outcome = await adminDb.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      if (!taskSnapshot.exists) return 'not_found' as const;

      const task = taskSnapshot.data() as TaskActionDoc;
      const now = Timestamp.now();
      const assignment = {
        assignedTo:
          typeof task.assignedTo === 'string' && task.assignedTo.trim()
            ? task.assignedTo.trim()
            : null,
        assignedToIds: normalizeAssignedToIds(task.assignedToIds),
      };
      const requiredUserIds = assignment.assignedToIds.length > 0
        ? assignment.assignedToIds
        : assignment.assignedTo ? [assignment.assignedTo] : [];
      if (requiredUserIds.length === 0 || !requiredUserIds.includes(user.uid)) return 'forbidden' as const;

      const acknowledgedBy = { ...(task.acknowledgedBy ?? {}), [user.uid]: now };
      const completedBy = { ...(task.completedBy ?? {}), [user.uid]: now };
      const allAcknowledged = requiredUserIds.every((uid) => acknowledgedBy[uid]);
      const allCompleted = requiredUserIds.every((uid) => completedBy[uid]);
      if (allCompleted) {
        await syncTechniciansAfterTaskRelease(transaction, requiredUserIds, id, now);
      }
      transaction.update(taskRef, {
        [`acknowledgedBy.${user.uid}`]: acknowledgedBy[user.uid],
        [`completedBy.${user.uid}`]: now,
        ...(allCompleted
          ? { status: 'completed', completedAt: now, acknowledgedAt: acknowledgedBy[user.uid] }
          : allAcknowledged
            ? { status: 'acknowledged', acknowledgedAt: acknowledgedBy[user.uid], completedAt: null }
            : { status: 'pending', acknowledgedAt: null, completedAt: null }),
      });
      return 'updated' as const;
    });
    if (outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }
    if (outcome === 'forbidden') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

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
