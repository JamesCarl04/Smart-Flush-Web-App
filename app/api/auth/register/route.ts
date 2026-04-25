// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<RegisterBody>;
    const { email, password, displayName } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'email is required' },
        { status: 400 },
      );
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'password must be at least 8 characters' },
        { status: 400 },
      );
    }
    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'displayName is required' },
        { status: 400 },
      );
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    // Create Firestore users doc (no role field per README fix)
    await adminDb.collection('users').doc(userRecord.uid).set({
      id: userRecord.uid,
      email,
      displayName,
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
