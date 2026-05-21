import { NextResponse } from 'next/server';
import { requireNotViewer, verifyAuthToken } from '@/lib/auth-helpers';
import {
  createMaintenanceNoteAndNotify,
  serializeMaintenanceNote,
} from '@/lib/maintenance-note-service';
import { adminDb } from '@/lib/firebase-admin';

interface CreateMaintenanceNoteBody {
  restroomId?: unknown;
  note?: unknown;
  assignedTo?: unknown;
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireNotViewer(user);

    const snapshot = await adminDb
      .collection('maintenanceNotes')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return NextResponse.json({
      success: true,
      data: snapshot.docs.map(serializeMaintenanceNote),
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[MaintenanceNotes] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch maintenance notes' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireNotViewer(user);

    const body = (await request.json()) as CreateMaintenanceNoteBody;
    const restroomId = trimmedString(body.restroomId);
    const note = trimmedString(body.note);
    const assignedTo = trimmedString(body.assignedTo);
    const effectiveAssignedTo = assignedTo ? assignedTo : null;

    if (!restroomId) {
      return NextResponse.json(
        { success: false, error: 'restroomId is required' },
        { status: 400 },
      );
    }

    if (!note) {
      return NextResponse.json(
        { success: false, error: 'note is required' },
        { status: 400 },
      );
    }

    if (note.length > 500) {
      return NextResponse.json(
        { success: false, error: 'note must be 500 characters or fewer' },
        { status: 400 },
      );
    }

    const { note: maintenanceNote, task } =
      await createMaintenanceNoteAndNotify({
        restroomId,
        message: note,
        assignedTo: effectiveAssignedTo,
        createdBy: user.uid,
      });

    return NextResponse.json(
      {
        success: true,
        data: {
          noteId: maintenanceNote.id,
          taskId: task.id,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[MaintenanceNotes] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send maintenance note' },
      { status: 500 },
    );
  }
}
