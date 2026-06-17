import { NextResponse } from 'next/server';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';
import { completeTask } from '@/lib/task-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireMaintenance(user);
    const { id } = await params;

    await completeTask(id, user.uid);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    const message =
      error instanceof Error ? error.message : 'Failed to complete task';
    console.error('[Tasks] complete error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Forbidden' ? 403 : 500 },
    );
  }
}
