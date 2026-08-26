// app/api/automation-rules/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';
import { validateAutomationRule } from '@/lib/automation-rule-config';

interface CreateRuleBody {
  name?: unknown;
  group?: unknown;
  trigger?: unknown;
  threshold?: unknown;
  action?: unknown;
  enabled?: unknown;
  waterWaitSeconds?: unknown;
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

    const rawBody: unknown = await request.json();
    if (
      !rawBody ||
      typeof rawBody !== 'object' ||
      Array.isArray(rawBody)
    ) {
      return NextResponse.json(
        { success: false, error: 'Request body must be an object' },
        { status: 400 },
      );
    }
    const body = rawBody as CreateRuleBody;
    const { name, group, trigger, threshold, action, enabled, waterWaitSeconds } = body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';

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

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          error: 'enabled must be a boolean',
        },
        { status: 400 },
      );
    }

    const validation = validateAutomationRule({
      group,
      trigger,
      threshold,
      action,
      waterWaitSeconds,
    });
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('automationRules').doc();
    await docRef.set({
      id: docRef.id,
      name: trimmedName,
      ...validation.data,
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
