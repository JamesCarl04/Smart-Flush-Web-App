import { adminDb } from '@/lib/firebase-admin';

export interface TaskAssignmentShape {
  assignedTo: string | null;
  assignedToIds: string[];
}

export function normalizeAssignedToIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
}

export function normalizeTaskAssignment(
  assignedTo: unknown,
  assignedToIds: unknown,
): TaskAssignmentShape {
  const normalizedIds = normalizeAssignedToIds(assignedToIds);
  if (normalizedIds.length > 0) {
    return {
      assignedTo: normalizedIds.length === 1 ? normalizedIds[0] : null,
      assignedToIds: normalizedIds,
    };
  }

  if (typeof assignedTo === 'string' && assignedTo.trim()) {
    const uid = assignedTo.trim();
    return {
      assignedTo: uid,
      assignedToIds: [uid],
    };
  }

  return {
    assignedTo: null,
    assignedToIds: [],
  };
}

export function isAssignedToUser(
  task: TaskAssignmentShape,
  userId: string,
): boolean {
  if (task.assignedToIds.length > 0) {
    return task.assignedToIds.includes(userId);
  }

  return task.assignedTo === userId || task.assignedTo === null;
}

export function usesSharedProgress(task: TaskAssignmentShape): boolean {
  return task.assignedTo === null || task.assignedToIds.length > 1;
}

export async function listRequiredTaskUserIds(
  task: TaskAssignmentShape,
): Promise<string[]> {
  if (task.assignedToIds.length > 0) {
    return task.assignedToIds;
  }

  if (task.assignedTo) {
    return [task.assignedTo];
  }

  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'maintenance')
    .get();

  return snapshot.docs.map((doc) => doc.id);
}
