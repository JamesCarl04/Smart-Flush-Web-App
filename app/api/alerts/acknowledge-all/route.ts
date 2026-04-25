// app/api/alerts/acknowledge-all/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { FieldValue } from 'firebase-admin/firestore';

// POST /api/alerts/acknowledge-all — bulk acknowledge all unacknowledged alerts
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);

    const snap = await adminDb
      .collection('alerts')
      .where('acknowledged', '==', false)
      .get();

    if (snap.empty) {
      return NextResponse.json({ success: true, data: { acknowledged: 0 } });
    }

    // Firestore allows max 500 writes per batch
    const BATCH_SIZE = 500;
    let totalAcknowledged = 0;

    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = snap.docs.slice(i, i + BATCH_SIZE);

      for (const doc of chunk) {
        batch.update(doc.ref, {
          acknowledged: true,
          acknowledgedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      totalAcknowledged += chunk.length;
    }

    return NextResponse.json({
      success: true,
      data: { acknowledged: totalAcknowledged },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Alerts] acknowledge-all error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge all alerts' },
      { status: 500 },
    );
  }
}
