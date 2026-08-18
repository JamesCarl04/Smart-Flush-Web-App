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

    await taskRef.update({
      assignedTo: newAssigneeUid,
      assignedToIds: [newAssigneeUid],
      status: 'assigned',
      reassignReason: reason,
      supervisorUid,
      reassignCount: FieldValue.increment(1),
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Task reassigned successfully',
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
