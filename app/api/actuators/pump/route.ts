// app/api/actuators/pump/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishPumpCommand } from '@/lib/mqtt-publish';

interface PumpBody {
  command: 'ON' | 'OFF';
}

// POST /api/actuators/pump
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const body = (await request.json()) as Partial<PumpBody>;
    if (body.command !== 'ON' && body.command !== 'OFF') {
      return NextResponse.json(
        { success: false, error: 'command must be "ON" or "OFF"' },
        { status: 400 },
      );
    }

    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishPumpCommand(body.command);
    return NextResponse.json({
      success: true,
      data: { command: body.command },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Actuators] pump error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish pump command' },
      { status: 500 },
    );
  }
}
