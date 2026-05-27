import { NextResponse } from 'next/server';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { createTaskAndNotify } from '@/lib/task-service';
import { normalizeTaskAssignment } from '@/lib/task-assignment';

interface CreateTaskBody {
  toiletId: string;
  note?: string;
  assignedTo?: string | null;
  assignedToIds?: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const body = (await request.json()) as Partial<CreateTaskBody>;
    const toiletId = body.toiletId?.trim();
    const note = body.note?.trim();
    const assignment = normalizeTaskAssignment(
      body.assignedTo,
      body.assignedToIds,
    );

    if (!toiletId) {
      return NextResponse.json(
        { success: false, error: 'toiletId is required' },
        { status: 400 },
      );
    }

    if (note && note.length > 200) {
      return NextResponse.json(
        { success: false, error: 'note must be 200 characters or fewer' },
        { status: 400 },
      );
    }

    const task = await createTaskAndNotify({
      deviceId: toiletId,
      triggerType: 'manual',
      message: note || `Manual cleaning requested for ${toiletId}.`,
      assignedTo: assignment.assignedTo,
      assignedToIds: assignment.assignedToIds,
      createdBy: user.uid,
    });

    return NextResponse.json(
      { success: true, data: { taskId: task.id, id: task.id } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      },
      { status: 500 },
    );
  }
}
