'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { BrushCleaning, ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useTasks } from '@/hooks/useTasks';
import { DashboardToast } from '@/components/dashboard/DashboardToast';
import { apiFetch } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-utils';
import { db } from '@/lib/firebase';
import type { Device, Task } from '@/types';

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

function formatDeviceLabel(device: Device): string {
  if (device.name && device.name !== device.id) {
    return `${device.name} (${device.id})`;
  }

  return device.name || device.id;
}

function getDefaultMessage(deviceLabel: string): string {
  return `Manual maintenance requested for ${deviceLabel}.`;
}

function getStatusBadgeClassName(status: Task['status']): string {
  switch (status) {
    case 'acknowledged':
      return 'badge-info text-info-content';
    case 'completed':
      return 'badge-success text-success-content';
    case 'pending':
    default:
      return 'badge-warning text-warning-content';
  }
}

function getStatusLabel(status: Task['status']): string {
  switch (status) {
    case 'acknowledged':
      return 'Acknowledged';
    case 'completed':
      return 'Completed';
    case 'pending':
    default:
      return 'Pending';
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
  const [assignedTo, setAssignedTo] = useState('');
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskAction, setTaskAction] = useState<
    'edit' | 'delete' | null
  >(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [editToiletId, setEditToiletId] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [taskToast, setTaskToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const editDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const previousDefaultMessageRef = useRef('');

  const showAssignmentForm = role === 'admin';
  const showAssignmentSkeleton = roleLoading;
  const canManageTasks = role !== null && role !== 'viewer';
  const {
    personnel,
    personnelById,
    loading: personnelLoading,
    error: personnelError,
  } = useMaintenancePersonnel({ enabled: showAssignmentForm });

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

      if (!user || role !== 'admin') {
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
        }
      } catch (error) {
        console.warn('[MaintenanceTaskPanel] device lookup failed:', error);
        if (!cancelled) {
          setDevices([]);
          setSelectedToiletId('');
          setTaskToast({
            kind: 'error',
            message: getErrorMessage(error) ?? 'Failed to load toilet units',
          });
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
  }, [authLoading, role, roleLoading, user]);

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

  const resolveAssignedName = (assignedUserId?: string | null) => {
    if (!assignedUserId) {
      return 'All maintenance team';
    }

    if (personnelLoading) {
      return 'Loading staff...';
    }

    return personnelById[assignedUserId]?.displayName ?? assignedUserId;
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

    confirmDialogRef.current?.showModal();
  };

  const closeConfirmModal = () => {
    confirmDialogRef.current?.close();
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

    setIsSubmitting(true);

    try {
      await apiFetch<CreateTaskResponse>('/api/tasks', user, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: selectedToiletId,
          triggerType: 'manual',
          message: trimmedMessage,
          assignedTo: assignedTo || null,
        }),
      });

      closeConfirmModal();
      setMessage(defaultMessage);
      setAssignedTo('');
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
    setEditAssignedTo(task.assignedTo ?? '');
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

    setTaskAction('edit');

    try {
      await apiFetch<UpdateTaskResponse>(`/api/tasks/${editingTask.id}`, user, {
        method: 'PATCH',
        body: JSON.stringify({
          deviceId: editToiletId,
          message: trimmedMessage,
          assignedTo: editAssignedTo || null,
        }),
      });

      closeEditTaskModal();
      setEditingTask(null);
      await refreshTasks();
      setTaskToast({
        kind: 'success',
        message: 'Task updated',
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
        message: 'Task deleted',
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
              <div className="mb-6 flex items-center gap-3 border-b border-base-200 pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <BrushCleaning className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="card-title text-xl">Assign Task</h2>
                  <p className="text-sm text-base-content/60">
                    Send a task and notification to the maintenance team.
                  </p>
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
                    <div className="skeleton h-12 w-full"></div>
                  ) : (
                    <select
                      id="maintenance-toilet"
                      className="select select-bordered w-full"
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
                            {formatDeviceLabel(device)}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                <div className="form-control w-full">
                  <label className="label" htmlFor="maintenance-message">
                    <span className="label-text font-medium text-base-content/80">
                      Message
                    </span>
                    <span className="label-text-alt text-base-content/50">
                      {message.length}/500
                    </span>
                  </label>
                  <textarea
                    id="maintenance-message"
                    className="textarea textarea-bordered min-h-28 w-full"
                    maxLength={500}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  ></textarea>
                </div>

                <div className="form-control w-full">
                  <label className="label" htmlFor="maintenance-assignee">
                    <span className="label-text font-medium text-base-content/80">
                      Assign To
                    </span>
                  </label>
                  {personnelLoading ? (
                    <div className="skeleton h-12 w-full"></div>
                  ) : (
                    <>
                      <select
                        id="maintenance-assignee"
                        className="select select-bordered w-full"
                        value={assignedTo}
                        onChange={(event) => setAssignedTo(event.target.value)}
                      >
                        <option value="">All maintenance team</option>
                        {personnel.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                            {person.email ? ` (${person.email})` : ''}
                          </option>
                        ))}
                      </select>
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
                  className="btn btn-warning h-12 w-full"
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
                      Assign Task
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
                    <h2 className="card-title text-xl">Live Task Feed</h2>
                    <span className="relative flex h-3 w-3 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-success">
                      Live
                    </span>
                  </div>
                  <p className="text-sm text-base-content/60">
                    Real-time maintenance tasks and acknowledgments.
                  </p>
                </div>
              </div>

              {tasksLoading ? (
                <div className="skeleton h-8 w-24 rounded-full"></div>
              ) : (
                <div className="badge badge-outline gap-2 px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                  Pending
                  <span className="font-bold text-warning">{pendingCount}</span>
                </div>
              )}
            </div>

            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-base-200 bg-base-100 p-4"
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
            ) : tasksError ? (
              <div className="alert alert-error">
                <span>{tasksError}</span>
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-base-300 bg-base-200/30 px-6 py-12 text-center text-base-content/55">
                <p className="font-medium">No tasks assigned yet</p>
              </div>
            ) : (
              <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="animate-fade-in-down rounded-lg border border-base-200 bg-base-100 p-4 shadow-sm transition-colors hover:bg-base-200/30"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-base-content/50">
                            {task.deviceId}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm font-semibold text-base-content">
                          {task.message || 'No message provided'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-base-content/60">
                          <span>
                            Assigned to{' '}
                            <span className="font-semibold text-base-content/75">
                              {resolveAssignedName(task.assignedTo)}
                            </span>
                          </span>
                          <span>{formatRelativeTimestamp(task.createdAt)}</span>
                          {task.acknowledgedAt ? (
                            <span>
                              Acknowledged{' '}
                              {formatTimestamp(task.acknowledgedAt)}
                            </span>
                          ) : null}
                          {task.completedAt ? (
                            <span>
                              Completed {formatTimestamp(task.completedAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <div
                          className={`badge gap-1 border-0 px-3 py-3 font-semibold ${getStatusBadgeClassName(
                            task.status,
                          )}`}
                        >
                          {getStatusLabel(task.status)}
                        </div>

                        {canManageTasks ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => openEditTaskModal(task)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                              onClick={() => openDeleteTaskModal(task)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <dialog
        ref={confirmDialogRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold text-warning">
            <BrushCleaning className="h-5 w-5" />
            Confirm Task Assignment
          </h3>
          <div className="space-y-3 py-4 text-sm">
            <p>
              Send this task for{' '}
              <span className="font-semibold">{selectedDeviceLabel}</span>?
            </p>
            <div className="rounded-lg bg-base-200 p-3">
              <p className="text-base-content/70">{message}</p>
              <p className="mt-2 text-xs text-base-content/60">
                Assigned to {resolveAssignedName(assignedTo)}
              </p>
            </div>
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeConfirmModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-warning"
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

      <dialog
        ref={editDialogRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box max-w-2xl">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Pencil className="h-5 w-5" />
            Edit Task
          </h3>
          <div className="space-y-4 py-4">
            <div className="form-control">
              <label className="label" htmlFor="edit-maintenance-toilet">
                <span className="label-text font-medium">Toilet Unit</span>
              </label>
              <select
                id="edit-maintenance-toilet"
                className="select select-bordered w-full"
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
                className="textarea textarea-bordered min-h-28 w-full"
                maxLength={500}
                value={editMessage}
                onChange={(event) => setEditMessage(event.target.value)}
              ></textarea>
            </div>

            <div className="form-control">
              <label className="label" htmlFor="edit-maintenance-assignee">
                <span className="label-text font-medium">Assign To</span>
              </label>
              <select
                id="edit-maintenance-assignee"
                className="select select-bordered w-full"
                value={editAssignedTo}
                onChange={(event) => setEditAssignedTo(event.target.value)}
              >
                <option value="">All maintenance team</option>
                {editAssignedTo &&
                !personnel.some((person) => person.id === editAssignedTo) ? (
                  <option value={editAssignedTo}>
                    {resolveAssignedName(editAssignedTo)}
                  </option>
                ) : null}
                {personnel.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                    {person.email ? ` (${person.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeEditTaskModal}
              disabled={taskAction === 'edit'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
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

      <dialog
        ref={deleteDialogRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold text-error">
            <Trash2 className="h-5 w-5" />
            Delete Task
          </h3>
          <div className="space-y-3 py-4 text-sm">
            <p>
              Delete this task from the dashboard and cleaner mobile inbox?
            </p>
            {deletingTask ? (
              <div className="rounded-lg bg-base-200 p-3">
                <div className="font-semibold">{deletingTask.deviceId}</div>
                <p className="mt-1 text-base-content/70">
                  {deletingTask.message}
                </p>
              </div>
            ) : null}
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeDeleteTaskModal}
              disabled={taskAction === 'delete'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
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
