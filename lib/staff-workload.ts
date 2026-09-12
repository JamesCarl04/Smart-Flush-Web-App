export interface StaffUserLike {
  id?: string;
  uid?: string;
  email?: string | null;
  currentTaskId?: string | null;
  active?: boolean | null;
  isActive?: boolean | null;
  status?: string | null;
  isOnline?: boolean | null;
  isAvailable?: boolean | null;
  lastSeen?: unknown;
  [key: string]: unknown;
}

export interface ActiveTaskLike {
  id: string;
  status?: string | null;
  completedAt?: unknown;
  assignedTo?: string | null;
  assignedToIds?: string[] | null;
  acknowledgedBy?: Record<string, unknown> | null;
  recheckedBy?: string | null;
  location?: string | null;
  restroomName?: string | null;
  message?: string | null;
  triggerType?: string | null;
  [key: string]: unknown;
}

export interface ActiveTaskSummary {
  id: string;
  location: string | null;
  message: string;
  status: string;
  triggerType: string;
}

export interface StaffOperationalStatus {
  currentTaskId: string | null;
  activeTask: ActiveTaskSummary | null;
  isAvailable: boolean;
  isOnline: boolean;
  status: 'available' | 'on_task' | 'offline';
}

export const PRESENCE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export function extractTimestampMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toMillis?: () => unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => unknown }).toMillis();
    if (typeof millis === 'number' && Number.isFinite(millis)) return millis;
  }
  if (typeof (value as { _seconds?: unknown })._seconds === 'number') {
    const seconds = (value as { _seconds: number })._seconds;
    const nanoseconds = typeof (value as { _nanoseconds?: unknown })._nanoseconds === 'number'
      ? (value as { _nanoseconds: number })._nanoseconds
      : 0;
    return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function isTaskActive(task: ActiveTaskLike): boolean {
  if (task.status === 'completed') {
    return false;
  }
  if (task.completedAt != null) {
    return false;
  }
  return true;
}

/**
 * Resolves staff operational status mirroring mobile app's getPersonOperationalStatus.
 * Validates user.currentTaskId against actual active tasks and discards stale IDs.
 * Matches active tasks across assignedTo (UID/email), assignedToIds, acknowledgedBy, and recheckedBy.
 */
export function resolveStaffOperationalStatus(
  user: StaffUserLike,
  activeTasks: ActiveTaskLike[],
): StaffOperationalStatus {
  // Support both raw DocumentSnapshot or plain user objects
  const rawData =
    typeof (user as { data?: unknown }).data === 'function'
      ? ((user as { data: () => Record<string, unknown> }).data() ?? {})
      : user;

  const uid = String(rawData.uid || rawData.id || user.uid || user.id || '').trim();
  const rawEmail = typeof rawData.email === 'string' ? rawData.email : (typeof user.email === 'string' ? user.email : null);
  const userEmail = rawEmail && rawEmail.trim() ? rawEmail.trim().toLowerCase() : null;

  const currentTaskIdRaw =
    typeof rawData.currentTaskId === 'string'
      ? rawData.currentTaskId.trim()
      : typeof user.currentTaskId === 'string'
        ? user.currentTaskId.trim()
        : null;
  const userCurrentTaskId = currentTaskIdRaw || null;

  let activeMatchingTask: ActiveTaskLike | null = null;

  if (userCurrentTaskId) {
    activeMatchingTask =
      activeTasks.find((task) => isTaskActive(task) && task.id === userCurrentTaskId) ?? null;
  }

  if (!activeMatchingTask) {
    activeMatchingTask =
      activeTasks.find((task) => {
        if (!isTaskActive(task)) {
          return false;
        }

        // 2. Direct assignedTo (UID or case-insensitive email)
        if (typeof task.assignedTo === 'string' && task.assignedTo.trim()) {
          const assigned = task.assignedTo.trim();
          if (assigned === uid || (userEmail && assigned.toLowerCase() === userEmail)) {
            return true;
          }
        }

        // 3. Multi-assignee assignedToIds (UID or case-insensitive email)
        if (Array.isArray(task.assignedToIds)) {
          const matchesId = task.assignedToIds.some((item) => {
            if (typeof item !== 'string') return false;
            const trimmed = item.trim();
            return trimmed === uid || (userEmail && trimmed.toLowerCase() === userEmail);
          });
          if (matchesId) {
            return true;
          }
        }

        // 4. Acknowledged by keys (UID or case-insensitive email)
        if (task.acknowledgedBy && typeof task.acknowledgedBy === 'object') {
          const matchesAck = Object.keys(task.acknowledgedBy).some((key) => {
            const trimmed = key.trim();
            return trimmed === uid || (userEmail && trimmed.toLowerCase() === userEmail);
          });
          if (matchesAck) {
            return true;
          }
        }

        // 5. Rechecked by (UID or case-insensitive email)
        if (typeof task.recheckedBy === 'string' && task.recheckedBy.trim()) {
          const recheck = task.recheckedBy.trim();
          if (recheck === uid || (userEmail && recheck.toLowerCase() === userEmail)) {
            return true;
          }
        }

        return false;
      }) ?? null;
  }

  const isActive = rawData.active !== false && rawData.isActive !== false;
  const isExplicitlyOffline =
    rawData.active === false ||
    rawData.isActive === false ||
    rawData.isOnline === false ||
    rawData.status === 'offline' ||
    rawData.status === 'inactive';

  let isOnline = false;
  if (isActive && !isExplicitlyOffline) {
    const lastSeenMillis = extractTimestampMillis(rawData.lastSeen);
    if (lastSeenMillis !== null) {
      isOnline = Date.now() - lastSeenMillis <= PRESENCE_TIMEOUT_MS;
    }
  }

  if (activeMatchingTask !== null) {
    const location =
      (typeof activeMatchingTask.location === 'string' && activeMatchingTask.location.trim()) ||
      (typeof activeMatchingTask.restroomName === 'string' && activeMatchingTask.restroomName.trim()) ||
      null;

    const summary: ActiveTaskSummary = {
      id: activeMatchingTask.id,
      location,
      message: typeof activeMatchingTask.message === 'string' ? activeMatchingTask.message : '',
      status: String(activeMatchingTask.status ?? 'assigned'),
      triggerType: typeof activeMatchingTask.triggerType === 'string' ? activeMatchingTask.triggerType : 'manual',
    };

    return {
      currentTaskId: activeMatchingTask.id,
      activeTask: summary,
      isAvailable: false,
      isOnline,
      status: 'on_task',
    };
  }

  // No active task found — check offline / inactive flags
  if (!isActive || !isOnline) {
    return {
      currentTaskId: null,
      activeTask: null,
      isAvailable: false,
      isOnline: false,
      status: 'offline',
    };
  }

  return {
    currentTaskId: null,
    activeTask: null,
    isAvailable: true,
    isOnline: true,
    status: 'available',
  };
}
