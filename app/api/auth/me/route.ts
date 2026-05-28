import { NextResponse } from 'next/server';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminDb } from '@/lib/firebase-admin';

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);
    const profile = await adminDb.collection('users').doc(user.uid).get();
    const data = profile.data() ?? {};

    return NextResponse.json({
      success: true,
      data: {
        id: user.uid,
        email: stringOrNull(data.email) ?? user.email ?? null,
        displayName: stringOrNull(data.displayName) ?? user.name ?? null,
        role,
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
