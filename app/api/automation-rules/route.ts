// app/api/automation-rules/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getRepeatIntervalMinutes,
  isTaskDispatchAction,
  validateAutomationRule,
} from '@/lib/automation-rule-config';

interface CreateRuleBody {
  name?: unknown;
  group?: unknown;
  trigger?: unknown;
  threshold?: unknown;
  action?: unknown;
  enabled?: unknown;
  waterWaitSeconds?: unknown;
  repeatIntervalMinutes?: unknown;
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
      data: snap.docs.map((d) => {
        const rule = d.data() as Record<string, unknown>;
        return {
          ...rule,
          repeatIntervalMinutes: getRepeatIntervalMinutes(
            rule.repeatIntervalMinutes,
          ),
        };
      }),
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
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

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
    const {
      name,
      group,
      trigger,
      threshold,
      action,
      enabled,
      waterWaitSeconds,
      repeatIntervalMinutes,
    } = body;
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
      repeatIntervalMinutes,
    });
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection('automationRules').doc();
    const ruleData = {
      id: docRef.id,
      name: trimmedName,
      ...validation.data,
      enabled: enabled ?? true,
      createdAt: FieldValue.serverTimestamp(),
    };

    if (ruleData.enabled && isTaskDispatchAction(ruleData.action)) {
      const created = await adminDb.runTransaction(async (transaction) => {
        const matchingRules = adminDb
          .collection('automationRules')
          .where('trigger', '==', ruleData.trigger);
        const matchingSnapshot = await transaction.get(matchingRules);
        const hasConflict = matchingSnapshot.docs.some((rule) => {
          const existing = rule.data() as Record<string, unknown>;
          return existing.enabled === true && isTaskDispatchAction(existing.action);
        });
        if (hasConflict) return false;

        transaction.set(docRef, ruleData);
        return true;
      });

      if (!created) {
        return NextResponse.json(
          {
            success: false,
            error: 'An enabled task-dispatch rule already exists for this trigger',
          },
          { status: 409 },
        );
      }
    } else {
      await docRef.set(ruleData);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...ruleData,
          repeatIntervalMinutes: getRepeatIntervalMinutes(
            ruleData.repeatIntervalMinutes,
          ),
        },
      },
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
