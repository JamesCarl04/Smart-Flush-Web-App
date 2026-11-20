'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { apiFetch } from '@/lib/api-client';
import type { Task, TaskStatus, TaskTriggerType } from '@/types';

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

  const validTriggers: readonly TaskTriggerType[] = [
    'manual',
    'uv_complete',
    'flush_count',
    'maintenance',
    'hardware_failure',
    'sensor_fault',
    'water_overuse',
    'water_no_flow',
    'student_report',
  ];
  const triggerType: TaskTriggerType =
    typeof data.triggerType === 'string' &&
    validTriggers.includes(data.triggerType as TaskTriggerType)
      ? (data.triggerType as TaskTriggerType)
      : 'manual';

  const validStatuses: readonly TaskStatus[] = [
    'pending',
    'unassigned',
    'assigned',
    'acknowledged',
    'completed',
    'flagged',
    'rechecking',
    'reassignment_needed',
  ];

  let status: TaskStatus = 'pending';
  if (data.status === 'rechecking') {
    status = 'rechecking';
  } else if (data.inspectionStatus === 'flagged' || data.status === 'flagged') {
    status = 'flagged';
  } else if (
    typeof data.status === 'string' &&
    validStatuses.includes(data.status as TaskStatus)
  ) {
    status = data.status as TaskStatus;
  }

  return {
    id,
    deviceId: typeof data.deviceId === 'string' ? data.deviceId : 'Unknown',
    deviceLabel:
      typeof data.deviceLabel === 'string' ? data.deviceLabel : undefined,
    triggerType,
    message: typeof data.message === 'string' ? data.message : '',
    assignedTo:
      typeof data.assignedTo === 'string' ? data.assignedTo : (null as null),
    assignedToIds: Array.isArray(data.assignedToIds)
      ? data.assignedToIds.filter((item): item is string => typeof item === 'string')
      : [],
    assignedToNames:
      data.assignedToNames && typeof data.assignedToNames === 'object'
        ? (data.assignedToNames as Record<string, string>)
        : undefined,
    isBroadcast:
      typeof data.isBroadcast === 'boolean' ? data.isBroadcast : undefined,
    assignmentType:
      data.assignmentType === 'broadcast' ||
      data.assignmentType === 'individual' ||
      data.assignmentType === 'team'
        ? data.assignmentType
        : undefined,
    assignmentSource:
      data.assignmentSource === 'initial_auto' ||
      data.assignmentSource === 'supervisor' ||
      data.assignmentSource === 'retry_auto'
        ? data.assignmentSource
        : undefined,
    requiresSupervisorAssignment:
      typeof data.requiresSupervisorAssignment === 'boolean'
        ? data.requiresSupervisorAssignment
        : undefined,
    autoAssignmentEligibleAt: data.autoAssignmentEligibleAt
      ? toMillis(data.autoAssignmentEligibleAt)
      : null,
    automationRuleId:
      typeof data.automationRuleId === 'string'
        ? data.automationRuleId
        : undefined,
    automationTrigger:
      data.automationTrigger === 'ultrasonic_sensor_fault' ||
      data.automationTrigger === 'water_overuse' ||
      data.automationTrigger === 'no_water_after_flush' ||
      data.automationTrigger === 'maintenance_due'
        ? data.automationTrigger
        : undefined,
    cycleCountAtTrigger:
      typeof data.cycleCountAtTrigger === 'number'
        ? data.cycleCountAtTrigger
        : undefined,
    occurrenceCount:
      typeof data.occurrenceCount === 'number'
        ? data.occurrenceCount
        : undefined,
    latestOccurrenceAt: data.latestOccurrenceAt
      ? toMillis(data.latestOccurrenceAt)
      : null,
    taskOrigin:
      data.taskOrigin === 'automation' ||
      data.taskOrigin === 'manual' ||
      data.taskOrigin === 'public_report'
        ? data.taskOrigin
        : undefined,
    issueReportId:
      typeof data.issueReportId === 'string' ? data.issueReportId : undefined,
    issueReportReferenceCode:
      typeof data.issueReportReferenceCode === 'string'
        ? data.issueReportReferenceCode
        : undefined,
    referenceCode:
      typeof data.referenceCode === 'string' ? data.referenceCode : undefined,
    reportCategory:
      typeof data.reportCategory === 'string'
        ? data.reportCategory
        : undefined,
    status,
    createdAt: toMillis(data.createdAt),
    acknowledgedAt: data.acknowledgedAt ? toMillis(data.acknowledgedAt) : null,
    completedAt: data.completedAt ? toMillis(data.completedAt) : null,
    acknowledgedBy: timestampMapToMillis(data.acknowledgedBy),
    completedBy: timestampMapToMillis(data.completedBy),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'unknown',
    remarks: typeof data.remarks === 'string' ? data.remarks : undefined,
    beforePhotoUrl:
      typeof data.beforePhotoUrl === 'string' ? data.beforePhotoUrl : null,
    beforePhotoCapturedAt: data.beforePhotoCapturedAt
      ? toMillis(data.beforePhotoCapturedAt)
      : null,
    afterPhotoUrl:
      typeof data.afterPhotoUrl === 'string' ? data.afterPhotoUrl : null,
    afterPhotoCapturedAt: data.afterPhotoCapturedAt
      ? toMillis(data.afterPhotoCapturedAt)
      : null,
    additionalPhotos: Array.isArray(data.additionalPhotos)
      ? data.additionalPhotos.filter((u): u is string => typeof u === 'string')
      : undefined,
    checklist:
      data.checklist && typeof data.checklist === 'object'
        ? (data.checklist as Record<string, unknown>)
        : undefined,
    submissions:
      data.submissions && typeof data.submissions === 'object'
        ? (data.submissions as Record<string, unknown>)
        : undefined,
    workDuration:
      typeof data.workDuration === 'number' ? data.workDuration : undefined,
    responseTime:
      typeof data.responseTime === 'number' ? data.responseTime : undefined,
    totalTime:
      typeof data.totalTime === 'number' ? data.totalTime : undefined,
    biometricVerified:
      typeof data.biometricVerified === 'boolean'
        ? data.biometricVerified
        : undefined,
    inspectionStatus:
      data.inspectionStatus === 'approved' ||
      data.inspectionStatus === 'flagged' ||
      data.inspectionStatus === 'pending_review'
        ? data.inspectionStatus
        : null,
    inspectedBy: typeof data.inspectedBy === 'string' ? data.inspectedBy : null,
    inspectedByName:
      typeof data.inspectedByName === 'string' ? data.inspectedByName : null,
    inspectedAt: data.inspectedAt ? toMillis(data.inspectedAt) : null,
    flagReason: typeof data.flagReason === 'string' ? data.flagReason : null,
    flagPhotoUrls: Array.isArray(data.flagPhotoUrls)
      ? data.flagPhotoUrls.filter((u): u is string => typeof u === 'string')
      : [],
    recheckCount: typeof data.recheckCount === 'number' ? data.recheckCount : 0,
    recheckedBy: typeof data.recheckedBy === 'string' ? data.recheckedBy : null,
    recheckedAt: data.recheckedAt ? toMillis(data.recheckedAt) : null,
    location: typeof data.location === 'string' ? data.location : undefined,
    restroomName:
      typeof data.restroomName === 'string' ? data.restroomName : undefined,
    floor: typeof data.floor === 'string' ? data.floor : undefined,
    building: typeof data.building === 'string' ? data.building : undefined,
    component: typeof data.component === 'string' ? data.component : undefined,
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
      deviceId: 'toilet-01',
      restroomName: "4F Men's Restroom • Stall 1",
      floor: '4th Floor',
      triggerType: 'student_report',
      message: 'Visitor QR report #KLIR-4F-0842: Continuous flush valve leak detected.',
      createdAt: now - 6 * 60 * 1000,
      assignedTo: 'demo-tech-2',
      assignedToIds: ['demo-tech-2'],
      status: 'pending',
      acknowledgedAt: null,
      completedAt: null,
      acknowledgedBy: {},
      completedBy: {},
      createdBy: 'demo-admin',
    },
    {
      id: 'demo-task-2',
      deviceId: 'toilet-01',
      restroomName: "4F Men's Restroom • Stall 1",
      floor: '4th Floor',
      triggerType: 'uv_complete',
      message: 'Routine UV-C sanitation cycle complete — verify basin & restock dispenser.',
      createdAt: now - 24 * 60 * 1000,
      assignedTo: 'demo-tech-1',
      assignedToIds: ['demo-tech-1'],
      status: 'acknowledged',
      acknowledgedAt: now - 17 * 60 * 1000,
      completedAt: null,
      acknowledgedBy: { 'demo-tech-1': now - 17 * 60 * 1000 },
      completedBy: {},
      createdBy: 'system:mqtt',
    },
    {
      id: 'demo-task-3',
      deviceId: 'SDCA-FL1-CANTEEN-M',
      restroomName: '1F Canteen Male Restroom',
      floor: '1st Floor',
      triggerType: 'maintenance',
      message: 'Scheduled midday deep sanitation & water pressure inspection.',
      createdAt: now - 72 * 60 * 1000,
      assignedTo: 'demo-tech-3',
      assignedToIds: ['demo-tech-3'],
      status: 'completed',
      inspectionStatus: 'approved',
      acknowledgedAt: now - 64 * 60 * 1000,
      completedAt: now - 31 * 60 * 1000,
      acknowledgedBy: { 'demo-tech-3': now - 64 * 60 * 1000 },
      completedBy: { 'demo-tech-3': now - 31 * 60 * 1000 },
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
    () =>
      tasks.filter(
        (task) =>
          (task.status === 'pending' ||
            task.status === 'unassigned' ||
            task.status === 'assigned' ||
            task.status === 'reassignment_needed') &&
          task.inspectionStatus !== 'flagged',
      ).length,
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
