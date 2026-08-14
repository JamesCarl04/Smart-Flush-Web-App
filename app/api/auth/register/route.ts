// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { validatePassword } from '@/lib/password-validator';

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // CRITICAL FIX: Rate limiting to prevent brute force registration
    const clientIp = getClientIp(request);
    const rateLimitCheck = checkRateLimit(clientIp, RATE_LIMITS.register);
    
    if (!rateLimitCheck.success) {
      return createRateLimitResponse(rateLimitCheck.retryAfter || 60);
    }

    const body = (await request.json()) as Partial<RegisterBody>;
    const { email, password, displayName } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'email is required' },
        { status: 400 },
      );
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'password is required' },
        { status: 400 },
      );
    }
    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'displayName is required' },
        { status: 400 },
      );
    }

    // HIGH FIX: Improved password validation (was: only 8 chars minimum)
    // Now: 12 chars minimum + HIBP check (compromised password detection)
    const passwordValidation = await validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: passwordValidation.errors[0] },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 },
      );
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    // Create Firestore users doc
    await adminDb.collection('users').doc(userRecord.uid).set({
      id: userRecord.uid,
      email,
      displayName,
      role: 'user' as const,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { success: true, uid: userRecord.uid },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Registration failed';
    console.error('[Auth] register error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
