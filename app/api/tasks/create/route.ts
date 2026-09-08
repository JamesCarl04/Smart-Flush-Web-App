import { NextResponse } from 'next/server';
import { verifyAuthToken, getUserRole } from '@/lib/auth-helpers';
import { createTaskAndNotify } from '@/lib/task-service';
import { normalizeTaskAssignment } from '@/lib/task-assignment';
import { taskCreateSchema, validateData } from '@/lib/schemas';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);
    if (role !== 'admin' && role !== 'supervisor') {
      let response = NextResponse.json(
        { success: false, error: 'Forbidden: admin or supervisor only' },
        { status: 403 },
      );
      return addCorsHeaders(response, request as any);
    }

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
    const isBroadcast =
      validation.data.isBroadcast === true ||
      validation.data.assignmentType === 'broadcast';

    const assignment = normalizeTaskAssignment(
      isBroadcast ? undefined : validation.data.assignedTo,
      isBroadcast ? [] : validation.data.assignedToIds,
    );

    const assignmentType: 'broadcast' | 'individual' | 'team' | undefined =
      isBroadcast
        ? 'broadcast'
        : validation.data.assignmentType ??
          (assignment.assignedToIds.length > 1
            ? 'team'
            : assignment.assignedToIds.length === 1
              ? 'individual'
              : undefined);

    const task = await createTaskAndNotify({
      deviceId: toiletId,
      triggerType: 'manual',
      message: note || `Manual cleaning requested for ${toiletId}.`,
      assignedTo: isBroadcast ? null : assignment.assignedTo,
      assignedToIds: isBroadcast ? [] : assignment.assignedToIds,
      createdBy: user.uid,
      isBroadcast,
      assignmentType,
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
