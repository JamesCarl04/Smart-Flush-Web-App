import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  createRateLimitResponse,
} from '@/lib/rate-limit';

interface PasswordResetRequestBody {
  email?: unknown;
}

interface FirebaseOobResponse {
  email?: string;
  error?: {
    message?: string;
  };
}

function getResetContinueUrl(request: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = configuredUrl || new URL(request.url).origin;

  return new URL('/auth/reset-password', origin).toString();
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // 1. IP-based Rate Limiting (prevents IP spamming / DDoS)
    const clientIp = getClientIp(request);
    const ipRateLimit = checkRateLimit(
      `pwd-reset-ip:${clientIp}`,
      RATE_LIMITS.passwordReset,
    );
    if (!ipRateLimit.success) {
      return createRateLimitResponse(ipRateLimit.retryAfter || 60);
    }

    const body = (await request.json()) as PasswordResetRequestBody;
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'email is required' },
        { status: 400 },
      );
    }

    // 2. Email-based Rate Limiting (prevents inbox flooding to a single address)
    const emailRateLimit = checkRateLimit(
      `pwd-reset-email:${email}`,
      RATE_LIMITS.passwordReset,
    );
    if (!emailRateLimit.success) {
      return createRateLimitResponse(emailRateLimit.retryAfter || 60);
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
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
          continueUrl: getResetContinueUrl(request),
          canHandleCodeInApp: false,
        }),
      },
    );

    const data = (await firebaseResp.json()) as FirebaseOobResponse;
    if (!firebaseResp.ok) {
      const firebaseMessage = data.error?.message ?? 'PASSWORD_RESET_FAILED';
      const status = firebaseMessage === 'EMAIL_NOT_FOUND' ? 200 : 400;

      if (status !== 200) {
        console.warn('[Auth] password reset request failed:', firebaseMessage);
      }

      return NextResponse.json(
        {
          success: status === 200,
          error:
            status === 200
              ? undefined
              : 'Failed to send password reset email',
        },
        { status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Auth] password reset request error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send password reset email' },
      { status: 500 },
    );
  }
}
