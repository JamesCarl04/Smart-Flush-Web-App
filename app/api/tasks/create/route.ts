import { NextResponse } from 'next/server';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { createTaskAndNotify } from '@/lib/task-service';
import { normalizeTaskAssignment } from '@/lib/task-assignment';
import { taskCreateSchema, validateData } from '@/lib/schemas';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    // HIGH FIX: Rate limiting on task creation (prevents DOS)
    const rateLimitCheck = checkRateLimit(user.uid, RATE_LIMITS.tasks);
    if (!rateLimitCheck.success) {
      let response = createRateLimitResponse(rateLimitCheck.retryAfter || 60);
      return addCorsHeaders(response, request as any);
    }

    // HIGH FIX: Input validation with Zod schemas
    const body = (await request.json()) as unknown;
    const validation = validateData(body, taskCreateSchema);
    
    if (!validation.success) {
      let response = NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
      return addCorsHeaders(response, request as any);
    }

    const { toiletId, note } = validation.data;
    const assignment = normalizeTaskAssignment(
      undefined,
      validation.data.assignedToIds,
    );

    const task = await createTaskAndNotify({
      deviceId: toiletId,
      triggerType: 'manual',
      message: note || `Manual cleaning requested for ${toiletId}.`,
      assignedTo: assignment.assignedTo,
      assignedToIds: assignment.assignedToIds,
      createdBy: user.uid,
    });

    let response = NextResponse.json(
      { success: true, data: { taskId: task.id, id: task.id } },
      { status: 201 },
    );
    return addCorsHeaders(response, request as any);
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] create error:', error);
    let response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      },
      { status: 500 },
    );
    return addCorsHeaders(response, request as any);
  }
}
