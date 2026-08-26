import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  getUserRole,
  verifyAuthToken,
} from '@/lib/auth-helpers';
import {
  createTaskAndNotify,
  serializeTaskSnapshot,
} from '@/lib/task-service';
import {
  isAssignedToUser,
  normalizeTaskAssignment,
} from '@/lib/task-assignment';
import {
  withDashboardTaskStatus,
  withMaintenanceUserStatus,
} from '@/lib/task-status';
import {
  isTaskStatus,
  isTaskTriggerType,
  type TaskApiData,
} from '@/lib/task-types';

interface CreateTaskBody {
  deviceId?: unknown;
  triggerType?: unknown;
  message?: unknown;
  assignedTo?: unknown;
  assignedToIds?: unknown;
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function taskCreatedAtMillis(task: { createdAt: number | null }): number {
  return task.createdAt ?? 0;
}

async function listMaintenanceUserIds(): Promise<string[]> {
  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'maintenance')
    .get();

  return snapshot.docs.map((doc) => doc.id);
}

// GET /api/tasks
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (role !== 'admin' && role !== 'supervisor' && role !== 'maintenance') {
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
          error: 'status is not a supported task status',
        },
        { status: 400 },
      );
    }

    if (role === 'maintenance') {
      const taskMap = new Map<string, TaskApiData>();
      const allTasksSnapshot = await adminDb
        .collection('tasks')
        .orderBy('createdAt', 'desc')
        .get();

      for (const doc of allTasksSnapshot.docs) {
        const rawTask = serializeTaskSnapshot(doc);
        const isUserTask =
          isAssignedToUser(rawTask, user.uid) ||
          (user.email && rawTask.assignedTo === user.email) ||
          rawTask.createdBy === user.uid ||
          Boolean(rawTask.completedBy && rawTask.completedBy[user.uid]) ||
          Boolean(
            rawTask.submissions &&
              (rawTask.submissions as Record<string, unknown>)[user.uid],
          ) ||
          rawTask.isBroadcast === true;

        if (!isUserTask) {
          continue;
        }

        const task = withMaintenanceUserStatus(rawTask, user.uid);
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

    const [snapshot, maintenanceUserIds] = await Promise.all([
      adminDb.collection('tasks').orderBy('createdAt', 'desc').get(),
      listMaintenanceUserIds(),
    ]);
    const tasks = snapshot.docs
      .map(serializeTaskSnapshot)
      .map((task) => withDashboardTaskStatus(task, maintenanceUserIds))
      .filter((task) => !statusParam || task.status === statusParam);

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
    const role = await getUserRole(user);

    if (role !== 'admin' && role !== 'supervisor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: admin or supervisor only' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateTaskBody;
    const deviceId = trimmedString(body.deviceId);
    const message = trimmedString(body.message);
    const assignment = normalizeTaskAssignment(
      body.assignedTo,
      body.assignedToIds,
    );

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
            'triggerType is not a supported task trigger',
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
      assignedTo: assignment.assignedTo,
      assignedToIds: assignment.assignedToIds,
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
