// app/api/automation-rules/[id]/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';
import { validateAutomationRule } from '@/lib/automation-rule-config';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateRuleBody {
  name?: unknown;
  group?: unknown;
  trigger?: unknown;
  threshold?: unknown;
  action?: unknown;
  enabled?: unknown;
  waterWaitSeconds?: unknown;
}

// PUT /api/automation-rules/:id — update (enable/disable, threshold, etc.)
export async function PUT(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

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
    const body = rawBody as UpdateRuleBody;
    const updates: Record<string, unknown> = {};

    const docRef = adminDb.collection('automationRules').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 },
      );
    }
    const existingRule = doc.data() as Record<string, unknown>;

    if (body.name !== undefined) {
      const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';
      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: 'Rule name is required' },
          { status: 400 },
        );
      }
      updates.name = trimmedName;
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'enabled must be a boolean' },
          { status: 400 },
        );
      }
      updates.enabled = body.enabled;
    }

    const hasField = (field: keyof UpdateRuleBody) =>
      Object.prototype.hasOwnProperty.call(body, field);
    const valueOrExisting = (field: keyof UpdateRuleBody, existing: unknown) =>
      hasField(field) ? body[field] : existing;
    const hasRuleConfigurationUpdate = [
      'group',
      'trigger',
      'threshold',
      'action',
      'waterWaitSeconds',
    ].some((field) => hasField(field as keyof UpdateRuleBody));

    if (hasRuleConfigurationUpdate) {
      const targetTrigger = valueOrExisting('trigger', existingRule.trigger);
      const targetIsNoWater = targetTrigger === 'no_water_after_flush';
      const validation = validateAutomationRule({
        group: valueOrExisting('group', existingRule.group),
        trigger: targetTrigger,
        threshold: valueOrExisting('threshold', existingRule.threshold),
        action: valueOrExisting('action', existingRule.action),
        waterWaitSeconds: targetIsNoWater
          ? valueOrExisting(
              'waterWaitSeconds',
              existingRule.waterWaitSeconds,
            )
          : undefined,
      });
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: 400 },
        );
      }

      if (body.group !== undefined) updates.group = validation.data.group;
      if (body.trigger !== undefined) updates.trigger = validation.data.trigger;
      if (body.threshold !== undefined) {
        updates.threshold = validation.data.threshold;
      }
      if (body.action !== undefined) updates.action = validation.data.action;
      if (targetIsNoWater) {
        if (
          validation.data.waterWaitSeconds !== undefined &&
          (body.waterWaitSeconds !== undefined || body.trigger !== undefined)
        ) {
          updates.waterWaitSeconds = validation.data.waterWaitSeconds;
        }
      } else if (existingRule.waterWaitSeconds !== undefined) {
        updates.waterWaitSeconds = FieldValue.delete();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    await docRef.update(updates);
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
