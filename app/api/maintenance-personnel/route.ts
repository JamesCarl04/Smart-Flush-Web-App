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

    if (role !== 'admin' && role !== 'maintenance' && role !== 'viewer') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const snapshot = await adminDb
      .collection('users')
      .where('role', '==', 'maintenance')
      .get();

    const personnel = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const email = stringOrNull(data.email);
        const displayName =
          stringOrNull(data.displayName) ?? email ?? doc.id;

        return {
          id: doc.id,
          displayName,
          email,
        };
      })
      .sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );

    return NextResponse.json({ success: true, data: personnel });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[MaintenancePersonnel] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch maintenance personnel' },
      { status: 500 },
    );
  }
}
