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

  return task.assignedTo === userId;
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

export interface AvailableTechnician {
  id: string;
  displayName: string;
  email: string | null;
  shift?: string | null;
  workload: number;
  lastAutoAssignedAt: number | null;
}

export function selectLeastRecentlyAssignedTechnician(
  technicians: AvailableTechnician[],
): AvailableTechnician | null {
  return [...technicians].sort(
    (left, right) =>
      (left.lastAutoAssignedAt ?? 0) - (right.lastAutoAssignedAt ?? 0) ||
      left.workload - right.workload ||
      left.displayName.localeCompare(right.displayName),
  )[0] ?? null;
}

/**
 * Finds all on-duty, active maintenance personnel who do NOT have an active uncompleted work order.
 */
export async function findAvailableMaintenancePersonnel(): Promise<AvailableTechnician[]> {
  try {
    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      adminDb.collection('users').where('role', '==', 'maintenance').get(),
      adminDb
        .collection('tasks')
        .where('status', 'in', [
          'unassigned',
          'assigned',
          'acknowledged',
          'pending',
          'rechecking',
          'flagged',
          'reassignment_needed',
        ])
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const activeTaskByPerson = new Set<string>();
    for (const doc of activeTasksSnapshot.docs) {
      const data = doc.data();
      if (data.completedAt != null) continue;
      const assignedTo =
        typeof data.assignedTo === 'string' ? data.assignedTo.trim() : null;
      if (assignedTo) {
        activeTaskByPerson.add(assignedTo);
      }
      if (Array.isArray(data.assignedToIds)) {
        for (const pid of data.assignedToIds) {
          if (typeof pid === 'string' && pid.trim()) {
            activeTaskByPerson.add(pid.trim());
          }
        }
      }
    }

    const available: AvailableTechnician[] = [];
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const isOnline = data.isOnline !== false && data.status !== 'offline' && data.status !== 'inactive';
      const isAvailable = data.isActive !== false && data.isAvailable !== false && !activeTaskByPerson.has(doc.id) && isOnline;

      if (isAvailable) {
        const email = typeof data.email === 'string' ? data.email.trim() : null;
        const displayName =
          (typeof data.displayName === 'string' && data.displayName.trim()) ||
          (typeof data.name === 'string' && data.name.trim()) ||
          email ||
          doc.id;

        available.push({
          id: doc.id,
          displayName,
          email,
          shift: typeof data.shift === 'string' ? data.shift : null,
          workload: 0,
          lastAutoAssignedAt: data.lastAutoAssignedAt && typeof data.lastAutoAssignedAt.toMillis === 'function'
            ? data.lastAutoAssignedAt.toMillis()
            : null,
        });
      }
    }

    return available.sort((left, right) => {
      const selected = selectLeastRecentlyAssignedTechnician([left, right]);
      return selected?.id === left.id ? -1 : 1;
    });
  } catch (err) {
    console.error('[task-assignment] findAvailableMaintenancePersonnel error:', err);
    return [];
  }
}

