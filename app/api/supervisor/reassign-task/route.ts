import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

interface ReassignBody {
  taskId?: unknown;
  newAssigneeUid?: unknown;
  reason?: unknown;
  supervisorUid?: unknown;
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
    const newAssigneeUid =
      typeof body.newAssigneeUid === 'string'
        ? body.newAssigneeUid.trim()
        : null;
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : 'Manual reassignment';
    const supervisorUid =
      typeof body.supervisorUid === 'string'
        ? body.supervisorUid.trim()
        : user.uid;

    if (!taskId || !newAssigneeUid) {
      return NextResponse.json(
        { success: false, error: 'taskId and newAssigneeUid are required' },
        { status: 400 },
      );
    }

    const taskRef = adminDb.collection('tasks').doc(taskId);
    const snapshot = await taskRef.get();
    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    const taskData = snapshot.data();
    if (taskData?.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Cannot reassign a task that has already been completed.' },
        { status: 400 },
      );
    }

    if (taskData?.status === 'acknowledged' || taskData?.status === 'rechecking') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Cannot reassign task: Work is currently in progress on-site by the technician.',
        },
        { status: 400 },
      );
    }

    const previousAssigneeUid =
      typeof taskData?.assignedTo === 'string' && taskData.assignedTo.trim().length > 0
        ? taskData.assignedTo.trim()
        : null;

    const updates: Promise<unknown>[] = [
      taskRef.update({
        assignedTo: newAssigneeUid,
        assignedToIds: [newAssigneeUid],
        status: 'assigned',
        isBroadcast: false,
        assignmentType: 'individual',
        assignmentSource: 'supervisor',
        requiresSupervisorAssignment: false,
        autoAssignmentEligibleAt: null,
        reassignReason: reason,
        supervisorUid,
        acknowledgedAt: null,
        acknowledgedBy: {},
        reassignCount: FieldValue.increment(1),
        assignedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      adminDb
        .collection('users')
        .doc(newAssigneeUid)
        .set(
          {
            currentTaskId: taskId,
            isAvailable: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    ];

    if (previousAssigneeUid && previousAssigneeUid !== newAssigneeUid) {
      updates.push(
        adminDb
          .collection('users')
          .doc(previousAssigneeUid)
          .set(
            {
              currentTaskId: null,
              isAvailable: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
      );
    }

    await Promise.all(updates);

    // Dispatch FCM notification to the newly assigned technician
    try {
      const { sendTaskNotification } = await import('@/lib/fcm');
      await sendTaskNotification(
        {
          id: taskId,
          deviceId: taskData?.deviceId ?? '',
          triggerType: taskData?.triggerType ?? 'maintenance',
          message: taskData?.message ?? 'Task reassigned to you by supervisor',
          status: 'assigned',
          assignedTo: newAssigneeUid,
          assignedToIds: [newAssigneeUid],
          createdAt: taskData?.createdAt,
          acknowledgedAt: null,
          completedAt: null,
          createdBy: supervisorUid,
        },
        newAssigneeUid,
      );
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
