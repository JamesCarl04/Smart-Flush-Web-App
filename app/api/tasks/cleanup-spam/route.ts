import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (role !== 'admin' && role !== 'supervisor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: admin or supervisor only' },
        { status: 403 },
      );
    }

    const tasksRef = adminDb.collection('tasks');
    
    // Query spam tasks created by legacy UV complete trigger
    const snapshot = await tasksRef
      .where('triggerType', '==', 'uv_complete')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No spam UV tasks found to clean up.',
      });
    }

    const BATCH_SIZE = 400;
    const docs = snapshot.docs;
    let count = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
        count++;
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      deletedCount: count,
      message: `Successfully purged ${count} legacy UV spam tasks from Firestore.`,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    console.error('[CleanupSpam] Error purging spam tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clean up spam tasks' },
      { status: 500 },
    );
  }
}
