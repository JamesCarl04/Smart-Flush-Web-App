import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { serializeTaskData } from '@/lib/task-service';
import {
  isAssignedToUser,
  normalizeTaskAssignment,
} from '@/lib/task-assignment';
import {
  withDashboardTaskStatus,
  withMaintenanceUserStatus,
} from '@/lib/task-status';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateTaskBody {
  deviceId?: unknown;
  message?: unknown;
  assignedTo?: unknown;
  assignedToIds?: unknown;
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canManageTask(
  role: Awaited<ReturnType<typeof getUserRole>>,
  userId: string,
  task: ReturnType<typeof serializeTaskData>,
): boolean {
  if (role === 'admin' || role === 'supervisor') {
    return true;
  }

  if (role === 'viewer' || role === null) {
    return false;
  }

  return task.createdBy === userId || isAssignedToUser(task, userId);
}

async function listMaintenanceUserIds(): Promise<string[]> {
  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'maintenance')
    .get();

  return snapshot.docs.map((doc) => doc.id);
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (role !== 'admin' && role !== 'supervisor' && role !== 'maintenance') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const snapshot = await adminDb.collection('tasks').doc(id).get();
    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    const task = serializeTaskData(
      snapshot.id,
      snapshot.data() as Record<string, unknown>,
    );

    if (
      role === 'maintenance' &&
      !isAssignedToUser(task, user.uid)
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data:
        role === 'maintenance'
          ? withMaintenanceUserStatus(task, user.uid)
          : withDashboardTaskStatus(task, await listMaintenanceUserIds()),
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] GET by id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);
    if (role === 'viewer' || role === null) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = (await request.json()) as UpdateTaskBody;

    const updates: Record<string, unknown> = {};

    if ('deviceId' in body) {
      const deviceId = trimmedString(body.deviceId);
      if (!deviceId) {
        return NextResponse.json(
          { success: false, error: 'deviceId must not be empty' },
          { status: 400 },
        );
      }
      updates.deviceId = deviceId;
    }

    if ('message' in body) {
      const message = trimmedString(body.message);
      if (!message) {
        return NextResponse.json(
          { success: false, error: 'message must not be empty' },
          { status: 400 },
        );
      }
      updates.message = message;
    }

    if ('assignedTo' in body || 'assignedToIds' in body) {
      const assignment = normalizeTaskAssignment(
        body.assignedTo,
        body.assignedToIds,
      );
      updates.assignedTo = assignment.assignedTo;
      updates.assignedToIds = assignment.assignedToIds;
      updates.status = 'pending';
      updates.acknowledgedAt = null;
      updates.completedAt = null;
      updates.acknowledgedBy = {};
      updates.completedBy = {};
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No task updates provided' },
        { status: 400 },
      );
    }

    const taskRef = adminDb.collection('tasks').doc(id);
    const snapshot = await taskRef.get();
    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    const existingTask = serializeTaskData(
      snapshot.id,
      snapshot.data() as Record<string, unknown>,
    );

    if (!canManageTask(role, user.uid, existingTask)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    if (existingTask.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Only pending tasks can be modified. Acknowledged or completed tasks are locked.',
        },
        { status: 400 },
      );
    }

    await taskRef.update(updates);

    const updatedSnapshot = await taskRef.get();
    const task = serializeTaskData(
      updatedSnapshot.id,
      updatedSnapshot.data() as Record<string, unknown>,
    );

    return NextResponse.json({
      success: true,
      data:
        role === 'maintenance'
          ? withMaintenanceUserStatus(task, user.uid)
          : withDashboardTaskStatus(task, await listMaintenanceUserIds()),
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] PATCH by id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);
    if (role === 'viewer' || role === null) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const { id } = await params;

    const taskRef = adminDb.collection('tasks').doc(id);
    const snapshot = await taskRef.get();
    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    const task = serializeTaskData(
      snapshot.id,
      snapshot.data() as Record<string, unknown>,
    );

    if (!canManageTask(role, user.uid, task)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const batch = adminDb.batch();
    batch.delete(taskRef);

    // Universal maintenance cleanup: Find all users holding this task as currentTaskId
    const usersHoldingTask = await adminDb
      .collection('users')
      .where('currentTaskId', '==', id)
      .get();

    usersHoldingTask.docs.forEach((userDoc) => {
      batch.update(userDoc.ref, {
        currentTaskId: null,
        isAvailable: true,
      });
    });

    await batch.commit();

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] DELETE by id error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 },
    );
  }
}
