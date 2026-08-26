import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';
import {
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
      const assignedTo =
        typeof task.assignedTo === 'string' && task.assignedTo.trim()
          ? task.assignedTo.trim()
          : null;
      const assignedToIds = normalizeAssignedToIds(task.assignedToIds);
      const isUnassigned = assignedTo === null && assignedToIds.length === 0;
      if (isUnassigned && task.isBroadcast !== true) return 'forbidden' as const;

      const requiredUserIds = isUnassigned
        ? [user.uid]
        : assignedToIds.length > 0
          ? assignedToIds
          : assignedTo
            ? [assignedTo]
            : [];
      if (!requiredUserIds.includes(user.uid)) return 'forbidden' as const;

      transaction.update(taskRef, {
        [`acknowledgedBy.${user.uid}`]: now,
        status: 'acknowledged',
        acknowledgedAt: now,
        ...(isUnassigned
          ? {
              assignedTo: user.uid,
              assignedToIds: [user.uid],
              isBroadcast: false,
              assignmentType: 'individual',
              assignedAt: now,
            }
          : {}),
      });
      return 'acknowledged' as const;
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

    console.error('[Tasks] acknowledge error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge task' },
      { status: 500 },
    );
  }
}
