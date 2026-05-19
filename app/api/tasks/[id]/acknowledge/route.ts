import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMaintenance, verifyAuthToken } from '@/lib/auth-helpers';

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

    const taskRef = adminDb.collection('tasks').doc(id);
    const task = await taskRef.get();
    if (!task.exists) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }

    await taskRef.update({
      status: 'acknowledged',
      acknowledgedAt: Timestamp.now(),
      assignedTo: user.uid,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[Tasks] acknowledge error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge task' },
      { status: 500 },
    );
  }
}
