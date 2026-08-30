'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
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
  Search,
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
import { ToiletUnitSelect } from '@/components/dashboard/ToiletUnitSelect';
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
type FilterStatus = 'all' | 'pending' | 'acknowledged' | 'completed';
const NO_ASSIGNEES_VALUE = '__none_selected__';

function getDefaultMessage(deviceLabel: string): string {
  return `Manual maintenance requested for ${deviceLabel}.`;
}

function getPriorityBadge(
  triggerType?: TaskTriggerType,
  automationTrigger?: Task['automationTrigger'],
) {
  switch (triggerType) {
    case 'maintenance':
      return {
        label:
          automationTrigger === 'maintenance_due'
            ? 'Routine Toilet Check'
            : 'Scheduled Maintenance',
        className:
          'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30',
        icon: <Wrench className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'uv_complete':
      return {
        label: 'Sanitation Check',
        className:
          'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
        icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'flush_count':
      return {
        label: 'High Usage Check',
        className:
          'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30',
        icon: <Droplets className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'water_overuse':
      return {
        label: 'Water Overuse',
        className:
          'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30',
        icon: <Droplets className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'water_no_flow':
      return {
        label: 'No Water After Flush',
        className:
          'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30',
        icon: <Droplets className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'sensor_fault':
      return {
        label: 'Ultrasonic Sensor Fault',
        className:
          'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30',
        icon: <Wrench className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'manual':
    default:
      return {
        label: 'Standard Request',
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
  const searchParams = useSearchParams();
  const targetTaskId = searchParams?.get('taskId') ?? null;
  const { user, loading: authLoading } = useAuth();
  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    refreshTasks,
  } = useTasks();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [taskAction, setTaskAction] = useState<
    'edit' | 'delete' | 'create' | null
  >(null);

  // Filters & Search State
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const scrolledTaskIdRef = useRef<string | null>(null);

  // Auto-scroll and Messenger-style motion flash when targeted via query param
  useEffect(() => {
    if (!targetTaskId || tasksLoading || tasks.length === 0) {
      return;
    }

    if (scrolledTaskIdRef.current === targetTaskId) {
      return;
    }

    const targetTask = tasks.find((t) => t.id === targetTaskId);
    if (!targetTask) {
      return;
    }

    scrolledTaskIdRef.current = targetTaskId;

    // Ensure the targeted task is visible within the active tab/filter
    if (filterStatus !== 'all' && filterStatus !== targetTask.status) {
      setFilterStatus('all');
    }
    if (searchQuery.trim()) {
      setSearchQuery('');
    }

    // Trigger brief motion highlight
    setHighlightedTaskId(targetTaskId);

    // Smoothly scroll and center the targeted task in the viewport
    const scrollTimer = window.setTimeout(() => {
      const element = document.getElementById(`task-${targetTaskId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    // Fade out highlight animation naturally
    const clearTimer = window.setTimeout(() => {
      setHighlightedTaskId((current) =>
        current === targetTaskId ? null : current,
      );
    }, 1600);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [targetTaskId, tasksLoading, tasks, filterStatus, searchQuery]);

  // Drawer / Slide-Over Create Task State
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [modalDeviceId, setModalDeviceId] = useState('');
  const [modalTriggerType, setModalTriggerType] =
    useState<TaskTriggerType>('manual');
  const [modalMessage, setModalMessage] = useState('');
  const [modalAssignedToIds, setModalAssignedToIds] = useState<string[]>([]);

  // Edit / Delete State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [editToiletId, setEditToiletId] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editAssignedToIds, setEditAssignedToIds] = useState<string[]>([]);

  const [taskToast, setTaskToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);

  const editDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);

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
  } = useMaintenancePersonnel({
    enabled: canManageTasks,
  });

  const resolveDeviceLabel = (deviceId: string) =>
    devices.find((device) => device.id === deviceId)?.name || deviceId;

  // Toast auto-dismissal
  useEffect(() => {
    if (!taskToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTaskToast(null);
    }, 3600);

    return () => window.clearTimeout(timeoutId);
  }, [taskToast]);

  // Load User Role
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

  // Load Devices
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

  // Mounted state for portal rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on Escape key & manage body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCreateDrawerOpen && taskAction !== 'create') {
        setIsCreateDrawerOpen(false);
      }
    };

    if (isCreateDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreateDrawerOpen, taskAction]);

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

  // Filter & Stats calculation
  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const acknowledged = tasks.filter((t) => t.status === 'acknowledged').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    return { total, pending, acknowledged, completed };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterStatus !== 'all' && task.status !== filterStatus) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const deviceName = resolveDeviceLabel(task.deviceId).toLowerCase();
        const msg = (task.message || '').toLowerCase();
        const assignee = resolveAssignedName(
          task.assignedTo,
          task.assignedToIds,
        ).toLowerCase();
        return (
          deviceName.includes(q) || msg.includes(q) || assignee.includes(q)
        );
      }

      return true;
    });
  }, [tasks, filterStatus, searchQuery, devices, personnelById]);

  // Drawer assignees toggle
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

  // Edit modal assignees toggle
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

  // Open & Close Slide-Over Drawer
  const openCreateDrawer = () => {
    const initialDeviceId = devices[0]?.id || '';
    setModalDeviceId(initialDeviceId);
    setModalTriggerType('manual');
    setModalMessage(
      getDefaultMessage(resolveDeviceLabel(initialDeviceId)),
    );
    setModalAssignedToIds([]);
    setIsCreateDrawerOpen(true);
  };

  const closeCreateDrawer = () => {
    setIsCreateDrawerOpen(false);
  };

  // Create Task Handler
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

      closeCreateDrawer();
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

  // Edit Task Handlers
  const openEditTaskModal = (task: Task) => {
    const isSupervisorOnlyUnassigned =
      task.status === 'unassigned' && task.requiresSupervisorAssignment === true;
    if (task.status !== 'pending' && !isSupervisorOnlyUnassigned) {
      setTaskToast({
        kind: 'error',
        message:
          'Only pending tasks and supervisor-only unassigned tasks can be edited.',
      });
      return;
    }
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

  // Delete Task Handlers
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
        aria-label="Maintenance Operations & Live Task Feed"
        className="w-full"
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95"
          role="region"
          aria-label="Maintenance Operations Feed"
        >
          {/* Top Primary Accent Glow */}
          <div
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-rose-500 to-amber-500 opacity-90"
            aria-hidden="true"
          />

          {/* ── HEADER ──────────────────────────────────────────────── */}
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/20 dark:text-rose-400 shadow-xs">
                <ClipboardList className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Maintenance Task Operations
                  </h2>
                  <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Live Feed
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dispatch cleaning and repair tasks, track technician status, and monitor response times.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Quick Live Metric Badges */}
              {!tasksLoading && !isForbiddenError && (
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending:</span>
                    <span className="font-bold tabular-nums">{stats.pending}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-800 dark:text-sky-300">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Ack:</span>
                    <span className="font-bold tabular-nums">{stats.acknowledged}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Done:</span>
                    <span className="font-bold tabular-nums">{stats.completed}</span>
                  </span>
                </div>
              )}

              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => void handleManualRefresh()}
                title="Refresh tasks"
                aria-label="Refresh tasks"
              >
                <RotateCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {canManageTasks && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-sdca-darkred focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary transition-all active:translate-y-0.5 min-h-[40px] whitespace-nowrap"
                  onClick={openCreateDrawer}
                >
                  <span>Dispatch Task</span>
                </button>
              )}
            </div>
          </div>

          {/* ── FILTER & SEARCH BAR ──────────────────────────────────── */}
          {!tasksLoading && !isForbiddenError && tasks.length > 0 && (
            <div className="mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                    filterStatus === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  All ({stats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('pending')}
                  className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                    filterStatus === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  Pending ({stats.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('acknowledged')}
                  className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                    filterStatus === 'acknowledged'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'
                  }`}
                >
                  Acknowledged ({stats.acknowledged})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('completed')}
                  className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                    filterStatus === 'completed'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                  }`}
                >
                  Completed ({stats.completed})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[220px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search unit, message, or staff..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {/* ── FEED CONTENT LIST ────────────────────────────────────── */}
          {tasksLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 dark:border-slate-800/80 dark:bg-slate-800/40"
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
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800/40">
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
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
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
                  onClick={openCreateDrawer}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Create First Task</span>
                </button>
              )}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 px-6 py-10 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
              <p className="font-medium text-sm text-slate-700 dark:text-slate-300">
                No tasks matching the selected filter or search
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('all');
                  setSearchQuery('');
                }}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div
              className="max-h-[38rem] space-y-3 overflow-y-auto pr-1"
              aria-live="polite"
            >
              {filteredTasks.map((task) => {
                const acknowledgementSummary = getAcknowledgementSummary(task);
                const priority = getPriorityBadge(
                  task.triggerType,
                  task.automationTrigger,
                );
                const statusInfo = getStatusBadge(task.status);
                const isHighlighted = highlightedTaskId === task.id;
                const requiresSupervisorAssignment =
                  task.status === 'unassigned' &&
                  task.requiresSupervisorAssignment === true;

                return (
                  <div
                    key={task.id}
                    id={`task-${task.id}`}
                    className={`group rounded-xl border p-4.5 transition-all duration-700 ease-out ${
                      isHighlighted
                        ? 'border-rose-400 bg-rose-50/80 shadow-lg ring-2 ring-primary/80 ring-offset-2 scale-[1.01] dark:border-rose-500 dark:bg-rose-950/40 dark:ring-offset-slate-900'
                        : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:bg-slate-50/50 hover:shadow dark:border-slate-800/90 dark:bg-slate-800/60 dark:hover:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {/* Header Row: Location, Priority, and Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          {resolveDeviceLabel(task.deviceId)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${priority.className}`}
                        >
                          {priority.icon}
                          <span>{priority.label}</span>
                        </span>
                        {requiresSupervisorAssignment ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Unassigned — supervisor action required</span>
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
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

                    {/* Body: Message text */}
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

                        {requiresSupervisorAssignment ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap font-semibold text-violet-700 dark:text-violet-300">
                              Retry {task.autoAssignmentEligibleAt
                                ? formatTimestamp(task.autoAssignmentEligibleAt)
                                : 'pending'}
                            </span>
                          </>
                        ) : null}

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
                          {(task.status === 'pending' || requiresSupervisorAssignment) && (
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-primary min-h-[30px]"
                              onClick={() => openEditTaskModal(task)}
                              title={requiresSupervisorAssignment ? 'Assign task' : 'Edit task'}
                              aria-label={`${requiresSupervisorAssignment ? 'Assign' : 'Edit'} task for ${resolveDeviceLabel(task.deviceId)}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{requiresSupervisorAssignment ? 'Assign' : 'Edit'}</span>
                            </button>
                          )}
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

      {/* ── SLIDE-OVER CREATE / DISPATCH TASK DRAWER ──────────────── */}
      {mounted &&
        createPortal(
          <div
            className={`fixed inset-0 z-[100] transition-all duration-300 ${
              isCreateDrawerOpen
                ? 'visible pointer-events-auto'
                : 'invisible pointer-events-none'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slideover-task-title"
          >
            {/* Backdrop */}
            <div
              className={`fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 ${
                isCreateDrawerOpen ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={() => {
                if (taskAction !== 'create') closeCreateDrawer();
              }}
              aria-hidden="true"
            />

            {/* Drawer Container */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 z-[101]">
              <div
                className={`w-screen max-w-lg transform bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
                  isCreateDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-rose-400 border border-primary/20">
                      <BrushCleaning className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3
                        id="slideover-task-title"
                        className="text-lg font-bold text-slate-900 dark:text-slate-100"
                      >
                        Dispatch Maintenance Task
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Send real-time alerts and mobile push to technicians
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeCreateDrawer}
                    disabled={taskAction === 'create'}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Close drawer"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Drawer Form Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Unit Target */}
                  <div className="form-control">
                    <label
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      htmlFor="drawer-toilet"
                    >
                      Toilet Unit Target
                    </label>
                    <ToiletUnitSelect
                      id="drawer-toilet"
                      value={modalDeviceId}
                      onChange={setModalDeviceId}
                      devices={devices}
                      loading={devicesLoading}
                      accentColor="primary"
                      ariaLabel="Select Toilet Unit Target"
                    />
                  </div>

                  {/* Priority & Category */}
                  <div className="form-control">
                    <label
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      htmlFor="drawer-trigger"
                    >
                      Task Priority & Category
                    </label>
                    <select
                      id="drawer-trigger"
                      className="select select-bordered w-full rounded-xl border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
                      value={modalTriggerType}
                      onChange={(e) =>
                        setModalTriggerType(e.target.value as TaskTriggerType)
                      }
                    >
                      <option value="manual">Standard Request (Manual Dispatch)</option>
                      <option value="maintenance">Scheduled Maintenance (High Priority)</option>
                      <option value="flush_count">High Usage / Frequent Flush Check</option>
                      <option value="uv_complete">Sanitation & UV Inspection</option>
                    </select>
                  </div>

                  {/* Task Instructions */}
                  <div className="form-control">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                        htmlFor="drawer-message"
                      >
                        Task Instructions
                      </label>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {modalMessage.length}/500
                      </span>
                    </div>
                    <textarea
                      id="drawer-message"
                      className="textarea textarea-bordered min-h-28 w-full rounded-xl border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      maxLength={500}
                      value={modalMessage}
                      onChange={(e) => setModalMessage(e.target.value)}
                      placeholder="Describe maintenance or sanitation request..."
                    />
                  </div>

                  {/* Assign To Personnel */}
                  <div className="form-control">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Assign To Personnel
                    </span>
                    {personnelLoading ? (
                      <div className="skeleton h-12 w-full rounded-xl"></div>
                    ) : (
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/40">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors">
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
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {personnel.map((person) => {
                            const initials = getInitials(
                              person.displayName || person.email || person.id,
                            );
                            const isChecked =
                              modalAssignedToIds.length === 0 ||
                              modalAssignedToIds.includes(person.id);

                            return (
                              <label
                                key={person.id}
                                className="flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-sm checkbox-primary mt-0.5 rounded-md"
                                  checked={isChecked}
                                  onChange={() => toggleModalAssignedToId(person.id)}
                                  aria-label={`Assign to ${person.displayName || person.email || person.id}`}
                                />
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary dark:bg-primary/25 dark:text-rose-300"
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
                    )}
                  </div>
                </div>

                {/* Drawer Sticky Footer */}
                <div className="p-4 sm:p-6 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/50 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[44px] rounded-xl px-5 text-slate-600 dark:text-slate-400 font-medium"
                    onClick={closeCreateDrawer}
                    disabled={taskAction === 'create'}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="action-btn-primary min-h-[44px] px-6 font-semibold shadow-sm disabled:opacity-50"
                    onClick={() => void handleCreateTaskFromModal()}
                    disabled={
                      taskAction === 'create' ||
                      !modalDeviceId ||
                      !modalMessage.trim() ||
                      devicesLoading ||
                      devices.length === 0
                    }
                  >
                    {taskAction === 'create' ? (
                      <>
                        <span
                          className="loading loading-spinner loading-sm"
                          aria-hidden="true"
                        />
                        <span>Dispatching...</span>
                      </>
                    ) : (
                      <span>Create &amp; Dispatch</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
              <ToiletUnitSelect
                id="edit-maintenance-toilet"
                value={editToiletId}
                onChange={setEditToiletId}
                devices={devices}
                loading={devicesLoading}
                accentColor="primary"
                ariaLabel="Select Toilet Unit"
              />
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
                className="textarea textarea-bordered min-h-24 w-full rounded-xl border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                maxLength={500}
                value={editMessage}
                onChange={(event) => setEditMessage(event.target.value)}
              ></textarea>
            </div>

            <div className="form-control">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Assign To
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
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
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/60">
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
