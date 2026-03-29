// app/api/actuators/reset/route.ts
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { publishResetCommand } from '@/lib/mqtt-publish';

// POST /api/actuators/reset
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    await publishResetCommand();
    return NextResponse.json({ success: true, data: { command: 'RESET' } });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Actuators] reset error:', error);
    return NextResponse.json({ success: false, error: 'Failed to publish reset command' }, { status: 500 });
  }
}
