// app/api/actuators/pump/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishPumpCommand } from '@/lib/mqtt-publish';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

interface PumpBody {
  command: 'ON' | 'OFF';
}

// POST /api/actuators/pump
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // CRITICAL FIX: Rate limiting for actuator commands (prevents DOS/spam)
    const user = await verifyAuthToken(request);
    const rateLimitKey = user.uid; // Rate limit per user
    const rateLimitCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.actuators);
    
    if (!rateLimitCheck.success) {
      const response = createRateLimitResponse(rateLimitCheck.retryAfter || 60);
      return addCorsHeaders(response, request);
    }

    await requireAdmin(user);

    const body = (await request.json()) as Partial<PumpBody>;
    if (body.command !== 'ON' && body.command !== 'OFF') {
      return NextResponse.json(
        { success: false, error: 'command must be "ON" or "OFF"' },
        { status: 400 },
      );
    }

    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishPumpCommand(body.command);
    
    const response = NextResponse.json({
      success: true,
      data: { command: body.command },
    });
    
    return addCorsHeaders(response, request);
  } catch (error) {
    if (error instanceof Response) {
      const response = new NextResponse(error.body, error);
      return addCorsHeaders(response, request);
    }
    console.error('[Actuators] pump error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Failed to publish pump command' },
      { status: 500 },
    );
    return addCorsHeaders(response, request);
  }
}
