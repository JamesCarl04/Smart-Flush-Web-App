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
    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(taskRef);
      if (!snapshot.exists) return 'not_found' as const;

      const task = snapshot.data() ?? {};
      const isRoutineMaintenance = task.automationTrigger === 'maintenance_due';
      if (isRoutineMaintenance && task.status !== 'completed') {
        return 'routine_not_completed' as const;
      }

      // Approval is deliberately idempotent. This is what prevents a repeated
      // request from resetting a newly accumulated cycle count a second time.
      if (task.inspectionStatus === 'approved') return 'already_approved' as const;

      const timestamp = FieldValue.serverTimestamp();
      if (isRoutineMaintenance) {
        if (typeof task.deviceId !== 'string' || !task.deviceId.trim()) {
          return 'missing_device' as const;
        }

        const counterRef = adminDb
          .collection('devices')
          .doc(task.deviceId.trim())
          .collection('maintenanceCounters')
          .doc('current');
        // Read the counter in the same transaction so reset and approval retry
        // together if another writer changes the document concurrently.
        await transaction.get(counterRef);
        transaction.set(
          counterRef,
          {
            flushCycleCount: 0,
            lastResetAt: timestamp,
            lastResetBy: supervisorUid,
            lastResetTaskId: taskId,
          },
          { merge: true },
        );
      }

      transaction.update(taskRef, {
        inspectionStatus: 'approved',
        inspectedBy: supervisorUid,
        inspectedByName: supervisorName,
        inspectedAt: timestamp,
        updatedAt: timestamp,
        ...(isRoutineMaintenance
          ? {
              maintenanceCounterReset: true,
              maintenanceCounterResetAt: timestamp,
              maintenanceCounterResetBy: supervisorUid,
            }
          : {}),
      });
      return 'approved' as const;
    });

    if (result === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }
    if (result === 'routine_not_completed') {
      return NextResponse.json(
        { success: false, error: 'Routine maintenance must be completed before approval.' },
        { status: 409 },
      );
    }
    if (result === 'missing_device') {
      return NextResponse.json(
        { success: false, error: 'Routine maintenance task has no deviceId.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        result === 'already_approved'
          ? 'Task was already approved'
          : 'Task approved by supervisor',
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
