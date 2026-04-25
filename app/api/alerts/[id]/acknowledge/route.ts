// app/api/alerts/[id]/acknowledge/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/alerts/:id/acknowledge
export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('alerts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Alert not found' },
        { status: 404 },
      );
    }

    await docRef.update({
      acknowledged: true,
      acknowledgedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      data: { id, acknowledged: true },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Alerts] acknowledge error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge alert' },
      { status: 500 },
    );
  }
}
