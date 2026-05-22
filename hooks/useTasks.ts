'use client';

import { useEffect, useMemo, useState } from 'react';
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
    status:
      data.status === 'acknowledged' || data.status === 'completed'
        ? data.status
        : 'pending',
    createdAt: toMillis(data.createdAt),
    acknowledgedAt: data.acknowledgedAt ? toMillis(data.acknowledgedAt) : null,
    completedAt: data.completedAt ? toMillis(data.completedAt) : null,
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
      status: 'pending',
      acknowledgedAt: null,
      completedAt: null,
      createdBy: 'demo-admin',
    },
    {
      id: 'demo-task-2',
      deviceId: 'Toilet-02',
      triggerType: 'uv_complete',
      message: 'UV cycle complete. Manual cleaning required.',
      createdAt: now - 18 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      status: 'acknowledged',
      acknowledgedAt: now - 12 * 60 * 1000,
      completedAt: null,
      createdBy: 'system:mqtt',
    },
    {
      id: 'demo-task-3',
      deviceId: 'Toilet-03',
      triggerType: 'maintenance',
      message: 'Deep clean after inspection.',
      createdAt: now - 46 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      status: 'completed',
      acknowledgedAt: now - 39 * 60 * 1000,
      completedAt: now - 14 * 60 * 1000,
      createdBy: 'demo-admin',
    },
  ];
}

interface UseTasksResult {
  tasks: Task[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
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

  useEffect(() => {
    if (presentationMode || authLoading || !user) {
      return;
    }

    let cancelled = false;

    const loadTasks = async () => {
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

        if (cancelled) {
          return;
        }

        setLiveTasksState({
          readyForUserId: user.uid,
          error: null,
          tasks:
            typeof maxResults === 'number' ? tasks.slice(0, maxResults) : tasks,
        });
      } catch (error) {
        if (cancelled) {
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
    };

    void loadTasks();
    const intervalId = window.setInterval(() => {
      void loadTasks();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authLoading, maxResults, presentationMode, user]);

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

  return { tasks, pendingCount, loading, error: resolvedError };
}
