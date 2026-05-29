import { NextResponse } from 'next/server';
import { getUserProfile, verifyAuthToken } from '@/lib/auth-helpers';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const profile = await getUserProfile(user);

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[AuthMe] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 },
    );
  }
}
