// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { validatePassword } from '@/lib/password-validator';
import { verifyAuthToken, requireAdmin } from '@/lib/auth-helpers';

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
  role?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // 1. Authorization: Lock down endpoint to authenticated administrators only
    const user = await verifyAuthToken(request);
    await requireAdmin(user);

    // 2. Rate limiting to prevent abuse
    const clientIp = getClientIp(request);
    const rateLimitCheck = checkRateLimit(clientIp, RATE_LIMITS.register);
    
    if (!rateLimitCheck.success) {
      return createRateLimitResponse(rateLimitCheck.retryAfter || 60);
    }

    const body = (await request.json()) as Partial<RegisterBody>;
    const { email, password, displayName, role } = body;

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

    // Password validation (12 chars minimum + HIBP check)
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

    const assignedRole = role && ['admin', 'supervisor', 'maintenance', 'technician', 'viewer', 'user'].includes(role)
      ? role
      : 'user';

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    try {
      // Create Firestore users doc
      await adminDb.collection('users').doc(userRecord.uid).set({
        id: userRecord.uid,
        email,
        displayName,
        role: assignedRole,
        active: true,
        isActive: true,
        isAvailable: true,
        isOnline: false,
        status: 'offline',
        currentTaskId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      await adminAuth.deleteUser(userRecord.uid).catch((delErr) => {
        console.warn('[Auth] Could not delete orphaned Auth user after Firestore failure:', delErr);
      });
      throw firestoreError;
    }

    return NextResponse.json(
      { success: true, uid: userRecord.uid },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    const errCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;

    if (errCode === 'auth/email-already-exists') {
      return NextResponse.json(
        { success: false, error: 'A user with this email address already exists' },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error ? error.message : 'Registration failed';
    console.error('[Auth] register error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
