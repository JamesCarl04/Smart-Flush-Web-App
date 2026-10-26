import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';
import { sendTaskNotification } from '@/lib/fcm';
import type { TaskDoc } from '@/lib/task-types';

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
    const executeFlagging = async (
      getSnapshot: () => Promise<FirebaseFirestore.DocumentSnapshot>,
      applyUpdate: (payload: Record<string, unknown>) => Promise<unknown> | void,
    ) => {
      const snapshot = await getSnapshot();
      if (!snapshot.exists) {
        return { status: 'not_found' as const, taskData: null, targetTechIds: [] as string[] };
      }

      const taskData = snapshot.data() || {};
      const assignedToIds = Array.isArray(taskData.assignedToIds)
        ? taskData.assignedToIds.filter(
            (id): id is string => typeof id === 'string' && id.trim().length > 0,
          )
        : [];
      const primaryAssignee =
        typeof taskData.assignedTo === 'string' && taskData.assignedTo.trim().length > 0
          ? taskData.assignedTo.trim()
          : null;
      const targetTechIds =
        assignedToIds.length > 0
          ? assignedToIds
          : primaryAssignee
            ? [primaryAssignee]
            : [];

      const updatePayload: Record<string, unknown> = {
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
        completedAt: FieldValue.delete(),
        completedBy: null,
      };

      for (const techId of targetTechIds) {
        updatePayload[`submissions.${techId}`] = FieldValue.delete();
      }

      await applyUpdate(updatePayload);

      return { status: 'flagged' as const, taskData, targetTechIds };
    };

    const txResult =
      typeof adminDb.runTransaction === 'function'
        ? await adminDb.runTransaction(async (transaction) =>
            executeFlagging(
              () => transaction.get(taskRef),
              (payload) => {
                transaction.update(taskRef, payload);
              },
            ),
          )
        : null;
    const outcome =
      txResult ??
      (await executeFlagging(
        () => taskRef.get(),
        (payload) => taskRef.update(payload),
      ));

    if (outcome.status === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    if (outcome.taskData && outcome.targetTechIds.length > 0) {
      try {
        const flaggedTaskDoc = {
          ...(outcome.taskData as unknown as TaskDoc),
          id: taskId,
          title: 'Task Flagged for Re-inspection',
          message: `Supervisor flagged your completed task: ${reason}`,
        } as TaskDoc;
        await sendTaskNotification(
          flaggedTaskDoc,
          outcome.targetTechIds[0] ?? null,
          outcome.targetTechIds,
        );
      } catch (fcmErr) {
        console.warn('[Supervisor] Flag task FCM notification failed:', fcmErr);
      }
    }

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
