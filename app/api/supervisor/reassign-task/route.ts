import { NextResponse } from 'next/server';
import { requireSupervisor, verifyAuthToken } from '@/lib/auth-helpers';
import { manualReassignTask } from '@/lib/task-service';

interface ReassignBody {
  taskId?: unknown;
  newAssigneeUid?: unknown;
  reason?: unknown;
  supervisorUid?: unknown;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisor(user);

    const body = (await request.json()) as ReassignBody;
    const taskId = requiredString(body.taskId);
    const newAssigneeUid = requiredString(body.newAssigneeUid);
    const reason = requiredString(body.reason);
    const supervisorUid = requiredString(body.supervisorUid);

    if (!taskId || !newAssigneeUid || !reason || !supervisorUid) {
      return NextResponse.json(
        {
          success: false,
          error: 'taskId, newAssigneeUid, reason, and supervisorUid are required',
        },
        { status: 400 },
      );
    }

    if (supervisorUid !== user.uid) {
      return NextResponse.json(
        { success: false, error: 'supervisorUid must match the caller' },
        { status: 403 },
      );
    }

    await manualReassignTask({
      taskId,
      newAssigneeUid,
      reason,
      supervisorUid: user.uid,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Supervisor] reassign-task error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to reassign task',
      },
      { status: 500 },
    );
  }
}
