'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { db } from '@/lib/firebase';
import type { Task } from '@/types';

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
  return {
    id: typeof data.id === 'string' ? data.id : docId,
    toiletId: typeof data.toiletId === 'string' ? data.toiletId : 'Unknown',
    triggeredBy: 'admin',
    triggeredAt: toMillis(data.triggeredAt),
    assignedTo:
      typeof data.assignedTo === 'string' ? data.assignedTo : (null as null),
    status:
      data.status === 'acknowledged' || data.status === 'completed'
        ? data.status
        : 'pending',
    note: typeof data.note === 'string' ? data.note : null,
    acknowledgedAt: data.acknowledgedAt ? toMillis(data.acknowledgedAt) : null,
    completedAt: data.completedAt ? toMillis(data.completedAt) : null,
  };
}

function getDemoTasks(): Task[] {
  const now = Date.now();

  return [
    {
      id: 'demo-task-1',
      toiletId: 'Toilet-01',
      triggeredBy: 'admin',
      triggeredAt: now - 5 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      status: 'pending',
      note: 'Check the bowl area after repeated usage.',
      acknowledgedAt: null,
      completedAt: null,
    },
    {
      id: 'demo-task-2',
      toiletId: 'Toilet-02',
      triggeredBy: 'admin',
      triggeredAt: now - 18 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      status: 'acknowledged',
      note: null,
      acknowledgedAt: now - 12 * 60 * 1000,
      completedAt: null,
    },
    {
      id: 'demo-task-3',
      toiletId: 'Toilet-03',
      triggeredBy: 'admin',
      triggeredAt: now - 46 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      status: 'completed',
      note: 'Deep clean after inspection.',
      acknowledgedAt: now - 39 * 60 * 1000,
      completedAt: now - 14 * 60 * 1000,
    },
  ];
}

interface UseTasksResult {
  tasks: Task[];
  pendingCount: number;
  loading: boolean;
}

interface LiveTasksState {
  tasks: Task[];
  readyForUserId: string | null;
}

export function useTasks(maxResults = 10): UseTasksResult {
  const { user, loading: authLoading } = useAuth();
  const presentationMode = usePresentationMode();
  const [liveTasksState, setLiveTasksState] = useState<LiveTasksState>({
    tasks: [],
    readyForUserId: null,
  });

  useEffect(() => {
    if (presentationMode || authLoading || !user) {
      return;
    }

    const tasksQuery = query(
      collection(db, 'tasks'),
      orderBy('triggeredAt', 'desc'),
      limit(maxResults),
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setLiveTasksState({
          readyForUserId: user.uid,
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

  return { tasks, pendingCount, loading };
}
