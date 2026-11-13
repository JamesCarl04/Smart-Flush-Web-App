// app/api/actuators/uv/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishUVCommand } from '@/lib/mqtt-publish';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { addCorsHeaders } from '@/lib/cors';

interface UVBody {
  command: 'ON' | 'OFF';
}

// POST /api/actuators/uv
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

    const body = (await request.json()) as Partial<UVBody>;
    if (body.command !== 'ON' && body.command !== 'OFF') {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, error: 'command must be "ON" or "OFF"' },
          { status: 400 },
        ),
        request,
      );
    }

    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishUVCommand(body.command);
    return addCorsHeaders(
      NextResponse.json({
        success: true,
        data: { command: body.command },
      }),
      request,
    );
  } catch (error) {
    if (error instanceof Response) {
      return addCorsHeaders(new NextResponse(error.body, error), request);
    }
    console.error('[Actuators] uv error:', error);
    return addCorsHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to publish UV command' },
        { status: 500 },
      ),
      request,
    );
  }
}
