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
        className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        icon: <Wrench className="w-3 h-3" />,
      };
    case 'uv_complete':
      return {
        label: 'UV Cycle Done',
        className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
        icon: <Sparkles className="w-3 h-3" />,
      };
    case 'flush_count':
      return {
        label: 'Flush Threshold',
        className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
        icon: <Droplets className="w-3 h-3" />,
      };
    case 'manual':
    default:
      return {
        label: 'Manual Dispatch',
        className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20',
        icon: <Clock className="w-3 h-3" />,
      };
  }
}

function getStatusBadge(status: Task['status']) {
  switch (status) {
    case 'acknowledged':
      return {
        label: 'Acknowledged',
        className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
        icon: <UserCheck className="w-3.5 h-3.5" />,
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      };
    case 'pending':
    default:
      return {
        label: 'Pending',
        className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
        icon: <Clock className="w-3.5 h-3.5" />,
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
  const [taskAction, setTaskAction] = useState<'edit' | 'delete' | 'create' | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [editToiletId, setEditToiletId] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editAssignedToIds, setEditAssignedToIds] = useState<string[]>([]);

  // Modal Add Task State
  const [modalDeviceId, setModalDeviceId] = useState('');
  const [modalTriggerType, setModalTriggerType] = useState<TaskTriggerType>('manual');
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
  const isTechnicianOrAdmin = role === 'admin' || role === 'maintenance';

  const isForbiddenError = useMemo(() => {
    if (!tasksError) return false;
    const lower = tasksError.toLowerCase();
    return (
      lower.includes('403') ||
      lower.includes('forbidden') ||
      lower.includes('unauthorized') ||
      lower.includes('permission') ||
      (role === 'viewer' || role === 'user')
    );
  }, [tasksError, role]);

  const {
    personnel,
    personnelById,
    loading: personnelLoading,
    error: personnelError,
  } = useMaintenancePersonnel({ enabled: showAssignmentForm || canManageTasks });

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
      if (
        !currentMessage.trim() ||
        currentMessage === previousDefaultMessage
      ) {
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
      totalCount: Math.max(requiredAssigneeIds.length, acknowledgedUserIds.length),
      initials: acknowledgedUserIds.map((userId) =>
        getInitials(
          personnelById[userId]?.displayName ??
            personnelById[userId]?.email ??
            userId,
        ),
      ),
    };
  };

  const getAcknowledgementProgress = (task: Task) => {
    const summary = getAcknowledgementSummary(task);
    if (!summary || summary.totalCount <= 1) {
      return null;
    }

    return `${summary.acknowledgedCount}/${summary.totalCount} acknowledged`;
  };

  const toggleAssignedToId = (userId: string) => {
    const allPersonnelIds = personnel.map((person) => person.id);

    setAssignedToIds((current) => {
      const nextIds =
        current.length === 0
          ? [NO_ASSIGNEES_VALUE]
          : current.includes(NO_ASSIGNEES_VALUE)
            ? [userId]
            : current.includes(userId)
              ? current.filter((id) => id !== userId)
              : [...current, userId];

      return normalizeAssigneeSelection(nextIds, allPersonnelIds);
    });
  };

  const toggleAllAssignedToIds = () => {
    setAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const toggleModalAssignedToId = (userId: string) => {
    const allPersonnelIds = personnel.map((person) => person.id);

    setModalAssignedToIds((current) => {
      const nextIds =
        current.length === 0
          ? [NO_ASSIGNEES_VALUE]
          : current.includes(NO_ASSIGNEES_VALUE)
            ? [userId]
            : current.includes(userId)
              ? current.filter((id) => id !== userId)
              : [...current, userId];

      return normalizeAssigneeSelection(nextIds, allPersonnelIds);
    });
  };

  const toggleAllModalAssignedToIds = () => {
    setModalAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const toggleEditAssignedToId = (userId: string) => {
    const allPersonnelIds = personnel.map((person) => person.id);

    setEditAssignedToIds((current) => {
      const nextIds =
        current.length === 0
          ? [NO_ASSIGNEES_VALUE]
          : current.includes(NO_ASSIGNEES_VALUE)
            ? [userId]
            : current.includes(userId)
              ? current.filter((id) => id !== userId)
              : [...current, userId];

      return normalizeAssigneeSelection(nextIds, allPersonnelIds);
    });
  };

  const toggleAllEditAssignedToIds = () => {
    setEditAssignedToIds((current) =>
      current.length === 0 ? [NO_ASSIGNEES_VALUE] : [],
    );
  };

  const openConfirmModal = () => {
    if (!selectedToiletId) {
      setTaskToast({
        kind: 'error',
        message: 'Select a toilet unit before assigning a task.',
      });
      return;
    }

    if (!message.trim()) {
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

    confirmDialogRef.current?.showModal();
  };

  const closeConfirmModal = () => {
    confirmDialogRef.current?.close();
  };

  const openCreateTaskModal = () => {
    const defaultDev = devices[0]?.id || '';
    setModalDeviceId(defaultDev);
    const devLabel = devices[0] ? formatDeviceLabel(devices[0]) : defaultDev;
    setModalMessage(getDefaultMessage(devLabel || 'toilet unit'));
    setModalTriggerType('manual');
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
        message: 'You must be logged in to assign a task.',
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
          assignedTo: modalAssignedToIds.length === 1 ? modalAssignedToIds[0] : null,
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
        message: 'Select a toilet unit before saving the task.',
      });
      return;
    }

    if (!trimmedMessage) {
      setTaskToast({
        kind: 'error',
        message: 'Enter a task message before saving.',
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
        method: 'PATCH',
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
      setEditingTask(null);
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
      await apiFetch<DeleteTaskResponse>(`/api/tasks/${deletingTask.id}`, user, {
        method: 'DELETE',
      });

      closeDeleteTaskModal();
      setDeletingTask(null);
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

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTasks();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <>
      <section
        id="maintenance-task-panel"
        className={`grid scroll-mt-24 gap-8 ${
          useTwoColumnLayout ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {showAssignmentSkeleton ? (
          <div className="card border border-base-200 bg-base-100 shadow-xl">
            <div className="card-body space-y-5 p-6">
              <div className="flex items-center gap-3 border-b border-base-200 pb-4">
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="space-y-2">
                  <div className="skeleton h-5 w-40"></div>
                  <div className="skeleton h-3 w-56 max-w-full"></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-12 w-full"></div>
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-12 w-full"></div>
                <div className="skeleton h-4 w-24"></div>
                <div className="skeleton h-28 w-full"></div>
                <div className="skeleton h-12 w-full"></div>
              </div>
            </div>
          </div>
        ) : showAssignmentForm ? (
          <div className="card border border-base-200 bg-base-100 shadow-xl">
            <div className="card-body p-6">
              <div className="mb-6 flex items-center justify-between border-b border-base-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15 text-warning">
                    <BrushCleaning className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="card-title text-xl font-bold tracking-tight">Assign Task</h2>
                    <p className="text-sm text-base-content/60">
                      Send a task and mobile notification to technicians.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="form-control w-full">
                  <label className="label" htmlFor="maintenance-toilet">
                    <span className="label-text font-medium text-base-content/80">
                      Toilet Unit
                    </span>
                  </label>
                  {devicesLoading ? (
                    <div className="skeleton h-12 w-full rounded-lg"></div>
                  ) : (
                    <select
                      id="maintenance-toilet"
                      className="select select-bordered w-full focus:border-warning focus:outline-none"
                      value={selectedToiletId}
                      onChange={(event) =>
                        setSelectedToiletId(event.target.value)
                      }
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
                  <label className="label" htmlFor="maintenance-message">
                    <span className="label-text font-medium text-base-content/80">
                      Task Description
                    </span>
                    <span className="label-text-alt text-base-content/50">
                      {message.length}/500
                    </span>
                  </label>
                  <textarea
                    id="maintenance-message"
                    className="textarea textarea-bordered min-h-28 w-full focus:border-warning focus:outline-none"
                    maxLength={500}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Describe maintenance or sanitation request..."
                  ></textarea>
                </div>

                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text font-medium text-base-content/80">
                      Assign To Personnel
                    </span>
                  </label>
                  {personnelLoading ? (
                    <div className="skeleton h-12 w-full rounded-lg"></div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                        <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-base-200">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-warning"
                            checked={assignedToIds.length === 0}
                            onChange={toggleAllAssignedToIds}
                          />
                          <span className="text-sm font-semibold">
                            All Maintenance Team (Broadcast)
                          </span>
                        </label>
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          {personnel.map((person) => (
                            <label
                              key={person.id}
                              className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-base-200"
                            >
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-warning mt-0.5"
                                checked={
                                  assignedToIds.length === 0 ||
                                  assignedToIds.includes(person.id)
                                }
                                onChange={() => toggleAssignedToId(person.id)}
                              />
                              <span className="min-w-0 text-sm">
                                <span className="block font-medium">
                                  {person.displayName}
                                </span>
                                {person.email ? (
                                  <span className="block truncate text-xs text-base-content/55">
                                    {person.email}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {personnelError && (
                        <label className="label">
                          <span className="label-text-alt text-error">
                            {personnelError}
                          </span>
                        </label>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-warning h-12 min-h-[48px] w-full shadow-sm font-semibold disabled:opacity-90"
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
                      <span className="loading loading-spinner loading-sm"></span>
                      Assigning Task...
                    </>
                  ) : (
                    <>
                      <BrushCleaning className="h-4 w-4" />
                      Dispatch Task
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-6 flex flex-col gap-4 border-b border-base-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="card-title text-xl font-bold tracking-tight">Maintenance Task Feed</h2>
                    <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-success">
                      Live
                    </span>
                  </div>
                  <p className="text-sm text-base-content/60">
                    Real-time status updates and technician acknowledgments.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-circle btn-sm"
                  onClick={() => void handleManualRefresh()}
                  title="Refresh tasks"
                  aria-label="Refresh tasks"
                >
                  <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>

                {canManageTasks ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1.5 shadow-sm"
                    onClick={openCreateTaskModal}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Task</span>
                  </button>
                ) : null}

                {tasksLoading ? (
                  <div className="skeleton h-8 w-24 rounded-full"></div>
                ) : !isForbiddenError ? (
                  <div className="badge badge-outline gap-1.5 px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                    Pending
                    <span className="font-bold text-warning">{pendingCount}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-base-200 bg-base-100 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="w-full space-y-3">
                        <div className="skeleton h-4 w-32"></div>
                        <div className="skeleton h-3 w-52 max-w-full"></div>
                        <div className="skeleton h-3 w-40"></div>
                      </div>
                      <div className="skeleton h-7 w-24 rounded-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : isForbiddenError ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 bg-base-200/30 px-6 py-12 text-center animate-fade-in">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-base-300/60 text-base-content/70 mb-3 shadow-inner">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-bold text-base-content">
                  Restricted Task Feed
                </h3>
                <p className="mt-1 max-w-md text-sm text-base-content/60">
                  Maintenance task scheduling and live acknowledgments are accessible to authorized technicians and administrators.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-base-content/50">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70"></span>
                  Role: {role || 'Standard Viewer'}
                </div>
              </div>
            ) : tasksError ? (
              <div className="rounded-xl border border-error/30 bg-error/10 p-5 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-error font-semibold text-sm">
                  <AlertCircle className="h-5 w-5" />
                  <span>Unable to load maintenance tasks</span>
                </div>
                <p className="text-xs text-base-content/70 max-w-md mx-auto">{tasksError}</p>
                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-error gap-1.5"
                  onClick={() => void refreshTasks()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Connection
                </button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/30 px-6 py-14 text-center text-base-content/60">
                <ClipboardList className="mx-auto h-10 w-10 opacity-30 mb-3" />
                <p className="font-semibold text-base">No tasks assigned yet</p>
                <p className="text-xs text-base-content/50 mt-1 max-w-sm mx-auto">
                  All toilet units are operating smoothly. Create a manual request or wait for automated maintenance triggers.
                </p>
                {canManageTasks && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary mt-4 gap-1.5"
                    onClick={openCreateTaskModal}
                  >
                    <Plus className="h-4 w-4" />
                    Create First Task
                  </button>
                )}
              </div>
            ) : (
              <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                {tasks.map((task) => {
                  const acknowledgementSummary = getAcknowledgementSummary(task);
                  const priority = getPriorityBadge(task.triggerType);
                  const statusInfo = getStatusBadge(task.status);

                  return (
                    <div
                      key={task.id}
                      className="group rounded-xl border border-base-200 bg-base-100 p-4 shadow-sm transition-all hover:border-base-300 hover:bg-base-200/20 hover:shadow"
                    >
                      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-xs text-base-content/80 bg-base-200 px-2 py-0.5 rounded-md">
                              {resolveDeviceLabel(task.deviceId)}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${priority.className}`}>
                              {priority.icon}
                              {priority.label}
                            </span>
                          </div>

                          <p className="mt-2.5 break-words text-sm font-medium text-base-content leading-relaxed">
                            {task.message || 'No message provided'}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-base-content/60">
                            <span className="flex items-center gap-1">
                              Assigned to{' '}
                              <span className="font-semibold text-base-content/80">
                                {resolveAssignedName(
                                  task.assignedTo,
                                  task.assignedToIds,
                                )}
                              </span>
                            </span>
                            <span>·</span>
                            <span>{formatRelativeTimestamp(task.createdAt)}</span>

                            {task.acknowledgedAt ? (
                              <>
                                <span>·</span>
                                <span className="text-sky-600 dark:text-sky-400">
                                  Ack {formatTimestamp(task.acknowledgedAt)}
                                </span>
                              </>
                            ) : null}

                            {getAcknowledgementProgress(task) ? (
                              <>
                                <span>·</span>
                                <span className="font-medium text-warning">
                                  {getAcknowledgementProgress(task)}
                                </span>
                              </>
                            ) : null}

                            {task.completedAt ? (
                              <>
                                <span>·</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Done {formatTimestamp(task.completedAt)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                          <div
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${statusInfo.className}`}
                          >
                            {statusInfo.icon}
                            <span>{statusInfo.label}</span>
                            {acknowledgementSummary ? (
                              <span className="ml-1 flex items-center gap-1">
                                <span className="text-[11px] font-bold">
                                  ({acknowledgementSummary.acknowledgedCount})
                                </span>
                                <span className="flex -space-x-1">
                                  {acknowledgementSummary.initials
                                    .slice(0, 3)
                                    .map((initials, index) => (
                                      <span
                                        key={`${task.id}-${initials}-${index}`}
                                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-base-100 px-0.5 text-[9px] font-black leading-none text-base-content shadow-xs ring-1 ring-base-300"
                                        title={initials}
                                      >
                                        {initials}
                                      </span>
                                    ))}
                                </span>
                              </span>
                            ) : null}
                          </div>

                          {canManageTasks ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content"
                                onClick={() => openEditTaskModal(task)}
                                title="Edit task"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-error/80 hover:bg-error/10 hover:text-error"
                                onClick={() => openDeleteTaskModal(task)}
                                title="Delete task"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── CREATE TASK MODAL ────────────────────────────────────── */}
      <dialog
        ref={createDialogRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box max-w-xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Create Maintenance Task
              </h3>
              <p className="text-xs text-slate-500">
                Dispatch a new task to technicians with custom priority
              </p>
            </div>
            <button
              type="button"
              onClick={closeCreateTaskModal}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label" htmlFor="modal-toilet">
                  <span className="label-text font-medium">Toilet Unit</span>
                </label>
                <select
                  id="modal-toilet"
                  className="select select-bordered w-full focus:border-primary focus:outline-none"
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
                <label className="label" htmlFor="modal-trigger">
                  <span className="label-text font-medium">Task Type / Priority</span>
                </label>
                <select
                  id="modal-trigger"
                  className="select select-bordered w-full focus:border-primary focus:outline-none"
                  value={modalTriggerType}
                  onChange={(e) => setModalTriggerType(e.target.value as TaskTriggerType)}
                >
                  <option value="manual">Manual Dispatch (Standard)</option>
                  <option value="maintenance">Scheduled PM (Critical)</option>
                  <option value="flush_count">Flush Threshold (High)</option>
                  <option value="uv_complete">UV Cycle Follow-up (High)</option>
                </select>
              </div>
            </div>

            <div className="form-control">
              <label className="label" htmlFor="modal-message">
                <span className="label-text font-medium">Task Message</span>
                <span className="label-text-alt text-base-content/50">{modalMessage.length}/500</span>
              </label>
              <textarea
                id="modal-message"
                className="textarea textarea-bordered min-h-24 w-full focus:border-primary focus:outline-none"
                maxLength={500}
                value={modalMessage}
                onChange={(e) => setModalMessage(e.target.value)}
                placeholder="Enter instructions for maintenance team..."
              ></textarea>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Assign To</span>
              </label>
              <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 max-h-48 overflow-y-auto">
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-base-200">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={modalAssignedToIds.length === 0}
                    onChange={toggleAllModalAssignedToIds}
                  />
                  <span className="text-sm font-semibold">
                    All maintenance team (Broadcast)
                  </span>
                </label>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {personnel.map((person) => (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-base-200"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary mt-0.5"
                        checked={
                          modalAssignedToIds.length === 0 ||
                          modalAssignedToIds.includes(person.id)
                        }
                        onChange={() => toggleModalAssignedToId(person.id)}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium">
                          {person.displayName}
                        </span>
                        {person.email ? (
                          <span className="block truncate text-xs text-base-content/55">
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

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px]"
              onClick={closeCreateTaskModal}
              disabled={taskAction === 'create'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary min-h-[48px] px-6 shadow-sm disabled:opacity-90"
              onClick={() => void handleCreateTaskFromModal()}
              disabled={taskAction === 'create' || !modalDeviceId || !modalMessage.trim()}
            >
              {taskAction === 'create' ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Creating...
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
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Confirm Task Assignment
              </h3>
              <p className="text-xs text-slate-500">
                Review task details before dispatching to maintenance personnel
              </p>
            </div>
            <button
              type="button"
              onClick={closeConfirmModal}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Send this task for{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedDeviceLabel}</span>?
            </p>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-800">
              <p className="text-slate-800 dark:text-slate-200 font-medium">{message}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Assigned to: <span className="font-semibold text-slate-700 dark:text-slate-300">{resolveAssignedName(null, assignedToIds)}</span>
              </p>
            </div>
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px]"
              onClick={closeConfirmModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-warning min-h-[48px] px-6 font-semibold shadow-sm disabled:opacity-90"
              onClick={() => void handleAssignTask()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Assigning...
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
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box max-w-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Edit Task
              </h3>
              <p className="text-xs text-slate-500">
                Update task description, target unit, or assignees
              </p>
            </div>
            <button
              type="button"
              onClick={closeEditTaskModal}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="space-y-4 py-4">
            <div className="form-control">
              <label className="label" htmlFor="edit-maintenance-toilet">
                <span className="label-text font-medium">Toilet Unit</span>
              </label>
              <select
                id="edit-maintenance-toilet"
                className="select select-bordered w-full focus:border-primary focus:outline-none"
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
              <label className="label" htmlFor="edit-maintenance-message">
                <span className="label-text font-medium">Message</span>
                <span className="label-text-alt text-base-content/50">
                  {editMessage.length}/500
                </span>
              </label>
              <textarea
                id="edit-maintenance-message"
                className="textarea textarea-bordered min-h-28 w-full focus:border-primary focus:outline-none"
                maxLength={500}
                value={editMessage}
                onChange={(event) => setEditMessage(event.target.value)}
              ></textarea>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Assign To</span>
              </label>
              <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 max-h-48 overflow-y-auto">
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-base-200">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={editAssignedToIds.length === 0}
                    onChange={toggleAllEditAssignedToIds}
                  />
                  <span className="text-sm font-semibold">
                    All maintenance team (Broadcast)
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
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked
                          onChange={() => toggleEditAssignedToId(userId)}
                        />
                        <span className="text-sm font-medium">
                          {resolveAssignedName(userId)}
                        </span>
                      </label>
                    ))}
                  {personnel.map((person) => (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-base-200"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary mt-0.5"
                        checked={
                          editAssignedToIds.length === 0 ||
                          editAssignedToIds.includes(person.id)
                        }
                        onChange={() => toggleEditAssignedToId(person.id)}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium">
                          {person.displayName}
                        </span>
                        {person.email ? (
                          <span className="block truncate text-xs text-base-content/55">
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
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px]"
              onClick={closeEditTaskModal}
              disabled={taskAction === 'edit'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary min-h-[48px] px-6 shadow-sm disabled:opacity-90"
              onClick={() => void handleUpdateTask()}
              disabled={taskAction === 'edit'}
            >
              {taskAction === 'edit' ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Saving...
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
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400">
                Delete Task
              </h3>
              <p className="text-xs text-slate-500">
                Remove task from maintenance dispatch queue
              </p>
            </div>
            <button
              type="button"
              onClick={closeDeleteTaskModal}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Are you sure you want to remove this task from the queue?
            </p>
            {deletingTask ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3.5 border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {resolveDeviceLabel(deletingTask.deviceId)}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                  {deletingTask.message}
                </p>
              </div>
            ) : null}
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost min-h-[48px]"
              onClick={closeDeleteTaskModal}
              disabled={taskAction === 'delete'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error min-h-[48px] px-6 text-white font-semibold shadow-sm disabled:opacity-90"
              onClick={() => void handleDeleteTask()}
              disabled={taskAction === 'delete'}
            >
              {taskAction === 'delete' ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Deleting...
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
