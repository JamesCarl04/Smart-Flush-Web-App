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
  findAvailableMaintenancePersonnel,
  isAssignedToUser,
  normalizeTaskAssignment,
  selectAvailableTechnicianAlphabetically,
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
import {
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  invalidateRuntimeCache,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const TASKS_CACHE_TTL_MS = 15_000;

interface CreateTaskBody {
  deviceId?: unknown;
  triggerType?: unknown;
  message?: unknown;
  assignedTo?: unknown;
  assignedToIds?: unknown;
  isBroadcast?: unknown;
  assignmentType?: unknown;
  autoAssign?: unknown;
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function taskCreatedAtMillis(task: { createdAt: number | null }): number {
  return task.createdAt ?? 0;
}

async function listMaintenanceUserIds(): Promise<string[]> {
  if (isFirestoreQuotaCircuitOpen()) {
    return [];
  }

  try {
    const query = adminDb
      .collection('users')
      .where('role', 'in', ['maintenance', 'technician']);
    const snapshot =
      typeof query.limit === 'function' ? await query.limit(200).get() : await query.get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    throw err;
  }
}

// GET /api/tasks
export async function GET(request: Request): Promise<NextResponse> {
  let cacheKey = '';
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (
      role !== 'admin' &&
      role !== 'supervisor' &&
      role !== 'maintenance' &&
      role !== 'technician'
    ) {
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

    const isMaint = role === 'maintenance' || role === 'technician';
    cacheKey = isMaint
      ? `tasks:maint:${user.uid}:${statusParam ?? 'all'}`
      : `tasks:admin:${statusParam ?? 'all'}`;

    const cached = getRuntimeCachedValue<TaskApiData[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = getStaleRuntimeCachedValue<TaskApiData[]>(cacheKey);
      return NextResponse.json({
        success: true,
        data: stale ?? [],
        degraded: true,
      });
    }

    if (isMaint) {
      const taskMap = new Map<string, TaskApiData>();
      const baseQuery = adminDb.collection('tasks').orderBy('createdAt', 'desc');
      const allTasksSnapshot =
        typeof baseQuery.limit === 'function'
          ? await baseQuery.limit(100).get()
          : await baseQuery.get();

      for (const doc of allTasksSnapshot.docs) {
        const rawTask = serializeTaskSnapshot(doc);
        const isUserTask =
          isAssignedToUser(rawTask, user.uid) ||
          (user.email && rawTask.assignedTo === user.email) ||
          rawTask.createdBy === user.uid ||
          rawTask.recheckedBy === user.uid ||
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

      setRuntimeCachedValue(cacheKey, tasks, TASKS_CACHE_TTL_MS);

      return NextResponse.json({ success: true, data: tasks });
    }

    const adminTasksQuery = adminDb.collection('tasks').orderBy('createdAt', 'desc');
    const [snapshot, maintenanceUserIds] = await Promise.all([
      typeof adminTasksQuery.limit === 'function'
        ? adminTasksQuery.limit(100).get()
        : adminTasksQuery.get(),
      listMaintenanceUserIds(),
    ]);
    const tasks = snapshot.docs
      .map(serializeTaskSnapshot)
      .map((task) => withDashboardTaskStatus(task, maintenanceUserIds))
      .filter((task) => !statusParam || task.status === statusParam);

    setRuntimeCachedValue(cacheKey, tasks, TASKS_CACHE_TTL_MS);

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      console.warn('[Tasks] Firestore quota exceeded; returning fallback');
      const stale = cacheKey ? getStaleRuntimeCachedValue<TaskApiData[]>(cacheKey) : null;
      return NextResponse.json({
        success: true,
        data: stale ?? [],
        degraded: true,
      });
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

    const isBroadcast =
      body.isBroadcast === true || body.assignmentType === 'broadcast';
    const shouldAutoAssign =
      body.autoAssign === true &&
      !isBroadcast &&
      assignment.assignedToIds.length === 0;

    let resolvedAssignedTo = isBroadcast ? null : assignment.assignedTo;
    let resolvedAssignedToIds = isBroadcast ? [] : assignment.assignedToIds;
    let assignedToName: string | null = null;

    if (shouldAutoAssign) {
      const available = await findAvailableMaintenancePersonnel();
      const selectedTech = selectAvailableTechnicianAlphabetically(available);
      if (selectedTech) {
        resolvedAssignedTo = selectedTech.id;
        resolvedAssignedToIds = [selectedTech.id];
        assignedToName = selectedTech.displayName;
      }
    }

    const assignmentType: 'broadcast' | 'individual' | 'team' | undefined =
      isBroadcast
        ? 'broadcast'
        : body.assignmentType === 'team' || resolvedAssignedToIds.length > 1
          ? 'team'
          : body.assignmentType === 'individual' ||
              resolvedAssignedToIds.length === 1
            ? 'individual'
            : undefined;

    const task = await createTaskAndNotify({
      deviceId,
      triggerType: body.triggerType,
      message,
      assignedTo: resolvedAssignedTo,
      assignedToIds: resolvedAssignedToIds,
      createdBy: user.uid,
      isBroadcast,
      assignmentType,
    });

    invalidateRuntimeCache('tasks:');

    return NextResponse.json(
      {
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          assignedTo: task.assignedTo ?? null,
          assignedToName,
        },
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
