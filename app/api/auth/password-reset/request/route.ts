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

function mapRequestError(message: string | undefined): string {
  if (!message) return 'Failed to send password reset email. Please try again.';

  if (message.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return 'Too many reset attempts. Please wait a few minutes before trying again.';
  }
  if (message.includes('INVALID_EMAIL')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('OPERATION_NOT_ALLOWED')) {
    return 'Password reset is currently disabled. Please contact an administrator.';
  }
  if (message.includes('UNAUTHORIZED_DOMAIN')) {
    return 'The domain is not authorized in Firebase Authentication settings.';
  }
  if (
    message.includes('API_KEY_INVALID') ||
    message.includes('API_KEY_EXPIRED')
  ) {
    return 'Authentication service configuration error. Please contact support.';
  }
  return 'Failed to send password reset email. Please try again later.';
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

    let firebaseResp = await fetch(
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

    let data = (await firebaseResp.json()) as FirebaseOobResponse;

    // Fallback: If continueUrl domain is not allowlisted in Firebase console, retry without continueUrl
    if (
      !firebaseResp.ok &&
      data.error?.message?.includes('UNAUTHORIZED_DOMAIN')
    ) {
      console.warn(
        '[Auth] continueUrl domain unauthorized, falling back to default reset email',
      );
      firebaseResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'PASSWORD_RESET',
            email,
          }),
        },
      );
      data = (await firebaseResp.json()) as FirebaseOobResponse;
    }

    if (!firebaseResp.ok) {
      const firebaseMessage = data.error?.message ?? 'PASSWORD_RESET_FAILED';
      const status = firebaseMessage.includes('EMAIL_NOT_FOUND') ? 200 : 400;

      if (status !== 200) {
        console.warn('[Auth] password reset request failed:', firebaseMessage);
      }

      return NextResponse.json(
        {
          success: status === 200,
          error:
            status === 200 ? undefined : mapRequestError(firebaseMessage),
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
