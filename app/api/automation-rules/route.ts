// app/api/automation-rules/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin, requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getRepeatIntervalMinutes,
  isTaskDispatchAction,
  validateAutomationRule,
} from '@/lib/automation-rule-config';
import {
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  invalidateRuntimeCache,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const AUTOMATION_RULES_CACHE_KEY = 'automation-rules:all';
const AUTOMATION_RULES_CACHE_TTL_MS = 30_000;

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
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const cached = getRuntimeCachedValue<unknown[]>(AUTOMATION_RULES_CACHE_KEY);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = getStaleRuntimeCachedValue<unknown[]>(
        AUTOMATION_RULES_CACHE_KEY,
      );
      return NextResponse.json({
        success: true,
        data: stale ?? [],
        degraded: true,
      });
    }

    const rulesQuery = adminDb
      .collection('automationRules')
      .orderBy('createdAt', 'desc');
    const snap =
      typeof rulesQuery.limit === 'function'
        ? await rulesQuery.limit(100).get()
        : await rulesQuery.get();
    const rules = snap.docs.map((d) => {
      const rule = d.data() as Record<string, unknown>;
      return {
        ...rule,
        repeatIntervalMinutes: getRepeatIntervalMinutes(
          rule.repeatIntervalMinutes,
        ),
      };
    });

    setRuntimeCachedValue(
      AUTOMATION_RULES_CACHE_KEY,
      rules,
      AUTOMATION_RULES_CACHE_TTL_MS,
    );

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      console.warn('[AutomationRules] Firestore quota exceeded; returning fallback');
      const stale = getStaleRuntimeCachedValue<unknown[]>(
        AUTOMATION_RULES_CACHE_KEY,
      );
      return NextResponse.json({
        success: true,
        data: stale ?? [],
        degraded: true,
      });
    }
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

    invalidateRuntimeCache('automation-rules:');

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
