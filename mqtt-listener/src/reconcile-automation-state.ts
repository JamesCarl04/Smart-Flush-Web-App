import { Timestamp } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { classifyAutomationRepairs } from './reconciliation';

function toMillis(value: unknown): number | null {
  return value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function'
    ? value.toMillis()
    : null;
}

async function main(): Promise<void> {
  for (const envPath of [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env.local')]) {
    if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); break; }
  }
  const { adminDb } = await import('./firebase-admin');
  const apply = process.argv.includes('--apply');
  const [tasksSnapshot, techniciansSnapshot, guardsSnapshot] = await Promise.all([
    adminDb.collection('tasks').get(),
    adminDb.collection('users').where('role', '==', 'maintenance').get(),
    adminDb.collection('automationTaskGuards').get(),
  ]);
  const tasks = tasksSnapshot.docs.map((doc) => {
    const data = doc.data();
    const ids = Array.isArray(data.assignedToIds)
      ? data.assignedToIds.filter((uid): uid is string => typeof uid === 'string')
      : typeof data.assignedTo === 'string' && data.assignedTo ? [data.assignedTo] : [];
    return { id: doc.id, status: String(data.status ?? ''), completedAtMs: toMillis(data.completedAt), assignedToIds: ids };
  });
  const technicians = techniciansSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      currentTaskId: typeof data.currentTaskId === 'string' ? data.currentTaskId : null,
      isAvailable: data.isAvailable !== false,
    };
  });
  const guards = guardsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, taskId: typeof data.taskId === 'string' ? data.taskId : null };
  });
  const repairs = classifyAutomationRepairs({ tasks, technicians, guards });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...repairs }, null, 2));
  if (!apply) return;

  const writer = adminDb.bulkWriter();
  const now = Timestamp.now();
  for (const repair of repairs.taskRepairs) {
    writer.update(adminDb.collection('tasks').doc(repair.id), { status: repair.status, updatedAt: now });
  }
  for (const repair of repairs.technicianRepairs) {
    writer.set(adminDb.collection('users').doc(repair.id), {
      currentTaskId: repair.currentTaskId,
      isAvailable: repair.isAvailable,
      updatedAt: now,
    }, { merge: true });
  }
  for (const repair of repairs.guardRepairs) {
    writer.set(adminDb.collection('automationTaskGuards').doc(repair.id), {
      taskId: null,
      ...(repair.clearPending ? { pending: false, pendingAt: null, pendingCycleCount: null } : {}),
      updatedAt: now,
    }, { merge: true });
  }
  await writer.close();
  console.log(`Applied ${repairs.taskRepairs.length + repairs.technicianRepairs.length + repairs.guardRepairs.length} repair(s).`);
}

void main().catch((error) => {
  console.error('[reconcile-automation-state] failed:', error);
  process.exitCode = 1;
});
