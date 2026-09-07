import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';
import { syncTechniciansAfterTaskRelease } from '@/lib/task-lifecycle';

interface ReassignBody {
  taskId?: unknown;
  newAssigneeUid?: unknown;
  newAssigneeUids?: unknown;
  reason?: unknown;
  supervisorUid?: unknown;
  supervisorName?: unknown;
  assigneeNames?: unknown;
}

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

    const body = (await request.json()) as ReassignBody;
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : null;
    let targetUids: string[] = [];
    if (Array.isArray(body.newAssigneeUids)) {
      targetUids = body.newAssigneeUids
        .filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
        .map((uid) => uid.trim());
    } else if (typeof body.newAssigneeUid === 'string' && body.newAssigneeUid.trim()) {
      targetUids = [body.newAssigneeUid.trim()];
    }

    const primaryAssigneeUid = targetUids[0] ?? null;
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : 'Manual reassignment';
    const supervisorUid =
      typeof body.supervisorUid === 'string'
        ? body.supervisorUid.trim()
        : user.uid;
    const supervisorName =
      typeof body.supervisorName === 'string' && body.supervisorName.trim()
        ? body.supervisorName.trim()
        : (user as any).name || (user as any).displayName || 'Supervisor';

    if (!taskId || targetUids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'taskId and newAssigneeUid or newAssigneeUids are required' },
        { status: 400 },
      );
    }

    const assignedToNames: Record<string, string> = {};
    if (
      body.assigneeNames &&
      typeof body.assigneeNames === 'object' &&
      !Array.isArray(body.assigneeNames)
    ) {
      for (const [k, v] of Object.entries(body.assigneeNames)) {
        if (typeof v === 'string' && v.trim()) {
          assignedToNames[k] = v.trim();
        }
      }
    }

    for (const uid of targetUids) {
      if (!assignedToNames[uid]) {
        try {
          const userDoc = await adminDb.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const uData = userDoc.data();
            const name =
              uData?.displayName || uData?.name || uData?.fullName;
            if (name && typeof name === 'string' && name.trim()) {
              assignedToNames[uid] = name.trim();
            }
          }
        } catch {
          // ignore lookup error
        }
      }
    }

    const taskRef = adminDb.collection('tasks').doc(taskId);
    const outcome = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(taskRef);
      if (!snapshot.exists) return { kind: 'not_found' as const };
      const taskData = snapshot.data() ?? {};
      if (taskData.completedAt != null || taskData.status === 'completed') return { kind: 'completed' as const };
      if (taskData.status === 'acknowledged' || taskData.status === 'rechecking') return { kind: 'in_progress' as const };
      const previousAssigneeUids = new Set<string>([
        ...(typeof taskData.assignedTo === 'string' && taskData.assignedTo.trim()
          ? [taskData.assignedTo.trim()]
          : []),
        ...(Array.isArray(taskData.assignedToIds)
          ? taskData.assignedToIds.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
          : []),
      ]);
      const now = Timestamp.now();
      const releasedUids = Array.from(previousAssigneeUids).filter((uid) => !targetUids.includes(uid));
      await syncTechniciansAfterTaskRelease(
        transaction,
        releasedUids,
        taskId,
        now,
      );

      const existingHistory = Array.isArray(taskData.reassignmentHistory) ? taskData.reassignmentHistory : [];
      const newHistoryEvent = {
        reassignedAt: now,
        reassignedByUid: supervisorUid,
        reassignedByName: supervisorName,
        previousAssigneeUids: Array.from(previousAssigneeUids),
        newAssigneeUids: targetUids,
        reason,
      };

      transaction.update(taskRef, {
        assignedTo: primaryAssigneeUid,
        assignedToIds: targetUids,
        assignedToNames,
        status: 'assigned',
        isBroadcast: false,
        assignmentType: targetUids.length > 1 ? 'team' : 'individual',
        assignmentSource: 'supervisor',
        requiresSupervisorAssignment: false,
        autoAssignmentEligibleAt: null,
        reassignReason: reason,
        reassignedByName: supervisorName,
        supervisorUid,
        acknowledgedAt: null,
        acknowledgedBy: {},
        reassignCount: Number(taskData.reassignCount ?? 0) + 1,
        reassignmentHistory: [...existingHistory, newHistoryEvent],
        assignedAt: now,
        updatedAt: now,
      });

      for (const uid of targetUids) {
        transaction.set(adminDb.collection('users').doc(uid), {
          currentTaskId: taskId,
          isAvailable: false,
          updatedAt: now,
        }, { merge: true });
      }

      return { kind: 'updated' as const, taskData };
    });
    if (outcome.kind === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    if (outcome.kind === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Cannot reassign a task that has already been completed.' },
        { status: 400 },
      );
    }

    if (outcome.kind === 'in_progress') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Cannot reassign task: Work is currently in progress on-site by the technician.',
        },
        { status: 400 },
      );
    }

    const taskData = outcome.taskData;

    // Dispatch FCM notification to each newly assigned technician
    try {
      const { sendTaskNotification } = await import('@/lib/fcm');
      for (const uid of targetUids) {
        await sendTaskNotification(
          {
            id: taskId,
            deviceId: taskData?.deviceId ?? '',
            triggerType: taskData?.triggerType ?? 'maintenance',
            title: '🔄 Task Reassigned to You by Supervisor',
            message: `Reason: ${reason}`,
            status: 'assigned',
            assignedTo: primaryAssigneeUid,
            assignedToIds: targetUids,
            createdAt: taskData?.createdAt,
            acknowledgedAt: null,
            completedAt: null,
            createdBy: supervisorUid,
          } as any,
          uid,
        );
      }
    } catch (err) {
      console.warn('[ReassignTask] FCM notification warning:', err);
    }

    return NextResponse.json({
      success: true,
      message: 'Task reassigned successfully and squad availability updated',
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Supervisor] Reassign task error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reassign task' },
      { status: 500 },
    );
  }
}
