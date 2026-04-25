// app/api/automation-rules/[id]/reset-counter/route.ts
// POST /api/automation-rules/:id/reset-counter
// Reads the rule's trigger field and resets the corresponding maintenanceCounter to 0.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Maps automation rule triggers to the maintenanceCounter field they govern
const TRIGGER_TO_COUNTER: Record<string, string> = {
  uv_cycle_failed: 'uvOnTimeSeconds',
  maintenance_uvOnTimeSeconds: 'uvOnTimeSeconds',
  maintenance_lidCycleCount: 'lidCycleCount',
  maintenance_flowSensorTotalLiters: 'flowSensorTotalLiters',
  maintenance_pumpTotalLiters: 'pumpTotalLiters',
  maintenance_ultrasonicConsecutiveFailures: 'ultrasonicConsecutiveFailures',
  maintenance_relayTotalTriggers: 'relayTotalTriggers',
};

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    // Fetch the rule to find what deviceId and trigger it relates to
    const ruleDoc = await adminDb.collection('automationRules').doc(id).get();
    if (!ruleDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 },
      );
    }

    const rule = ruleDoc.data() as { trigger: string; deviceId?: string };
    const counterField = TRIGGER_TO_COUNTER[rule.trigger];

    if (!counterField) {
      return NextResponse.json(
        {
          success: false,
          error: `No counter mapped for trigger: ${rule.trigger}`,
        },
        { status: 400 },
      );
    }

    // deviceId can be passed in body or fall back to the rule's deviceId
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
    };
    const deviceId = body.deviceId ?? rule.deviceId ?? 'toilet-01';

    const countersRef = adminDb
      .collection('devices')
      .doc(deviceId)
      .collection('maintenanceCounters')
      .doc('current');

    await countersRef.set({ [counterField]: 0 }, { merge: true });

    return NextResponse.json({
      success: true,
      data: { deviceId, counter: counterField, value: 0 },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[AutomationRules] reset-counter error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset counter' },
      { status: 500 },
    );
  }
}
