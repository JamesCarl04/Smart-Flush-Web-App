'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    photos: Array.isArray(data.photos) ? data.photos.map(String) : [],
    component: typeof data.component === 'string' ? data.component : null,
    location: typeof data.location === 'string' ? data.location : null,
    floor: typeof data.floor === 'string' ? data.floor : null,
    building: typeof data.building === 'string' ? data.building : null,
    shift: typeof data.shift === 'string' ? data.shift : null,
    remarks: typeof data.remarks === 'string' ? data.remarks : null,
    flagged: typeof data.flagged === 'boolean' ? data.flagged : false,
    biometricVerified: typeof data.biometricVerified === 'boolean' ? data.biometricVerified : false,
    offlineSynced: typeof data.offlineSynced === 'boolean' ? data.offlineSynced : false,
    checklist: (Array.isArray(data.checklist) || (data.checklist && typeof data.checklist === 'object')) ? (data.checklist as any) : null,
    assignedAt: data.assignedAt ? toMillis(data.assignedAt) : null,
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
      photos: [
        'https://images.unsplash.com/photo-1620626011160-9928f1b9b630?q=80&w=600&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop',
      ],
      component: 'General',
      location: 'Restroom 1',
      floor: 'Ground Floor',
      building: 'GB3',
      shift: 'Morning',
      remarks: 'Deep cleaned bowl and floor drains. Replaced air freshener cartridge and soap refill. Verified valve flush pressure.',
      flagged: true,
      biometricVerified: true,
      offlineSynced: true,
      checklist: {
        '01': true,
        '02': true,
        '03': true,
        '04': true,
        '05': true,
        '06': true,
        '07': true,
        '08': true,
        '09': true,
        '10': true,
      },
      assignedAt: now - 45 * 60 * 1000,
    },
    {
      id: 'demo-task-4',
      deviceId: 'Toilet-04',
      triggerType: 'flush_count',
      message: 'Valve inspection due to high flush count.',
      createdAt: now - 120 * 60 * 1000,
      assignedTo: 'maintenance-personnel',
      assignedToIds: ['maintenance-personnel'],
      status: 'completed',
      acknowledgedAt: now - 110 * 60 * 1000,
      completedAt: now - 85 * 60 * 1000,
      acknowledgedBy: { 'maintenance-personnel': now - 110 * 60 * 1000 },
      completedBy: { 'maintenance-personnel': now - 85 * 60 * 1000 },
      createdBy: 'system:mqtt',
      photos: [],
      component: 'Valve',
      location: 'Restroom 2',
      floor: '2nd Floor',
      building: 'Main Bldg',
      shift: 'Afternoon',
      remarks: 'Valve clean-up completed, but no camera feed was active to capture photos.',
      flagged: false,
      biometricVerified: false,
      offlineSynced: false,
      checklist: {
        '01': true,
        '02': false,
        '03': true,
        '04': true,
        '05': false,
        '06': true,
        '07': true,
      },
      assignedAt: now - 118 * 60 * 1000,
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

  useEffect(() => {
    if (presentationMode || authLoading || !user) {
      return;
    }

    const q = query(collection(db, 'tasks'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let mappedTasks = snapshot.docs
          .map((doc) => mapTask({ id: doc.id, ...doc.data() }))
          .filter((task): task is Task => task !== null)
          .sort((left, right) => right.createdAt - left.createdAt);

        if (typeof maxResults === 'number') {
          mappedTasks = mappedTasks.slice(0, maxResults);
        }

        setLiveTasksState({
          readyForUserId: user.uid,
          error: null,
          tasks: mappedTasks,
        });
      },
      (error) => {
        console.warn('[useTasks] Firestore onSnapshot failed:', error);
        setLiveTasksState({
          readyForUserId: user.uid,
          error: error.message,
          tasks: [],
        });
      }
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

  return {
    tasks,
    pendingCount,
    loading,
    error: resolvedError,
    refreshTasks: async () => {
      // Real-time onSnapshot handles updates automatically
    },
  };
}
