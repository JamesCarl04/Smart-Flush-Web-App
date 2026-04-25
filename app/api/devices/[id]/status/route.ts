// app/api/devices/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { getDeviceConnectionState } from '@/lib/device-connection';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/devices/:id/status
export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const data = await getDeviceConnectionState(id);
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Devices] GET/:id/status error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch status',
      },
      { status: 500 },
    );
  }
}
