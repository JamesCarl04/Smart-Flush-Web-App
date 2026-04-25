// app/api/actuators/uv/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishUVCommand } from '@/lib/mqtt-publish';

interface UVBody {
  command: 'ON' | 'OFF';
}

// POST /api/actuators/uv
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const body = (await request.json()) as Partial<UVBody>;
    if (body.command !== 'ON' && body.command !== 'OFF') {
      return NextResponse.json(
        { success: false, error: 'command must be "ON" or "OFF"' },
        { status: 400 },
      );
    }

    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishUVCommand(body.command);
    return NextResponse.json({
      success: true,
      data: { command: body.command },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Actuators] uv error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish UV command' },
      { status: 500 },
    );
  }
}
