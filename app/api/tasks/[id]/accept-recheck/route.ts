import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserRole, requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AcceptRecheckBody {
  technicianUid?: unknown;
  technicianName?: unknown;
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireMaintenance(user);
    const role = await getUserRole(user);
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as AcceptRecheckBody;
    const isPrivileged = role === 'admin' || role === 'supervisor';
    const technicianUid =
      isPrivileged &&
      typeof body.technicianUid === 'string' &&
      body.technicianUid.trim().length > 0
        ? body.technicianUid.trim()
        : user.uid;
    const technicianName =
      isPrivileged &&
      typeof body.technicianName === 'string' &&
      body.technicianName.trim().length > 0
        ? body.technicianName.trim()
        : user.email?.split('@')[0] || 'Technician';

    const taskRef = adminDb.collection('tasks').doc(taskId);
    const userRef = adminDb.collection('users').doc(technicianUid);

    await adminDb.runTransaction(async (transaction) => {
      const taskSnap = await transaction.get(taskRef);

      if (!taskSnap.exists) {
        throw new Response(
          JSON.stringify({ success: false, error: 'Task not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const taskData = taskSnap.data() || {};
      if (taskData.status !== 'flagged' && taskData.inspectionStatus !== 'flagged') {
        throw new Response(
          JSON.stringify({
            success: false,
            error: 'Task is not in flagged state for recheck',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (!isPrivileged) {
        const assignedToIds = Array.isArray(taskData.assignedToIds)
          ? (taskData.assignedToIds as string[])
          : [];
        const isAssignedToCaller =
          taskData.assignedTo === user.uid ||
          (user.email && taskData.assignedTo === user.email) ||
          taskData.recheckedBy === user.uid ||
          assignedToIds.includes(user.uid) ||
          Boolean(taskData.isBroadcast);

        if (!isAssignedToCaller) {
          throw new Response(
            JSON.stringify({
              success: false,
              error: 'Forbidden: task is not assigned to this technician',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      transaction.update(taskRef, {
        status: 'rechecking',
        recheckCount: FieldValue.increment(1),
        recheckedBy: technicianUid,
        recheckedByName: technicianName,
        recheckedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(
        userRef,
        {
          currentTaskId: taskId,
          status: 'on_task',
          isAvailable: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    return NextResponse.json({
      success: true,
      data: { taskId },
      message: 'Recheck accepted and technician marked on task',
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] Accept recheck error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to accept recheck task' },
      { status: 500 },
    );
  }
}
