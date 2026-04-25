// app/api/auth/login/route.ts
// POST /api/auth/login — exchanges email+password for a Firebase ID token
// The token can then be used in the Authorization header for all other routes.
import { NextResponse } from 'next/server';

interface LoginBody {
  email: string;
  password: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<LoginBody>;
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'email and password are required' },
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

    // Call Firebase Identity Toolkit from the server side (bypasses API key restrictions)
    const firebaseResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );

    const data = (await firebaseResp.json()) as {
      idToken?: string;
      email?: string;
      displayName?: string;
      expiresIn?: string;
      error?: { message: string };
    };

    if (!firebaseResp.ok || !data.idToken) {
      const msg = data.error?.message ?? 'Invalid email or password';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: {
        token: data.idToken,
        email: data.email,
        displayName: data.displayName,
        expiresIn: data.expiresIn, // seconds (3600 = 1 hour)
      },
    });
  } catch (error) {
    console.error('[Auth] login error:', error);
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 },
    );
  }
}
