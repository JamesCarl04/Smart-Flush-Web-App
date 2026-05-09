import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

interface CreateTaskBody {
  toiletId: string;
  note?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    const body = (await request.json()) as Partial<CreateTaskBody>;
    const toiletId = body.toiletId?.trim();
    const note = body.note?.trim();

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

    const deviceDoc = await adminDb.collection('devices').doc(toiletId).get();
    if (!deviceDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Selected toilet unit was not found' },
        { status: 404 },
      );
    }

    const docRef = adminDb.collection('tasks').doc();
    await docRef.set({
      id: docRef.id,
      toiletId,
      triggeredBy: 'admin' as const,
      triggeredAt: FieldValue.serverTimestamp(),
      assignedTo: 'maintenance-personnel',
      status: 'pending' as const,
      ...(note ? { note } : {}),
    });

    return NextResponse.json(
      { success: true, data: { id: docRef.id } },
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
