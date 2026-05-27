import type { TaskApiData } from '@/lib/task-types';
import { usesSharedProgress } from '@/lib/task-assignment';

function latestTimestamp(
  timestamps: Record<string, number>,
  userIds: string[],
): number | null {
  const values = userIds
    .map((userId) => timestamps[userId])
    .filter((value): value is number => typeof value === 'number');

  return values.length > 0 ? Math.max(...values) : null;
}

function requiredUserIds(
  task: TaskApiData,
  maintenanceUserIds: string[],
): string[] {
  if (task.assignedToIds.length > 0) {
    return task.assignedToIds;
  }

  if (task.assignedTo) {
    return [task.assignedTo];
  }

  return maintenanceUserIds;
}

export function withDashboardTaskStatus(
  task: TaskApiData,
  maintenanceUserIds: string[],
): TaskApiData {
  const userIds = requiredUserIds(task, maintenanceUserIds);
  if (userIds.length <= 1) {
    return task;
  }

  const allCompleted = userIds.every((userId) => task.completedBy[userId]);
  if (allCompleted) {
    return {
      ...task,
      status: 'completed',
      acknowledgedAt:
        task.acknowledgedAt ??
        latestTimestamp(task.acknowledgedBy, userIds),
      completedAt:
        task.completedAt ?? latestTimestamp(task.completedBy, userIds),
    };
  }

  const allAcknowledged = userIds.every(
    (userId) => task.acknowledgedBy[userId],
  );
  if (allAcknowledged) {
    return {
      ...task,
      status: 'completed',
      acknowledgedAt:
        task.acknowledgedAt ??
        latestTimestamp(task.acknowledgedBy, userIds),
      completedAt:
        task.completedAt ??
        latestTimestamp(task.completedBy, userIds) ??
        latestTimestamp(task.acknowledgedBy, userIds),
    };
  }

  const acknowledgedAt = latestTimestamp(task.acknowledgedBy, userIds);
  if (acknowledgedAt !== null) {
    return {
      ...task,
      status: 'acknowledged',
      acknowledgedAt,
      completedAt: null,
    };
  }

  return {
    ...task,
    status: 'pending',
    acknowledgedAt: null,
    completedAt: null,
  };
}

export function withMaintenanceUserStatus(
  task: TaskApiData,
  userId: string,
): TaskApiData {
  if (!usesSharedProgress(task)) {
    return task;
  }

  const completedAt = task.completedBy[userId] ?? null;
  if (completedAt !== null) {
    return {
      ...task,
      status: 'completed',
      acknowledgedAt: task.acknowledgedBy[userId] ?? task.acknowledgedAt,
      completedAt,
    };
  }

  const acknowledgedAt = task.acknowledgedBy[userId] ?? null;
  if (acknowledgedAt !== null) {
    return {
      ...task,
      status: 'acknowledged',
      acknowledgedAt,
      completedAt: null,
    };
  }

  return {
    ...task,
    status: 'pending',
    acknowledgedAt: null,
    completedAt: null,
  };
}
