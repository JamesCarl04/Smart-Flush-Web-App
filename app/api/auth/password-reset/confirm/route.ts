import { NextResponse } from 'next/server';

interface PasswordResetConfirmBody {
  oobCode?: unknown;
  newPassword?: unknown;
}

interface FirebaseResetResponse {
  email?: string;
  requestType?: string;
  error?: {
    message?: string;
  };
}

function mapResetError(message: string | undefined): string {
  switch (message) {
    case 'EXPIRED_OOB_CODE':
      return 'This reset link has expired. Request a new password reset email.';
    case 'INVALID_OOB_CODE':
      return 'This reset link is invalid or has already been used.';
    case 'WEAK_PASSWORD':
      return 'Password must be at least 6 characters.';
    default:
      return 'Failed to reset password. Request a new reset link and try again.';
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as PasswordResetConfirmBody;
    const oobCode =
      typeof body.oobCode === 'string' ? body.oobCode.trim() : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!oobCode) {
      return NextResponse.json(
        { success: false, error: 'oobCode is required' },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'password must be at least 8 characters' },
        { status: 400 },
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server misconfiguration: Firebase API key missing',
        },
        { status: 500 },
      );
    }

    const firebaseResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oobCode,
          newPassword,
        }),
      },
    );

    const data = (await firebaseResp.json()) as FirebaseResetResponse;
    if (!firebaseResp.ok) {
      const firebaseMessage = data.error?.message;
      console.warn('[Auth] password reset confirm failed:', firebaseMessage);

      return NextResponse.json(
        { success: false, error: mapResetError(firebaseMessage) },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        email: data.email,
      },
    });
  } catch (error) {
    console.error('[Auth] password reset confirm error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset password' },
      { status: 500 },
    );
  }
}
