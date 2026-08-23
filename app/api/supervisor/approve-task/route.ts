import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

interface ApproveBody {
  taskId?: unknown;
  supervisorUid?: unknown;
  supervisorName?: unknown;
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

    const body = (await request.json()) as ApproveBody;
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : null;
    const supervisorUid =
      typeof body.supervisorUid === 'string'
        ? body.supervisorUid.trim()
        : user.uid;
    const supervisorName =
      typeof body.supervisorName === 'string' && body.supervisorName.trim().length > 0
        ? body.supervisorName.trim()
        : user.email?.split('@')[0] || 'Supervisor';

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
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
      inspectionStatus: 'approved',
      inspectedBy: supervisorUid,
      inspectedByName: supervisorName,
      inspectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Task approved by supervisor',
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Supervisor] Approve task error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to approve task' },
      { status: 500 },
    );
  }
}
