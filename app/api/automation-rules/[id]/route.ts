// app/api/automation-rules/[id]/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateRuleBody {
  name?: string;
  threshold?: number;
  action?: string;
  enabled?: boolean;
}

// PUT /api/automation-rules/:id — update (enable/disable, threshold, etc.)
export async function PUT(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const body = (await request.json()) as UpdateRuleBody;
    const updates: UpdateRuleBody = {};

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: 'Rule name is required' },
          { status: 400 },
        );
      }
      updates.name = trimmedName;
    }

    if (body.threshold !== undefined) {
      if (!Number.isFinite(body.threshold) || body.threshold < 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              'threshold must be a valid number greater than or equal to 0',
          },
          { status: 400 },
        );
      }
      updates.threshold = body.threshold;
    }
    if (body.action !== undefined) updates.action = body.action;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('automationRules').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 },
      );
    }

    await docRef.update(updates as Record<string, unknown>);
    const updated = await docRef.get();

    return NextResponse.json({ success: true, data: updated.data() });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[AutomationRules] PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update rule' },
      { status: 500 },
    );
  }
}

// DELETE /api/automation-rules/:id
export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('automationRules').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 },
      );
    }

    await docRef.delete();
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[AutomationRules] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete rule' },
      { status: 500 },
    );
  }
}
