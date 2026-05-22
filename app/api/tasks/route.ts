import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  getUserRole,
  requireAdmin,
  verifyAuthToken,
} from '@/lib/auth-helpers';
import {
  createTaskAndNotify,
  serializeTaskData,
  serializeTaskSnapshot,
} from '@/lib/task-service';
import { isTaskStatus, isTaskTriggerType } from '@/lib/task-types';

interface CreateTaskBody {
  deviceId?: unknown;
  triggerType?: unknown;
  message?: unknown;
  assignedTo?: unknown;
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function taskCreatedAtMillis(task: { createdAt: number | null }): number {
  return task.createdAt ?? 0;
}

function withMaintenanceUserStatus(
  task: ReturnType<typeof serializeTaskData>,
  userId: string,
): ReturnType<typeof serializeTaskData> {
  if (task.assignedTo !== null) {
    return task;
  }

  const completedAt = task.completedBy[userId] ?? null;
  if (completedAt !== null) {
    return {
      ...task,
      status: 'completed',
      acknowledgedAt: task.acknowledgedBy[userId] ?? task.acknowledgedAt,
      completedAt,
    };
  }

  const acknowledgedAt = task.acknowledgedBy[userId] ?? null;
  if (acknowledgedAt !== null) {
    return {
      ...task,
      status: 'acknowledged',
      acknowledgedAt,
      completedAt: null,
    };
  }

  return {
    ...task,
    status: 'pending',
    acknowledgedAt: null,
    completedAt: null,
  };
}

// GET /api/tasks
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (role !== 'admin' && role !== 'maintenance') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    if (statusParam !== null && !isTaskStatus(statusParam)) {
      return NextResponse.json(
        {
          success: false,
          error: 'status must be pending, acknowledged, or completed',
        },
        { status: 400 },
      );
    }

    if (role === 'maintenance') {
      const taskMap = new Map<string, ReturnType<typeof serializeTaskData>>();
      const assignedSnapshot = await adminDb
        .collection('tasks')
        .where('assignedTo', '==', user.uid)
        .get();

      for (const doc of assignedSnapshot.docs) {
        const task = serializeTaskSnapshot(doc);
        if (!statusParam || task.status === statusParam) {
          taskMap.set(task.id, task);
        }
      }

      const teamSnapshot = await adminDb
        .collection('tasks')
        .where('assignedTo', '==', null)
        .get();

      for (const doc of teamSnapshot.docs) {
        const task = withMaintenanceUserStatus(
          serializeTaskSnapshot(doc),
          user.uid,
        );
        if (!statusParam || task.status === statusParam) {
          taskMap.set(task.id, task);
        }
      }

      const tasks = Array.from(taskMap.values()).sort(
        (left, right) =>
          taskCreatedAtMillis(right) - taskCreatedAtMillis(left),
      );

      return NextResponse.json({ success: true, data: tasks });
    }

    let tasksQuery: FirebaseFirestore.Query = adminDb.collection('tasks');
    if (statusParam) {
      tasksQuery = tasksQuery.where('status', '==', statusParam);
    }
    const snapshot = await tasksQuery.orderBy('createdAt', 'desc').get();
    const tasks = snapshot.docs.map(serializeTaskSnapshot);

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 },
    );
  }
}

// POST /api/tasks
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const body = (await request.json()) as CreateTaskBody;
    const deviceId = trimmedString(body.deviceId);
    const message = trimmedString(body.message);
    const assignedTo =
      body.assignedTo === undefined || body.assignedTo === null
        ? null
        : trimmedString(body.assignedTo);

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'deviceId is required' },
        { status: 400 },
      );
    }
    if (!isTaskTriggerType(body.triggerType)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'triggerType must be manual, uv_complete, flush_count, or maintenance',
        },
        { status: 400 },
      );
    }
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'message is required' },
        { status: 400 },
      );
    }

    const task = await createTaskAndNotify({
      deviceId,
      triggerType: body.triggerType,
      message,
      assignedTo,
      createdBy: user.uid,
    });

    return NextResponse.json(
      {
        success: true,
        data: { taskId: task.id },
        taskId: task.id,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 },
    );
  }
}
