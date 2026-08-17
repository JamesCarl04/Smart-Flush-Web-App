'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  BrushCleaning,
  CheckCircle2,
  ClipboardList,
  Clock,
  Droplets,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useTasks } from '@/hooks/useTasks';
import { DashboardToast } from '@/components/dashboard/DashboardToast';
import { apiFetch } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-utils';
import { db } from '@/lib/firebase';
import type { Device, Task, TaskTriggerType } from '@/types';

interface DevicesResponse {
  success: boolean;
  data: Device[];
}

interface CreateTaskResponse {
  success: boolean;
  data?: {
    taskId: string;
  };
  error?: string;
}

interface UpdateTaskResponse {
  success: boolean;
  data?: Task;
  error?: string;
}

interface DeleteTaskResponse {
  success: boolean;
  data?: {
    id: string;
  };
  error?: string;
}

type UserRole = 'admin' | 'maintenance' | 'viewer' | 'user' | null;
type ToastKind = 'success' | 'error';
const NO_ASSIGNEES_VALUE = '__none_selected__';

function formatDeviceLabel(device: Device): string {
  return device.name || device.id;
}

function getDefaultMessage(deviceLabel: string): string {
  return `Manual maintenance requested for ${deviceLabel}.`;
}

function getPriorityBadge(triggerType?: TaskTriggerType) {
  switch (triggerType) {
    case 'maintenance':
      return {
        label: 'Critical PM',
        className:
          'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30',
        icon: <Wrench className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'uv_complete':
      return {
        label: 'UV Cycle Done',
        className:
          'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
        icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'flush_count':
      return {
        label: 'Flush Threshold',
        className:
          'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30',
        icon: <Droplets className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'manual':
    default:
      return {
        label: 'Manual Dispatch',
        className:
          'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30',
        icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
      };
  }
}

function getStatusBadge(status: Task['status']) {
  switch (status) {
    case 'acknowledged':
      return {
        label: 'Acknowledged',
        className:
          'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/40',
        icon: <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'completed':
      return {
        label: 'Completed',
        className:
          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40',
        icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'pending':
    default:
      return {
        label: 'Pending',
        className:
          'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40',
        icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
      };
  }
}

function formatTimestamp(value?: number | null): string {
  if (!value) {
    return 'Not recorded';
  }

  return format(new Date(value), 'MMM d, yyyy HH:mm');
}

function formatRelativeTimestamp(value: number): string {
  if (!value) {
    return 'Time unavailable';
  }

  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function getInitials(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '?';
  }

  const name = trimmedValue.includes('@')
    ? trimmedValue.split('@')[0]
    : trimmedValue;
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function normalizeAssigneeSelection(
  selectedIds: string[],
  allPersonnelIds: string[],
): string[] {
  if (selectedIds.includes(NO_ASSIGNEES_VALUE)) {
    return [NO_ASSIGNEES_VALUE];
  }

  if (allPersonnelIds.length === 0) {
    return selectedIds;
  }

  const selectedPersonnelIds = selectedIds;
  const allSelected = allPersonnelIds.every((id) =>
    selectedPersonnelIds.includes(id),
  );

  return allSelected ? [] : selectedPersonnelIds;
}

export function MaintenanceTaskPanel() {
  const { user, loading: authLoading } = useAuth();
  const {
    tasks,
    pendingCount,
    loading: tasksLoading,
    error: tasksError,
    refreshTasks,
  } = useTasks();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [selectedToiletId, setSelectedToiletId] = useState('');
  const [message, setMessage] = useState('');
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [taskAction, setTaskAction] = useState<
    'edit' | 'delete' | 'create' | null
  >(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [editToiletId, setEditToiletId] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editAssignedToIds, setEditAssignedToIds] = useState<string[]>([]);

  // Modal Add Task State
  const [modalDeviceId, setModalDeviceId] = useState('');
  const [modalTriggerType, setModalTriggerType] =
    useState<TaskTriggerType>('manual');
  const [modalMessage, setModalMessage] = useState('');
  const [modalAssignedToIds, setModalAssignedToIds] = useState<string[]>([]);

  const [taskToast, setTaskToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);

  const confirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const editDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const createDialogRef = useRef<HTMLDialogElement | null>(null);
  const previousDefaultMessageRef = useRef('');

  const showAssignmentForm = role === 'admin';
  const showAssignmentSkeleton = roleLoading;
  const canManageTasks = role === 'admin';

  const isForbiddenError = useMemo(() => {
    if (!tasksError) return false;
    const lower = tasksError.toLowerCase();
    return (
      lower.includes('403') ||
      lower.includes('forbidden') ||
      lower.includes('unauthorized') ||
      lower.includes('permission') ||
      role === 'viewer' ||
      role === 'user'
    );
  }, [tasksError, role]);

  const {
    personnel,
    personnelById,
    loading: personnelLoading,
    error: personnelError,
  } = useMaintenancePersonnel({
    enabled: showAssignmentForm || canManageTasks,
  });

  const resolveDeviceLabel = (deviceId: string) =>
    devices.find((device) => device.id === deviceId)?.name || deviceId;

  useEffect(() => {
    if (!taskToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTaskToast(null);
    }, 3600);

    return () => window.clearTimeout(timeoutId);
  }, [taskToast]);

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      if (authLoading) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
        return;
      }

      setRoleLoading(true);

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled) {
          const nextRole = userDoc.exists()
            ? ((userDoc.data().role as UserRole | undefined) ?? 'user')
            : 'user';
          setRole(nextRole);
        }
      } catch (error) {
        console.warn('[MaintenanceTaskPanel] role lookup failed:', error);
        if (!cancelled) {
          setRole('user');
        }
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
        }
      }
    };

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    let cancelled = false;

    const loadDevices = async () => {
      if (authLoading || roleLoading) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setDevices([]);
          setDevicesLoading(false);
        }
        return;
      }

      setDevicesLoading(true);

      try {
        const response = await apiFetch<DevicesResponse>('/api/devices', user);
        if (!cancelled) {
          const nextDevices = Array.isArray(response.data) ? response.data : [];
          setDevices(nextDevices);
          setSelectedToiletId((current) => {
            if (
              current &&
              nextDevices.some((device) => device.id === current)
            ) {
              return current;
            }

            return nextDevices[0]?.id ?? '';
          });
          setModalDeviceId((current) => {
            if (
              current &&
              nextDevices.some((device) => device.id === current)
            ) {
              return current;
            }

            return nextDevices[0]?.id ?? '';
          });
        }
      } catch (error) {
        console.warn('[MaintenanceTaskPanel] device lookup failed:', error);
        if (!cancelled) {
          setDevices([]);
          setSelectedToiletId('');
        }
      } finally {
        if (!cancelled) {
          setDevicesLoading(false);
        }
      }
    };

    void loadDevices();

    return () => {
      cancelled = true;
    };
  }, [authLoading, roleLoading, user]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedToiletId) ?? null,
    [devices, selectedToiletId],
  );
  const selectedDeviceLabel = selectedDevice
    ? formatDeviceLabel(selectedDevice)
    : selectedToiletId || 'the selected toilet unit';
  const defaultMessage = useMemo(
    () => getDefaultMessage(selectedDeviceLabel),
    [selectedDeviceLabel],
  );
  const useTwoColumnLayout = showAssignmentForm || showAssignmentSkeleton;

  useEffect(() => {
    const previousDefaultMessage = previousDefaultMessageRef.current;
    previousDefaultMessageRef.current = defaultMessage;

    setMessage((currentMessage) => {
      if (!currentMessage.trim() || currentMessage === previousDefaultMessage) {
        return defaultMessage;
      }

      return currentMessage;
    });
  }, [defaultMessage]);

  const resolveAssignedName = (
    assignedUserId?: string | null,
    assignedUserIds: string[] = [],
  ) => {
    const userIds =
      assignedUserIds.length > 0
        ? assignedUserIds
        : assignedUserId
          ? [assignedUserId]
          : [];

    if (userIds.length === 0) {
      return 'All maintenance team';
    }

    if (personnelLoading) {
      return 'Loading staff...';
    }

    return userIds
      .map((userId) => personnelById[userId]?.displayName ?? userId)
      .join(', ');
  };

  const getRequiredAssigneeIds = (task: Task) => {
    if (task.assignedToIds && task.assignedToIds.length > 0) {
      return task.assignedToIds;
    }

    if (task.assignedTo) {
      return [task.assignedTo];
    }

    const personnelIds = personnel.map((person) => person.id);
    if (personnelIds.length > 0) {
      return personnelIds;
    }

    return Array.from(
      new Set([
        ...Object.keys(task.acknowledgedBy ?? {}),
        ...Object.keys(task.completedBy ?? {}),
      ]),
    );
  };

  const getAcknowledgementSummary = (task: Task) => {
    const requiredAssigneeIds = getRequiredAssigneeIds(task);
    const acknowledgedUserIds = requiredAssigneeIds.filter(
      (userId) => task.acknowledgedBy?.[userId] || task.completedBy?.[userId],
    );

    if (acknowledgedUserIds.length === 0) {
      return null;
    }

    return {
      acknowledgedCount: acknowledgedUserIds.length,
      totalCount: requiredAssigneeIds.length,
      initials: acknowledgedUserIds.map((userId) => {
        const staff = personnelById[userId];
        return getInitials(staff?.displayName || staff?.email || userId);
      }),
    };
  };

  const getAcknowledgementProgress = (task: Task) => {
    const summary = getAcknowledgementSummary(task);
    if (!summary || summary.totalCount <= 1) {
      return null;
    }

    return `${summary.acknowledgedCount}/${summary.totalCount} staff ack`;
  };

  const toggleAllAssignedToIds = () => {
    setAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const toggleAssignedToId = (userId: string) => {
    setAssignedToIds((current) => {
      const activeIds = current.filter((id) => id !== NO_ASSIGNEES_VALUE);
      const isSelected = activeIds.includes(userId);
      const nextIds = isSelected
        ? activeIds.filter((id) => id !== userId)
        : [...activeIds, userId];

      if (nextIds.length === 0) {
        return [NO_ASSIGNEES_VALUE];
      }

      return normalizeAssigneeSelection(
        nextIds,
        personnel.map((person) => person.id),
      );
    });
  };

  const toggleAllEditAssignedToIds = () => {
    setEditAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const toggleEditAssignedToId = (userId: string) => {
    setEditAssignedToIds((current) => {
      const activeIds = current.filter((id) => id !== NO_ASSIGNEES_VALUE);
      const isSelected = activeIds.includes(userId);
      const nextIds = isSelected
        ? activeIds.filter((id) => id !== userId)
        : [...activeIds, userId];

      if (nextIds.length === 0) {
        return [NO_ASSIGNEES_VALUE];
      }

      return normalizeAssigneeSelection(
        nextIds,
        personnel.map((person) => person.id),
      );
    });
  };

  const toggleAllModalAssignedToIds = () => {
    setModalAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const toggleModalAssignedToId = (userId: string) => {
    setModalAssignedToIds((current) => {
      const activeIds = current.filter((id) => id !== NO_ASSIGNEES_VALUE);
      const isSelected = activeIds.includes(userId);
      const nextIds = isSelected
        ? activeIds.filter((id) => id !== userId)
        : [...activeIds, userId];

      if (nextIds.length === 0) {
        return [NO_ASSIGNEES_VALUE];
      }

      return normalizeAssigneeSelection(
        nextIds,
        personnel.map((person) => person.id),
      );
    });
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task feed updated',
      });
    } catch {
      setTaskToast({
        kind: 'error',
        message: 'Failed to refresh tasks',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openConfirmModal = () => {
    confirmDialogRef.current?.showModal();
  };

  const closeConfirmModal = () => {
    confirmDialogRef.current?.close();
  };

  const openCreateTaskModal = () => {
    setModalDeviceId(selectedToiletId || devices[0]?.id || '');
    setModalTriggerType('manual');
    setModalMessage(
      getDefaultMessage(
        resolveDeviceLabel(selectedToiletId || devices[0]?.id || ''),
      ),
    );
    setModalAssignedToIds([]);
    createDialogRef.current?.showModal();
  };

  const closeCreateTaskModal = () => {
    createDialogRef.current?.close();
  };

  const handleCreateTaskFromModal = async () => {
    if (!user) {
      setTaskToast({
        kind: 'error',
        message: 'You must be logged in to create a task.',
      });
      return;
    }

    if (!modalDeviceId) {
      setTaskToast({
        kind: 'error',
        message: 'Select a toilet unit before creating a task.',
      });
      return;
    }

    const trimmedMsg = modalMessage.trim();
    if (!trimmedMsg) {
      setTaskToast({
        kind: 'error',
        message: 'Enter a task message before creating a task.',
      });
      return;
    }

    if (modalAssignedToIds.includes(NO_ASSIGNEES_VALUE)) {
      setTaskToast({
        kind: 'error',
        message: 'Select at least one maintenance person before assigning.',
      });
      return;
    }

    setTaskAction('create');

    try {
      await apiFetch<CreateTaskResponse>('/api/tasks', user, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: modalDeviceId,
          triggerType: modalTriggerType,
          message: trimmedMsg,
          assignedTo:
            modalAssignedToIds.length === 1 ? modalAssignedToIds[0] : null,
          assignedToIds: modalAssignedToIds.filter(
            (userId) => userId !== NO_ASSIGNEES_VALUE,
          ),
        }),
      });

      closeCreateTaskModal();
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task assigned and notification sent',
      });
    } catch (error) {
      setTaskToast({
        kind: 'error',
        message: getErrorMessage(error) ?? 'Failed to assign task',
      });
    } finally {
      setTaskAction(null);
    }
  };

  const handleAssignTask = async () => {
    if (!user) {
      setTaskToast({
        kind: 'error',
        message: 'You must be logged in to assign a task.',
      });
      return;
    }

    if (!selectedToiletId) {
      setTaskToast({
        kind: 'error',
        message: 'Select a toilet unit before assigning a task.',
      });
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setTaskToast({
        kind: 'error',
        message: 'Enter a task message before assigning a task.',
      });
      return;
    }

    if (assignedToIds.includes(NO_ASSIGNEES_VALUE)) {
      setTaskToast({
        kind: 'error',
        message: 'Select at least one maintenance person before assigning.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch<CreateTaskResponse>('/api/tasks', user, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: selectedToiletId,
          triggerType: 'manual',
          message: trimmedMessage,
          assignedTo: assignedToIds.length === 1 ? assignedToIds[0] : null,
          assignedToIds: assignedToIds.filter(
            (userId) => userId !== NO_ASSIGNEES_VALUE,
          ),
        }),
      });

      closeConfirmModal();
      setMessage(defaultMessage);
      setAssignedToIds([]);
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task assigned and notification sent',
      });
    } catch (error) {
      setTaskToast({
        kind: 'error',
        message: getErrorMessage(error) ?? 'Failed to assign task',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setEditToiletId(task.deviceId);
    setEditMessage(task.message);
    setEditAssignedToIds(
      task.assignedToIds && task.assignedToIds.length > 0
        ? task.assignedToIds
        : task.assignedTo
          ? [task.assignedTo]
          : [],
    );
    editDialogRef.current?.showModal();
  };

  const closeEditTaskModal = () => {
    editDialogRef.current?.close();
  };

  const handleUpdateTask = async () => {
    if (!user || !editingTask || taskAction) {
      return;
    }

    const trimmedMessage = editMessage.trim();
    if (!editToiletId) {
      setTaskToast({
        kind: 'error',
        message: 'Select a toilet unit before saving.',
      });
      return;
    }

    if (!trimmedMessage) {
      setTaskToast({
        kind: 'error',
        message: 'Task message cannot be empty.',
      });
      return;
    }

    if (editAssignedToIds.includes(NO_ASSIGNEES_VALUE)) {
      setTaskToast({
        kind: 'error',
        message: 'Select at least one maintenance person before saving.',
      });
      return;
    }

    setTaskAction('edit');

    try {
      await apiFetch<UpdateTaskResponse>(`/api/tasks/${editingTask.id}`, user, {
        method: 'PUT',
        body: JSON.stringify({
          deviceId: editToiletId,
          message: trimmedMessage,
          assignedTo:
            editAssignedToIds.length === 1 ? editAssignedToIds[0] : null,
          assignedToIds: editAssignedToIds.filter(
            (userId) => userId !== NO_ASSIGNEES_VALUE,
          ),
        }),
      });

      closeEditTaskModal();
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task updated successfully',
      });
    } catch (error) {
      setTaskToast({
        kind: 'error',
        message: getErrorMessage(error) ?? 'Failed to update task',
      });
    } finally {
      setTaskAction(null);
    }
  };

  const openDeleteTaskModal = (task: Task) => {
    setDeletingTask(task);
    deleteDialogRef.current?.showModal();
  };

  const closeDeleteTaskModal = () => {
    deleteDialogRef.current?.close();
  };

  const handleDeleteTask = async () => {
    if (!user || !deletingTask || taskAction) {
      return;
    }

    setTaskAction('delete');

    try {
      await apiFetch<DeleteTaskResponse>(
        `/api/tasks/${deletingTask.id}`,
        user,
        {
          method: 'DELETE',
        },
      );

      closeDeleteTaskModal();
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task removed from queue',
      });
    } catch (error) {
      setTaskToast({
        kind: 'error',
        message: getErrorMessage(error) ?? 'Failed to delete task',
      });
    } finally {
      setTaskAction(null);
    }
  };

  return (
    <>
      <section
        id="maintenance-task-panel"
        aria-label="Maintenance Dispatch & Task Feed"
        className={`grid scroll-mt-24 gap-6 xl:gap-8 ${
          useTwoColumnLayout ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {showAssignmentSkeleton ? (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95">
            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
                <div className="skeleton h-11 w-11 rounded-xl"></div>
                <div className="space-y-2">
                  <div className="skeleton h-5 w-40"></div>
                  <div className="skeleton h-3 w-56 max-w-full"></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-12 w-full rounded-xl"></div>
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-24 w-full rounded-xl"></div>
                <div className="skeleton h-4 w-28"></div>
                <div className="skeleton h-28 w-full rounded-xl"></div>
                <div className="skeleton h-12 w-full rounded-xl"></div>
              </div>
            </div>
          </div>
        ) : showAssignmentForm ? (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95 transition-all">
            {/* Top Amber Accent Glow */}
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-600 opacity-90"
              aria-hidden="true"
            />

            <div className="mb-6 flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
                  <BrushCleaning className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Assign Task
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Send real-time dispatch alerts and mobile push to
                    technicians.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="form-control w-full">
                <label
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  htmlFor="maintenance-toilet"
                >
                  Toilet Unit Target
                </label>
                {devicesLoading ? (
                  <div className="skeleton h-12 w-full rounded-xl"></div>
                ) : (
                  <select
                    id="maintenance-toilet"
                    className="select select-bordered w-full rounded-xl border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100 min-h-[46px]"
                    value={selectedToiletId}
                    onChange={(event) => setSelectedToiletId(event.target.value)}
                  >
                    {devices.length === 0 ? (
                      <option value="">No toilet units available</option>
                    ) : (
                      devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {formatDeviceLabel(device)} ({device.status})
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              <div className="form-control w-full">
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    htmlFor="maintenance-message"
                  >
                    Task Instructions
                  </label>
                  <span
                    id="maintenance-msg-count"
                    className="text-xs font-mono text-slate-500 dark:text-slate-400"
                  >
                    {message.length}/500
                  </span>
                </div>
                <textarea
                  id="maintenance-message"
                  aria-describedby="maintenance-msg-count"
                  className="textarea textarea-bordered min-h-24 w-full rounded-xl border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100"
                  maxLength={500}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe maintenance or sanitation request..."
                ></textarea>
              </div>

              <div className="form-control w-full">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Assign To Personnel
                </span>
                {personnelLoading ? (
                  <div className="skeleton h-12 w-full rounded-xl"></div>
                ) : (
                  <>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800/80 dark:bg-slate-850/40">
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-warning rounded-md"
                          checked={assignedToIds.length === 0}
                          onChange={toggleAllAssignedToIds}
                          aria-label="Broadcast task to all maintenance personnel"
                        />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          All Maintenance Team (Broadcast)
                        </span>
                      </label>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {personnel.map((person) => {
                          const initials = getInitials(
                            person.displayName || person.email || person.id,
                          );
                          const isChecked =
                            assignedToIds.length === 0 ||
                            assignedToIds.includes(person.id);

                          return (
                            <label
                              key={person.id}
                              className="flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                            >
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-warning mt-0.5 rounded-md"
                                checked={isChecked}
                                onChange={() => toggleAssignedToId(person.id)}
                                aria-label={`Assign to ${person.displayName || person.email || person.id}`}
                              />
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-700 dark:bg-amber-500/25 dark:text-amber-300"
                                  aria-hidden="true"
                                >
                                  {initials}
                                </span>
                                <div className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                                    {person.displayName}
                                  </span>
                                  {person.email ? (
                                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                      {person.email}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {personnelError && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{personnelError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                className="action-btn-primary w-full min-h-[48px] shadow-sm font-semibold tracking-wide"
                disabled={
                  isSubmitting ||
                  devicesLoading ||
                  personnelLoading ||
                  devices.length === 0
                }
                onClick={openConfirmModal}
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="loading loading-spinner loading-sm"
                      aria-hidden="true"
                    ></span>
                    <span>Assigning Task...</span>
                  </>
                ) : (
                  <>
                    <BrushCleaning className="h-4 w-4" aria-hidden="true" />
                    <span>Dispatch Task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}

        {/* ── RIGHT COLUMN: MAINTENANCE TASK FEED CARD ─────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95"
          role="region"
          aria-label="Maintenance Task Feed"
        >
          {/* Top Primary Accent Glow */}
          <div
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-rose-500 to-amber-500 opacity-90"
            aria-hidden="true"
          />

          <div className="mb-6 flex flex-col gap-3 border-b border-slate-200/80 pb-4 md:flex-row md:items-center md:justify-between dark:border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/20 dark:text-rose-400">
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Maintenance Task Feed
                  </h2>
                  <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Live
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time status updates and technician acknowledgments.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => void handleManualRefresh()}
                title="Refresh tasks"
                aria-label="Refresh tasks"
              >
                <RotateCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {canManageTasks ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sdca-darkred focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary transition-all active:translate-y-0.5 min-h-[36px] whitespace-nowrap"
                  onClick={openCreateTaskModal}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add Task</span>
                </button>
              ) : null}

              {tasksLoading ? (
                <div className="skeleton h-8 w-24 rounded-full"></div>
              ) : !isForbiddenError ? (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap"
                  aria-live="polite"
                >
                  <span>Pending</span>
                  <span className="font-bold tabular-nums">{pendingCount}</span>
                </div>
              ) : null}
            </div>
          </div>

          {tasksLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 dark:border-slate-800/80 dark:bg-slate-850/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-full space-y-3">
                      <div className="skeleton h-4 w-32 rounded"></div>
                      <div className="skeleton h-3 w-52 max-w-full rounded"></div>
                      <div className="skeleton h-3 w-40 rounded"></div>
                    </div>
                    <div className="skeleton h-7 w-24 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : isForbiddenError ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-850/40">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:bg-primary/20 dark:text-rose-400 shadow-inner">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Restricted Task Feed
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">
                Maintenance task scheduling and live acknowledgments are
                accessible to authorized technicians and administrators.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                ></span>
                Role: {role || 'Standard Viewer'}
              </div>
            </div>
          ) : tasksError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300 font-semibold text-sm">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <span>Unable to load maintenance tasks</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                {tasksError}
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline border-rose-500 text-rose-600 hover:bg-rose-500 hover:text-white dark:text-rose-400 gap-1.5"
                onClick={() => void refreshTasks()}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-850/40 dark:text-slate-400">
              <ClipboardList
                className="mx-auto h-10 w-10 opacity-40 mb-3"
                aria-hidden="true"
              />
              <p className="font-semibold text-base text-slate-800 dark:text-slate-200">
                No tasks assigned yet
              </p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                All toilet units are operating smoothly. Create a manual request
                or wait for automated maintenance triggers.
              </p>
              {canManageTasks && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 mt-4 text-xs font-bold text-white shadow-sm hover:bg-sdca-darkred focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary transition-all min-h-[36px]"
                  onClick={openCreateTaskModal}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Create First Task</span>
                </button>
              )}
            </div>
          ) : (
            <div
              className="max-h-[34rem] space-y-3 overflow-y-auto pr-1"
              aria-live="polite"
            >
              {tasks.map((task) => {
                const acknowledgementSummary = getAcknowledgementSummary(task);
                const priority = getPriorityBadge(task.triggerType);
                const statusInfo = getStatusBadge(task.status);

                return (
                  <div
                    key={task.id}
                    className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50/50 hover:shadow dark:border-slate-800/90 dark:bg-slate-850/60 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {/* Header Row: Location, Priority, and Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md whitespace-nowrap">
                          {resolveDeviceLabel(task.deviceId)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${priority.className}`}
                        >
                          {priority.icon}
                          <span>{priority.label}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap ${statusInfo.className}`}
                        >
                          {statusInfo.icon}
                          <span>{statusInfo.label}</span>
                          {acknowledgementSummary ? (
                            <span className="ml-1 flex items-center gap-1">
                              <span className="text-[11px] font-bold tabular-nums">
                                ({acknowledgementSummary.acknowledgedCount})
                              </span>
                              <span
                                className="flex -space-x-1"
                                aria-hidden="true"
                              >
                                {acknowledgementSummary.initials
                                  .slice(0, 3)
                                  .map((initials, index) => (
                                    <span
                                      key={`${task.id}-${initials}-${index}`}
                                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-black leading-none text-slate-800 shadow-xs ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                                      title={initials}
                                    >
                                      {initials}
                                    </span>
                                  ))}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Body: Message text with proper full width flow */}
                    <p className="my-3 break-words text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {task.message || 'No message provided'}
                    </p>

                    {/* Footer Row: Meta details + Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2.5 border-t border-slate-100 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="whitespace-nowrap">
                          Assigned to{' '}
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {resolveAssignedName(
                              task.assignedTo,
                              task.assignedToIds,
                            )}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="whitespace-nowrap">
                          {formatRelativeTimestamp(task.createdAt)}
                        </span>

                        {task.acknowledgedAt ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap text-sky-700 dark:text-sky-400 font-medium">
                              Ack {formatTimestamp(task.acknowledgedAt)}
                            </span>
                          </>
                        ) : null}

                        {getAcknowledgementProgress(task) ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap font-semibold text-amber-700 dark:text-amber-400">
                              {getAcknowledgementProgress(task)}
                            </span>
                          </>
                        ) : null}

                        {task.completedAt ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap text-emerald-700 dark:text-emerald-400 font-medium">
                              Done {formatTimestamp(task.completedAt)}
                            </span>
                          </>
                        ) : null}
                      </div>

                      {canManageTasks ? (
                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-primary min-h-[30px]"
                            onClick={() => openEditTaskModal(task)}
                            title="Edit task"
                            aria-label={`Edit task for ${resolveDeviceLabel(task.deviceId)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 min-h-[30px]"
                            onClick={() => openDeleteTaskModal(task)}
                            title="Delete task"
                            aria-label={`Delete task for ${resolveDeviceLabel(task.deviceId)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── CREATE TASK MODAL ────────────────────────────────────── */}
      <dialog
        ref={createDialogRef}
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
        aria-labelledby="create-task-title"
      >
        <div className="modal-box max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3
                id="create-task-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Create Maintenance Task
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dispatch a new task to technicians with custom priority
              </p>
            </div>
            <button
              type="button"
              onClick={closeCreateTaskModal}
              aria-label="Close create task dialog"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="form-control">
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  htmlFor="modal-toilet"
                >
                  Toilet Unit
                </label>
                <select
                  id="modal-toilet"
                  className="select select-bordered w-full rounded-xl border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100 min-h-[44px]"
                  value={modalDeviceId}
                  onChange={(e) => setModalDeviceId(e.target.value)}
                >
                  {devices.length === 0 ? (
                    <option value="">No toilet units available</option>
                  ) : (
                    devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {formatDeviceLabel(device)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-control">
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  htmlFor="modal-trigger"
                >
                  Task Type / Priority
                </label>
                <select
                  id="modal-trigger"
                  className="select select-bordered w-full rounded-xl border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100 min-h-[44px]"
                  value={modalTriggerType}
                  onChange={(e) =>
                    setModalTriggerType(e.target.value as TaskTriggerType)
                  }
                >
                  <option value="manual">Manual Dispatch (Standard)</option>
                  <option value="maintenance">Scheduled PM (Critical)</option>
                  <option value="flush_count">Flush Threshold (High)</option>
                  <option value="uv_complete">UV Cycle Follow-up (High)</option>
                </select>
              </div>
            </div>

            <div className="form-control">
              <div className="mb-1 flex items-center justify-between">
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  htmlFor="modal-message"
                >
                  Task Message
                </label>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {modalMessage.length}/500
                </span>
              </div>
              <textarea
                id="modal-message"
                className="textarea textarea-bordered min-h-24 w-full rounded-xl border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100"
                maxLength={500}
                value={modalMessage}
                onChange={(e) => setModalMessage(e.target.value)}
                placeholder="Enter instructions for maintenance team..."
              ></textarea>
            </div>

            <div className="form-control">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Assign To
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-850/40">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary rounded-md"
                    checked={modalAssignedToIds.length === 0}
                    onChange={toggleAllModalAssignedToIds}
                    aria-label="Broadcast task to all maintenance personnel"
                  />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    All Maintenance Team (Broadcast)
                  </span>
                </label>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {personnel.map((person) => (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary mt-0.5 rounded-md"
                        checked={
                          modalAssignedToIds.length === 0 ||
                          modalAssignedToIds.includes(person.id)
                        }
                        onChange={() => toggleModalAssignedToId(person.id)}
                        aria-label={`Assign to ${person.displayName || person.email || person.id}`}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-slate-800 dark:text-slate-200">
                          {person.displayName}
                        </span>
                        {person.email ? (
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {person.email}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px] rounded-xl px-5 text-slate-600 dark:text-slate-400"
              onClick={closeCreateTaskModal}
              disabled={taskAction === 'create'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="action-btn-primary min-h-[48px] px-6 font-semibold shadow-sm disabled:opacity-50"
              onClick={() => void handleCreateTaskFromModal()}
              disabled={
                taskAction === 'create' ||
                !modalDeviceId ||
                !modalMessage.trim()
              }
            >
              {taskAction === 'create' ? (
                <>
                  <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                  ></span>
                  <span>Creating...</span>
                </>
              ) : (
                'Create & Dispatch'
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button disabled={taskAction === 'create'}>close</button>
        </form>
      </dialog>

      {/* ── CONFIRM TASK MODAL ────────────────────────────────────── */}
      <dialog
        ref={confirmDialogRef}
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
        aria-labelledby="confirm-task-title"
      >
        <div className="modal-box rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3
                id="confirm-task-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Confirm Task Assignment
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Review task details before dispatching to maintenance personnel
              </p>
            </div>
            <button
              type="button"
              onClick={closeConfirmModal}
              aria-label="Close confirm dialog"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Send this task for{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {selectedDeviceLabel}
              </span>
              ?
            </p>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800/80 dark:bg-slate-850/60">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {message}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Assigned to:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {resolveAssignedName(null, assignedToIds)}
                </span>
              </p>
            </div>
          </div>
          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px] rounded-xl px-5 text-slate-600 dark:text-slate-400"
              onClick={closeConfirmModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="action-btn-primary min-h-[48px] px-6 font-semibold shadow-sm disabled:opacity-50"
              onClick={() => void handleAssignTask()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                  ></span>
                  <span>Assigning...</span>
                </>
              ) : (
                'Confirm & Send'
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button disabled={isSubmitting}>close</button>
        </form>
      </dialog>

      {/* ── EDIT TASK MODAL ────────────────────────────────────────── */}
      <dialog
        ref={editDialogRef}
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
        aria-labelledby="edit-task-title"
      >
        <div className="modal-box max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3
                id="edit-task-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Edit Task
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update task description, target unit, or assignees
              </p>
            </div>
            <button
              type="button"
              onClick={closeEditTaskModal}
              aria-label="Close edit dialog"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-4 py-3">
            <div className="form-control">
              <label
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                htmlFor="edit-maintenance-toilet"
              >
                Toilet Unit
              </label>
              <select
                id="edit-maintenance-toilet"
                className="select select-bordered w-full rounded-xl border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100 min-h-[44px]"
                value={editToiletId}
                onChange={(event) => setEditToiletId(event.target.value)}
              >
                {editToiletId &&
                !devices.some((device) => device.id === editToiletId) ? (
                  <option value={editToiletId}>{editToiletId}</option>
                ) : null}
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {formatDeviceLabel(device)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <div className="mb-1 flex items-center justify-between">
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  htmlFor="edit-maintenance-message"
                >
                  Message
                </label>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {editMessage.length}/500
                </span>
              </div>
              <textarea
                id="edit-maintenance-message"
                className="textarea textarea-bordered min-h-24 w-full rounded-xl border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100"
                maxLength={500}
                value={editMessage}
                onChange={(event) => setEditMessage(event.target.value)}
              ></textarea>
            </div>

            <div className="form-control">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Assign To
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-850/40">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary rounded-md"
                    checked={editAssignedToIds.length === 0}
                    onChange={toggleAllEditAssignedToIds}
                    aria-label="Broadcast task to all maintenance personnel"
                  />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    All Maintenance Team (Broadcast)
                  </span>
                </label>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {editAssignedToIds
                    .filter(
                      (userId) =>
                        userId !== NO_ASSIGNEES_VALUE &&
                        !personnel.some((person) => person.id === userId),
                    )
                    .map((userId) => (
                      <label
                        key={userId}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary rounded-md"
                          checked
                          onChange={() => toggleEditAssignedToId(userId)}
                          aria-label={`Assign to ${resolveAssignedName(userId)}`}
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {resolveAssignedName(userId)}
                        </span>
                      </label>
                    ))}
                  {personnel.map((person) => (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary mt-0.5 rounded-md"
                        checked={
                          editAssignedToIds.length === 0 ||
                          editAssignedToIds.includes(person.id)
                        }
                        onChange={() => toggleEditAssignedToId(person.id)}
                        aria-label={`Assign to ${person.displayName || person.email || person.id}`}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-slate-800 dark:text-slate-200">
                          {person.displayName}
                        </span>
                        {person.email ? (
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {person.email}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px] rounded-xl px-5 text-slate-600 dark:text-slate-400"
              onClick={closeEditTaskModal}
              disabled={taskAction === 'edit'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="action-btn-primary min-h-[48px] px-6 font-semibold shadow-sm disabled:opacity-50"
              onClick={() => void handleUpdateTask()}
              disabled={taskAction === 'edit'}
            >
              {taskAction === 'edit' ? (
                <>
                  <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                  ></span>
                  <span>Saving...</span>
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button disabled={taskAction === 'edit'}>close</button>
        </form>
      </dialog>

      {/* ── DELETE TASK MODAL ──────────────────────────────────────── */}
      <dialog
        ref={deleteDialogRef}
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
        aria-labelledby="delete-task-title"
      >
        <div className="modal-box rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3
                id="delete-task-title"
                className="text-lg font-bold text-rose-600 dark:text-rose-400"
              >
                Delete Task
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Remove task from maintenance dispatch queue
              </p>
            </div>
            <button
              type="button"
              onClick={closeDeleteTaskModal}
              aria-label="Close delete dialog"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Are you sure you want to remove this task from the queue?
            </p>
            {deletingTask ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800/80 dark:bg-slate-850/60">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {resolveDeviceLabel(deletingTask.deviceId)}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {deletingTask.message}
                </p>
              </div>
            ) : null}
          </div>
          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px] rounded-xl px-5 text-slate-600 dark:text-slate-400"
              onClick={closeDeleteTaskModal}
              disabled={taskAction === 'delete'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 font-semibold text-white shadow-sm hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 active:translate-y-0.5 disabled:opacity-50"
              onClick={() => void handleDeleteTask()}
              disabled={taskAction === 'delete'}
            >
              {taskAction === 'delete' ? (
                <>
                  <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                  ></span>
                  <span>Deleting...</span>
                </>
              ) : (
                'Delete Task'
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button disabled={taskAction === 'delete'}>close</button>
        </form>
      </dialog>

      {taskToast ? (
        <DashboardToast kind={taskToast.kind} message={taskToast.message} />
      ) : null}
    </>
  );
}
