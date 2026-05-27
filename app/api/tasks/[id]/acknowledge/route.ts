import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';
import {
  listRequiredTaskUserIds,
  normalizeAssignedToIds,
} from '@/lib/task-assignment';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TaskActionDoc {
  assignedTo?: unknown;
  assignedToIds?: unknown;
  acknowledgedBy?: Record<string, unknown>;
  completedBy?: Record<string, unknown>;
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
    const assignment = {
      assignedTo:
        typeof task.assignedTo === 'string' && task.assignedTo.trim()
          ? task.assignedTo.trim()
          : null,
      assignedToIds: normalizeAssignedToIds(task.assignedToIds),
    };
    const requiredUserIds = await listRequiredTaskUserIds(assignment);
    if (!requiredUserIds.includes(user.uid)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const acknowledgedBy = {
      ...(task.acknowledgedBy ?? {}),
      [user.uid]: now,
    };
    const allAcknowledged =
      requiredUserIds.length > 0 &&
      requiredUserIds.every((uid) => acknowledgedBy[uid]);
    const completedBy = allAcknowledged
      ? requiredUserIds.reduce<Record<string, unknown>>(
          (result, uid) => {
            result[uid] = acknowledgedBy[uid];
            return result;
          },
          { ...(task.completedBy ?? {}) },
        )
      : task.completedBy;

    await taskRef.update({
      [`acknowledgedBy.${user.uid}`]: now,
      ...(allAcknowledged
        ? {
            status: 'completed',
            acknowledgedAt: now,
            completedAt: now,
            completedBy,
          }
        : {
            status: 'acknowledged',
            acknowledgedAt: now,
            completedAt: null,
          }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] acknowledge error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge task' },
      { status: 500 },
    );
  }
}
