// app/api/actuators/reset/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken, requireSupervisorOrAdmin } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishResetCommand } from '@/lib/mqtt-publish';
import {
  checkRateLimit,
  RATE_LIMITS,
  createRateLimitResponse,
} from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

// POST /api/actuators/reset
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const rateLimitKey = `actuator:reset:${user.uid}`;
    const rateLimitCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.actuators);

    if (!rateLimitCheck.success) {
      const response = createRateLimitResponse(rateLimitCheck.retryAfter || 60);
      return addCorsHeaders(response, request);
    }

    await requireSupervisorOrAdmin(user);
    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishResetCommand();

    const response = NextResponse.json({
      success: true,
      data: { command: 'RESET' },
    });
    return addCorsHeaders(response, request);
  } catch (error) {
    if (error instanceof Response) {
      const response = new NextResponse(error.body, error);
      return addCorsHeaders(response, request);
    }
    console.error('[Actuators] reset error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Failed to publish reset command' },
      { status: 500 },
    );
    return addCorsHeaders(response, request);
  }
}
