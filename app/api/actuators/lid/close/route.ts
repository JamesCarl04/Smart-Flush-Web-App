// app/api/actuators/lid/close/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishLidCommand } from '@/lib/mqtt-publish';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

// POST /api/actuators/lid/close
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const rateLimitCheck = checkRateLimit(user.uid, RATE_LIMITS.actuators);
    if (!rateLimitCheck.success) {
      return addCorsHeaders(
        createRateLimitResponse(rateLimitCheck.retryAfter || 60),
        request,
      );
    }

    await requireAdmin(user);
    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishLidCommand('CLOSE');
    return addCorsHeaders(
      NextResponse.json({ success: true, data: { command: 'CLOSE' } }),
      request,
    );
  } catch (error) {
    if (error instanceof Response) {
      return addCorsHeaders(new NextResponse(error.body, error), request);
    }
    console.error('[Actuators] lid/close error:', error);
    return addCorsHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to publish lid CLOSE command' },
        { status: 500 },
      ),
      request,
    );
  }
}
