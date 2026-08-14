// app/api/actuators/pump/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken, requireNotViewer } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishPumpCommand } from '@/lib/mqtt-publish';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
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
      let response = createRateLimitResponse(rateLimitCheck.retryAfter || 60);
      return addCorsHeaders(response, request as any);
    }

    await requireNotViewer(user);

    const body = (await request.json()) as Partial<PumpBody>;
    if (body.command !== 'ON' && body.command !== 'OFF') {
      return NextResponse.json(
        { success: false, error: 'command must be "ON" or "OFF"' },
        { status: 400 },
      );
    }

    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishPumpCommand(body.command);
    
    let response = NextResponse.json({
      success: true,
      data: { command: body.command },
    });
    
    return addCorsHeaders(response, request as any);
  } catch (error) {
    if (error instanceof Response) {
      let response = new NextResponse(error.body, error);
      return addCorsHeaders(response, request as any);
    }
    console.error('[Actuators] pump error:', error);
    let response = NextResponse.json(
      { success: false, error: 'Failed to publish pump command' },
      { status: 500 },
    );
    return addCorsHeaders(response, request as any);
  }
}
