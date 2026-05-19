'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { db } from '@/lib/firebase';
import type { Task, TaskTriggerType } from '@/types';

function toMillis(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (value instanceof Timestamp) {
    return value.toMillis();
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

function mapTask(docId: string, data: Record<string, unknown>): Task {
  const triggerType: TaskTriggerType =
    data.triggerType === 'uv_complete' ||
    data.triggerType === 'flush_count' ||
    data.triggerType === 'maintenance'
      ? data.triggerType
      : 'manual';

  return {
    id: typeof data.id === 'string' ? data.id : docId,
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

    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (typeof maxResults === 'number') {
      constraints.push(limit(maxResults));
    }

    const tasksQuery = query(collection(db, 'tasks'), ...constraints);

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setLiveTasksState({
          readyForUserId: user.uid,
          error: null,
          tasks: snapshot.docs.map((taskDoc) =>
            mapTask(
              taskDoc.id,
              taskDoc.data({
                serverTimestamps: 'estimate',
              }) as Record<string, unknown>,
            ),
          ),
        });
      },
      (error) => {
        console.warn('[useTasks] snapshot failed:', error);
        setLiveTasksState({
          readyForUserId: user.uid,
          error: error.message || 'Failed to load maintenance tasks',
          tasks: [],
        });
      },
    );

    return () => unsubscribe();
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
