import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  getUserRole,
  requireAdminOrSupervisor,
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
  photos?: unknown;
  component?: unknown;
  location?: unknown;
  floor?: unknown;
  building?: unknown;
  shift?: unknown;
  remarks?: unknown;
  flagged?: unknown;
  biometricVerified?: unknown;
  offlineSynced?: unknown;
  checklist?: unknown;
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
          error: 'status must be pending, acknowledged, or completed',
        },
        { status: 400 },
      );
    }

    if (role === 'maintenance') {
      const taskMap = new Map<string, TaskApiData>();
      const [assignedSnapshot, teamSnapshot] = await Promise.all([
        adminDb.collection('tasks').where('assignedTo', '==', user.uid).get(),
        adminDb.collection('tasks').where('assignedTo', '==', null).get(),
      ]);

      for (const doc of assignedSnapshot.docs) {
        const task = serializeTaskSnapshot(doc);
        if (!statusParam || task.status === statusParam) {
          taskMap.set(task.id, task);
        }
      }

      for (const doc of teamSnapshot.docs) {
        const rawTask = serializeTaskSnapshot(doc);
        if (!isAssignedToUser(rawTask, user.uid)) {
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
    await requireAdminOrSupervisor(user);

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
      assignedTo: assignment.assignedTo,
      assignedToIds: assignment.assignedToIds,
      createdBy: user.uid,
      photos: Array.isArray(body.photos) ? body.photos.map(String) : undefined,
      component: trimmedString(body.component) ?? undefined,
      location: trimmedString(body.location) ?? undefined,
      floor: trimmedString(body.floor) ?? undefined,
      building: trimmedString(body.building) ?? undefined,
      shift: trimmedString(body.shift) ?? undefined,
      remarks: trimmedString(body.remarks) ?? undefined,
      flagged: typeof body.flagged === 'boolean' ? body.flagged : undefined,
      biometricVerified: typeof body.biometricVerified === 'boolean' ? body.biometricVerified : undefined,
      offlineSynced: typeof body.offlineSynced === 'boolean' ? body.offlineSynced : undefined,
      checklist: (Array.isArray(body.checklist) || (body.checklist && typeof body.checklist === 'object')) ? (body.checklist as any) : undefined,
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
