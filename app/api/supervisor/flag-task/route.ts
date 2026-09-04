import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

interface FlagBody {
  taskId?: unknown;
  reason?: unknown;
  supervisorUid?: unknown;
  supervisorName?: unknown;
  flagPhotoUrls?: unknown;
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

    const body = (await request.json()) as FlagBody;
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : null;
    const reason =
      typeof body.reason === 'string'
        ? body.reason.trim()
        : 'Requires supervisor re-inspection';
    const supervisorUid = user.uid;
    const supervisorName =
      (typeof user.name === 'string' && user.name.trim()) ||
      user.email?.split('@')[0] ||
      'Supervisor';
    const flagPhotoUrls = Array.isArray(body.flagPhotoUrls)
      ? body.flagPhotoUrls.filter((url): url is string => typeof url === 'string')
      : [];

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
      status: 'flagged',
      inspectionStatus: 'flagged',
      flagReason: reason,
      flagPhotoUrls,
      inspectedBy: supervisorUid,
      inspectedByName: supervisorName,
      inspectedAt: FieldValue.serverTimestamp(),
      supervisorUid,
      flaggedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Task flagged for re-inspection',
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Supervisor] Flag task error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to flag task' },
      { status: 500 },
    );
  }
}
