'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';
import type { Task, TaskTriggerType } from '@/types';

function toMillis(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    return value.toMillis();
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as { seconds?: unknown; _seconds?: unknown };
    if (typeof record.seconds === 'number') {
      return record.seconds * 1000;
    }

    if (typeof record._seconds === 'number') {
      return record._seconds * 1000;
    }
  }

  return 0;
}

function timestampMapToMillis(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, number>
  >((result, [key, timestamp]) => {
    const millis = toMillis(timestamp);
    if (millis > 0) {
      result[key] = millis;
    }
    return result;
  }, {});
}

function mapTask(data: Record<string, unknown>): Task | null {
  const id = typeof data.id === 'string' ? data.id : null;
  if (!id) {
    return null;
  }

  const triggerType: TaskTriggerType =
    data.triggerType === 'uv_complete' ||
    data.triggerType === 'flush_count' ||
    data.triggerType === 'maintenance'
      ? data.triggerType
      : 'manual';

  return {
    id,
    deviceId: typeof data.deviceId === 'string' ? data.deviceId : 'Unknown',
    triggerType,
    message: typeof data.message === 'string' ? data.message : '',
    assignedTo:
      typeof data.assignedTo === 'string' ? data.assignedTo : (null as null),
    assignedToIds: Array.isArray(data.assignedToIds)
      ? data.assignedToIds.filter((id): id is string => typeof id === 'string')
      : [],
    status:
      data.status === 'acknowledged' || data.status === 'completed'
        ? data.status
        : 'pending',
    createdAt: toMillis(data.createdAt),
    acknowledgedAt: data.acknowledgedAt ? toMillis(data.acknowledgedAt) : null,
    completedAt: data.completedAt ? toMillis(data.completedAt) : null,
    acknowledgedBy: timestampMapToMillis(data.acknowledgedBy),
    completedBy: timestampMapToMillis(data.completedBy),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'unknown',
  };
}

interface TasksResponse {
  success: boolean;
  data?: Array<Record<string, unknown>>;
  error?: string;
}

function getDemoTasks(): Task[] {
  const now = Date.now();

  return [
    {
      id: 'demo-task-1',
      deviceId: 'Toilet-01',
      triggerType: 'manual',
      message: 'Check the bowl area after repeated usage.',
      createdAt: now - 5 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      assignedToIds: ['maintenance-personnel'],
      status: 'pending',
      acknowledgedAt: null,
      completedAt: null,
      acknowledgedBy: {},
      completedBy: {},
      createdBy: 'demo-admin',
    },
    {
      id: 'demo-task-2',
      deviceId: 'Toilet-02',
      triggerType: 'uv_complete',
      message: 'UV cycle complete. Manual cleaning required.',
      createdAt: now - 18 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      assignedToIds: ['maintenance-personnel'],
      status: 'acknowledged',
      acknowledgedAt: now - 12 * 60 * 1000,
      completedAt: null,
      acknowledgedBy: { 'maintenance-personnel': now - 12 * 60 * 1000 },
      completedBy: {},
      createdBy: 'system:mqtt',
    },
    {
      id: 'demo-task-3',
      deviceId: 'Toilet-03',
      triggerType: 'maintenance',
      message: 'Deep clean after inspection.',
      createdAt: now - 46 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      assignedToIds: ['maintenance-personnel'],
      status: 'completed',
      acknowledgedAt: now - 39 * 60 * 1000,
      completedAt: now - 14 * 60 * 1000,
      acknowledgedBy: { 'maintenance-personnel': now - 39 * 60 * 1000 },
      completedBy: { 'maintenance-personnel': now - 14 * 60 * 1000 },
      createdBy: 'demo-admin',
    },
  ];
}

interface UseTasksResult {
  tasks: Task[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
}

interface LiveTasksState {
  tasks: Task[];
  error: string | null;
  readyForUserId: string | null;
}

export function useTasks(maxResults?: number): UseTasksResult {
  const { user, loading: authLoading } = useAuth();
  const presentationMode = usePresentationMode();
  const [liveTasksState, setLiveTasksState] = useState<LiveTasksState>({
    tasks: [],
    error: null,
    readyForUserId: null,
  });

  const loadTasks = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      if (presentationMode || authLoading || !user) {
        return;
      }

      try {
        const response = await apiFetch<TasksResponse>('/api/tasks', user);
        if (!response.success) {
          throw new Error(response.error ?? 'Failed to load maintenance tasks');
        }

        const tasks = Array.isArray(response.data)
          ? response.data
              .map(mapTask)
              .filter((task): task is Task => task !== null)
              .sort((left, right) => right.createdAt - left.createdAt)
          : [];

        if (cancelledRef?.cancelled) {
          return;
        }

        setLiveTasksState({
          readyForUserId: user.uid,
          error: null,
          tasks:
            typeof maxResults === 'number' ? tasks.slice(0, maxResults) : tasks,
        });
      } catch (error) {
        if (cancelledRef?.cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load maintenance tasks';
        console.warn('[useTasks] API load failed:', error);
        setLiveTasksState({
          readyForUserId: user.uid,
          error: message,
          tasks: [],
        });
      }
    },
    [authLoading, maxResults, presentationMode, user],
  );

  useEffect(() => {
    if (presentationMode || authLoading || !user) {
      return;
    }

    const cancelledRef = { cancelled: false };

    void loadTasks(cancelledRef);
    const handleRefreshTasks = () => {
      void loadTasks(cancelledRef);
    };
    window.addEventListener('maintenance-tasks:refresh', handleRefreshTasks);
    const intervalId = window.setInterval(() => {
      void loadTasks(cancelledRef);
    }, 10000);

    return () => {
      cancelledRef.cancelled = true;
      window.removeEventListener(
        'maintenance-tasks:refresh',
        handleRefreshTasks,
      );
      window.clearInterval(intervalId);
    };
  }, [authLoading, loadTasks, presentationMode, user]);

  const demoTasks = useMemo(
    () => getDemoTasks().slice(0, maxResults),
    [maxResults],
  );
  const tasks = useMemo(() => {
    if (presentationMode) {
      return demoTasks;
    }

    if (user && liveTasksState.readyForUserId === user.uid) {
      return liveTasksState.tasks;
    }

    return [];
  }, [demoTasks, liveTasksState, presentationMode, user]);
  const loading = presentationMode
    ? false
    : authLoading
      ? true
      : !!user && liveTasksState.readyForUserId !== user.uid;

  const pendingCount = useMemo(
    () => tasks.filter((task) => task.status === 'pending').length,
    [tasks],
  );
  const error = presentationMode ? null : liveTasksState.error;
  const resolvedError = !user || presentationMode ? null : error;

  return {
    tasks,
    pendingCount,
    loading,
    error: resolvedError,
    refreshTasks: async () => {
      await loadTasks();
    },
  };
}
