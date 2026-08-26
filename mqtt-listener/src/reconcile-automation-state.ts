import { Timestamp } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignedTechnicianIds,
  classifyAutomationRepairs,
  revalidateGuardRepair,
  revalidateTaskRepair,
  revalidateTechnicianRepair,
  type ReconciliationTask,
} from './reconciliation';

const ACTIVE_TASK_STATUSES = [
  'unassigned', 'assigned', 'acknowledged', 'pending', 'rechecking', 'flagged', 'reassignment_needed',
] as const;

function toMillis(value: unknown): number | null {
  return value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function'
    ? value.toMillis()
    : null;
}

function taskFromSnapshot(doc: { id: string; data(): Record<string, unknown> | undefined }): ReconciliationTask {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    status: String(data.status ?? ''),
    completedAtMs: toMillis(data.completedAt),
    assignedTo: typeof data.assignedTo === 'string' ? data.assignedTo : null,
    assignedToIds: assignedTechnicianIds({
      id: doc.id,
      status: String(data.status ?? ''),
      completedAtMs: toMillis(data.completedAt),
      assignedTo: typeof data.assignedTo === 'string' ? data.assignedTo : null,
      assignedToIds: Array.isArray(data.assignedToIds)
        ? data.assignedToIds.filter((uid): uid is string => typeof uid === 'string')
        : [],
    }),
  };
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
  const tasks = tasksSnapshot.docs.map((doc) => taskFromSnapshot(doc));
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

  let appliedCount = 0;
  for (const repair of repairs.taskRepairs) {
    const changed = await adminDb.runTransaction(async (transaction) => {
      const ref = adminDb.collection('tasks').doc(repair.id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const currentRepair = revalidateTaskRepair(taskFromSnapshot(snapshot));
      if (!currentRepair) return false;
      transaction.update(ref, { status: currentRepair.status, updatedAt: Timestamp.now() });
      return true;
    });
    if (changed) appliedCount += 1;
  }
  for (const repair of repairs.technicianRepairs) {
    const changed = await adminDb.runTransaction(async (transaction) => {
      const ref = adminDb.collection('users').doc(repair.id);
      const [technicianSnapshot, activeTasksSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(adminDb.collection('tasks').where('status', 'in', ACTIVE_TASK_STATUSES)),
      ]);
      if (!technicianSnapshot.exists) return false;
      const data = technicianSnapshot.data() ?? {};
      const currentRepair = revalidateTechnicianRepair({
        id: technicianSnapshot.id,
        currentTaskId: typeof data.currentTaskId === 'string' ? data.currentTaskId : null,
        isAvailable: data.isAvailable !== false,
      }, activeTasksSnapshot.docs.map((doc) => taskFromSnapshot(doc)));
      if (!currentRepair) return false;
      transaction.set(ref, {
        currentTaskId: currentRepair.currentTaskId,
        isAvailable: currentRepair.isAvailable,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return true;
    });
    if (changed) appliedCount += 1;
  }
  for (const repair of repairs.guardRepairs) {
    const changed = await adminDb.runTransaction(async (transaction) => {
      const ref = adminDb.collection('automationTaskGuards').doc(repair.id);
      const guardSnapshot = await transaction.get(ref);
      if (!guardSnapshot.exists) return false;
      const data = guardSnapshot.data() ?? {};
      const taskId = typeof data.taskId === 'string' ? data.taskId : null;
      const taskSnapshot = taskId ? await transaction.get(adminDb.collection('tasks').doc(taskId)) : null;
      const currentRepair = revalidateGuardRepair(
        { id: guardSnapshot.id, taskId },
        taskSnapshot?.exists ? taskFromSnapshot(taskSnapshot) : null,
      );
      if (!currentRepair) return false;
      transaction.set(ref, {
        taskId: null,
        ...(currentRepair.clearPending ? { pending: false, pendingAt: null, pendingCycleCount: null } : {}),
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return true;
    });
    if (changed) appliedCount += 1;
  }
  console.log(`Applied ${appliedCount} repair(s) after transactional revalidation.`);
}

void main().catch((error) => {
  console.error('[reconcile-automation-state] failed:', error);
  process.exitCode = 1;
});
