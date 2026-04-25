// app/api/actuators/lid/close/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { ensureDeviceConnected } from '@/lib/device-connection';
import { publishLidCommand } from '@/lib/mqtt-publish';

// POST /api/actuators/lid/close
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    await ensureDeviceConnected(DEFAULT_DEVICE_ID);
    await publishLidCommand('CLOSE');
    return NextResponse.json({ success: true, data: { command: 'CLOSE' } });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Actuators] lid/close error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish lid CLOSE command' },
      { status: 500 },
    );
  }
}
