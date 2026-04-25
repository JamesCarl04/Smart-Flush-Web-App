// app/api/automation-rules/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

interface CreateRuleBody {
  name: string;
  group: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
}

// GET /api/automation-rules — list all
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const snap = await adminDb
      .collection('automationRules')
      .orderBy('createdAt', 'desc')
      .get();
    return NextResponse.json({
      success: true,
      data: snap.docs.map((d) => d.data()),
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[AutomationRules] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rules' },
      { status: 500 },
    );
  }
}

// POST /api/automation-rules — create
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const body = (await request.json()) as Partial<CreateRuleBody>;
    const { name, group, trigger, threshold, action, enabled } = body;
    const trimmedName = name?.trim();

    if (
      !trimmedName ||
      !group ||
      !trigger ||
      threshold === undefined ||
      !action
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'name, group, trigger, threshold, and action are required',
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(threshold) || threshold < 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'threshold must be a valid number greater than or equal to 0',
        },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('automationRules').doc();
    await docRef.set({
      id: docRef.id,
      name: trimmedName,
      group,
      trigger,
      threshold,
      action,
      enabled: enabled ?? true,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { success: true, data: { id: docRef.id } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[AutomationRules] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create rule' },
      { status: 500 },
    );
  }
}
