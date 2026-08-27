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
import { shouldClearAutomationGuard, syncTechniciansAfterTaskRelease } from '@/lib/task-lifecycle';
import { Timestamp } from 'firebase-admin/firestore';

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

function canEditTask(
  task: ReturnType<typeof serializeTaskData>,
  role: Awaited<ReturnType<typeof getUserRole>>,
): boolean {
  if (task.status === 'pending') {
    return true;
  }

  return (
    task.status === 'unassigned' &&
    task.requiresSupervisorAssignment === true &&
    (role === 'admin' || role === 'supervisor')
  );
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
      !isAssignedToUser(task, user.uid) &&
      task.isBroadcast !== true
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
      const hasAssignees = assignment.assignedToIds.length > 0;
      updates.status = hasAssignees ? 'assigned' : 'pending';
      updates.isBroadcast = false;
      updates.assignmentSource = 'supervisor';
      updates.requiresSupervisorAssignment = false;
      updates.autoAssignmentEligibleAt = null;
      updates.acknowledgedAt = null;
      updates.acknowledgedBy = {};
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

    if (existingTask.completedAt !== null || existingTask.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Completed tasks are locked.' },
        { status: 409 },
      );
    }

    if (!canEditTask(existingTask, role)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Only pending tasks can be modified. Acknowledged or completed tasks are locked.',
        },
        { status: 400 },
      );
    }

    const updateOutcome = await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(taskRef);
        if (!fresh.exists) return 'not-found' as const;
        const data = fresh.data() ?? {};
        const freshTask = serializeTaskData(fresh.id, data as Record<string, unknown>);
        if (!canManageTask(role, user.uid, freshTask)) return 'forbidden' as const;
        if (freshTask.completedAt !== null || freshTask.status === 'completed') return 'terminal' as const;
        if (!canEditTask(freshTask, role)) return 'locked' as const;
        const now = Timestamp.now();

        if (!('assignedToIds' in updates)) {
          transaction.update(taskRef, { ...updates, updatedAt: now });
          return 'updated' as const;
        }

        const previous = new Set<string>([
          ...(typeof data.assignedTo === 'string' && data.assignedTo.trim() ? [data.assignedTo.trim()] : []),
          ...(Array.isArray(data.assignedToIds)
            ? data.assignedToIds.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
            : []),
        ]);
        const next = new Set((updates.assignedToIds as string[]) ?? []);
        await syncTechniciansAfterTaskRelease(
          transaction,
          Array.from(previous).filter((uid) => !next.has(uid)),
          id,
          now,
        );
        transaction.update(taskRef, { ...updates, updatedAt: now });
        for (const uid of next) {
          transaction.set(adminDb.collection('users').doc(uid), {
            currentTaskId: id,
            isAvailable: false,
            updatedAt: now,
          }, { merge: true });
        }
        return 'updated' as const;
      });

    if (updateOutcome !== 'updated') {
      const errors = {
        'not-found': { status: 404, error: 'Task not found' },
        forbidden: { status: 403, error: 'Forbidden' },
        terminal: { status: 409, error: 'Completed tasks are locked.' },
        locked: {
          status: 400,
          error: 'Only pending tasks can be modified. Acknowledged or completed tasks are locked.',
        },
      } as const;
      const result = errors[updateOutcome];
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

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

    await adminDb.runTransaction(async (transaction) => {
      const freshTask = await transaction.get(taskRef);
      if (!freshTask.exists) return;
      const data = freshTask.data() ?? {};
      const holders = await transaction.get(
        adminDb.collection('users').where('currentTaskId', '==', id),
      );
      const assigneeIds = new Set<string>([
        ...(typeof data.assignedTo === 'string' && data.assignedTo.trim() ? [data.assignedTo.trim()] : []),
        ...(Array.isArray(data.assignedToIds)
          ? data.assignedToIds.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
          : []),
        ...holders.docs.map((doc) => doc.id),
      ]);
      const guardRef = typeof data.deviceId === 'string' && typeof data.automationTrigger === 'string'
        ? adminDb.collection('automationTaskGuards').doc(`${data.deviceId}--${data.automationTrigger}`)
        : null;
      const guardSnapshot = guardRef ? await transaction.get(guardRef) : null;
      const now = Timestamp.now();
      await syncTechniciansAfterTaskRelease(transaction, assigneeIds, id, now);
      transaction.delete(taskRef);
      if (guardRef && shouldClearAutomationGuard(id, guardSnapshot?.data())) transaction.delete(guardRef);
    });

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
